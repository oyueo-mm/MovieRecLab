#!/usr/bin/env python3
"""V13 bounded offline experiment; no user rows or models exported."""
import os,sys,json,time,math,itertools,tempfile,zipfile,pathlib,resource
from collections import defaultdict
import numpy as np
from scipy import sparse
from sklearn.decomposition import NMF
import benchmark_v10 as v10
import benchmark_v11 as v11
import train_ml25m as base

SEED=20261116
PROTOS=("A","B","C","D")
REPEATS=5
KS=(5,10,20,50)
DEPTH=50
BOOT=2000
COUNTS=tuple(range(3,21))+(25,30,40,50,75,100)

def cases(history,n,uid):
    h=sorted(history,key=lambda r:(r[2],r[0]))
    m=max(3,len(h)//5)
    if len(h)-m<n:return
    old,future=h[:-m],h[-m:]
    yield 0,0,h[:n],future
    for r in range(REPEATS):
        rng=np.random.default_rng(np.random.SeedSequence([SEED,uid,n,r]))
        p=rng.permutation(len(old))[:n]
        yield 1,r,[old[i] for i in sorted(p)],future
        p=rng.permutation(len(h)-n)[:m]+n
        yield 2,r,h[:n],[h[i] for i in p]
        p=rng.permutation(len(h))
        yield 3,r,[h[i] for i in sorted(p[:n])],[h[i] for i in p[n:n+m]]

def selftest():
    h=[(i,5,i) for i in range(100)]
    a=list(cases(h,10,1))
    assert len(a)==1+3*REPEATS and a==list(cases(h,10,1))
    for p,r,x,y in a:
        assert len(x)==10 and len(y)==20 and not set(x)&set(y)
        if p in (0,2):assert x==h[:10]
        if p in (0,1):assert y==h[-20:]
        if p!=3:assert max(z[2] for z in x)<min(z[2] for z in y)
    u=np.arange(100)
    assert rank(np.zeros(100),{0,1},u>=0).tolist()==list(range(2,52))
    assert fuse([np.array([1,2]),np.array([2,4])],[.5,.5],"rrf",10).tolist()==[2,1,4]
    print("V13 split/rank/fusion self-test passed")

def rank(scores,seen,allowed):
    ids=np.flatnonzero(allowed)
    ids=ids[~np.isin(ids,list(seen))]
    s=np.nan_to_num(np.asarray(scores)[ids],nan=-np.inf)
    if len(ids)>DEPTH:
        threshold=np.partition(s,len(s)-DEPTH)[len(s)-DEPTH]
        better=np.flatnonzero(s>threshold)
        tied=np.flatnonzero(s==threshold)[:DEPTH-len(better)]
        pos=np.concatenate((better,tied))
        ids,s=ids[pos],s[pos]
    return ids[np.lexsort((ids,-s))][:DEPTH].astype(np.int32)

def fuse(ranks,weights,method,k):
    merged=defaultdict(float)
    for arr,w in zip(ranks,weights):
        for i,item in enumerate(arr):
            merged[int(item)]+=w/(k+i+1) if method=="rrf" else w*(DEPTH-i)/DEPTH
    return np.array(sorted(merged,key=lambda x:(-merged[x],x))[:DEPTH],dtype=np.int32)

def metrics(ranked,truth,genre,pop):
    out=[]
    for k in KS:
        rr=ranked[:k];hits=np.array([int(i) in truth for i in rr],dtype=bool)
        pos=np.flatnonzero(hits);dcg=float(np.sum(1/np.log2(pos+2)))
        ideal=float(np.sum(1/np.log2(np.arange(min(k,len(truth)))+2)))
        g=genre[rr]
        # Cosine distance between available genre vectors; missing metadata excluded.
        g=g[np.linalg.norm(g,axis=1)>0]
        div=float(np.mean(1-(g@g.T)[np.triu_indices(len(g),1)])) if len(g)>=2 else 0.
        novelty=float(np.mean(-np.log2(pop[rr]))) if len(rr) else 0.
        out.append([dcg/ideal if ideal else 0.,len(pos)/len(truth) if truth else 0.,len(pos)/k,float(bool(len(pos))),1/(int(pos[0])+1) if len(pos) else 0.,div,novelty])
    return np.asarray(out,dtype=np.float32)

def summarize(samples,policy,genre,pop,phase):
    by=defaultdict(list);coverage=defaultdict(set);empty=defaultdict(list);groups=defaultdict(list)
    for uid,p,r,truth,rankings,group in samples:
        rr=rankings[policy] if isinstance(policy,str) else fuse([rankings[m] for m in policy[1]],policy[2],policy[3],policy[4])
        a=metrics(rr,truth,genre,pop)
        by[(uid,p)].append(a);empty[p].append(not truth)
        for k in KS:coverage[(p,r,k)].update(int(i) for i in rr[:k])
        groups[(group,p)].append(float(a[1,0]))
    users=sorted({u for u,p in by})
    if not users:raise ValueError("No eligible "+phase+" users")
    a=np.array([[np.mean(by[(u,p)],axis=0) for p in range(4)] for u in users],dtype=np.float64)
    obj=a[:,:,1,0].mean(axis=1)
    out={"n":len(users),"objective_ndcg10":float(obj.mean()),"protocols":{},"profile_groups":{}}
    for p,name in enumerate(PROTOS):
        mm=a[:,p].mean(axis=0)
        out["protocols"][name]={"empty_truth_rate":float(np.mean(empty[p])),"metrics":{str(k):dict(zip(("ndcg","recall","precision","hit","mrr","genre_diversity","novelty_bits"),map(float,mm[j])))|{"coverage":float(np.mean([len(v) for (pp,r,kk),v in coverage.items() if pp==p and kk==k]))} for j,k in enumerate(KS)}}
    for (g,p),vals in groups.items():out["profile_groups"].setdefault(g,{})[PROTOS[p]]={"case_count":len(vals),"ndcg10":float(np.mean(vals))}
    return out,obj

def ci(d):
    rng=np.random.default_rng(SEED)
    z=d[rng.integers(0,len(d),(BOOT,len(d)))].mean(axis=1)
    return np.quantile(z,[.025,.975]).tolist()

def sample_users(mat,budget):
    if budget<=0:return mat
    counts=np.diff(mat.indptr)
    u=np.random.default_rng(SEED).permutation(np.flatnonzero(counts))
    stop=np.searchsorted(np.cumsum(counts[u]),budget,side="left")+1
    # Nested deterministic whole-user subsets; exact sizes need not equal budget.
    return mat[u[:stop]].tocsr()

def train_models(mat,genome,valid,genre,full):
    started=time.monotonic();timings={};failures={}
    def load(name,fn,required=False):
        t=time.monotonic()
        try:
            value=fn();timings[name]=round(time.monotonic()-t,2);return value
        except Exception as e:
            failures[name]=repr(e);print("MODEL FAILED",name,repr(e),flush=True)
            if required:raise
            return None
    item,tag,_,_,usage,_=load("svd-tag",lambda:base.train(genome,valid,mat),True)
    graph=load("item-knn",lambda:v10.build_item_knn(mat,usage),True)
    v10.TOP_EASE=1200
    ease=load("ease-1200",lambda:v10.build_ease(mat,usage),True)
    v10.TOP_EASE=3000
    ease3=load("ease-3000",lambda:v10.build_ease(mat,usage)) if full else None
    ab=load("als-bpr",lambda:v10.build_implicit_models(mat))
    i2v=load("item2vec",lambda:v10.build_item2vec(mat))
    nmf=load("implicit-nmf16",lambda:v10.cosine(NMF(n_components=16,init="nndsvda",solver="mu",max_iter=12,random_state=SEED).fit(mat).components_.T)) if full else None
    # Nonnegative elastic-net SLIM objective, projected proximal gradient on a bounded catalog.
    def slim_fit():
        ids=np.argsort(-usage)[:600];x=mat[:,ids].astype(np.float64)
        gram=(x.T@x).toarray();diag=np.diag(gram).copy()
        # Scale by column norms before fitting, keep a zero diagonal.
        scale=np.sqrt(np.maximum(diag,1));g=gram/(scale[:,None]*scale[None,:])
        L=np.max(np.sum(np.abs(g),axis=1))+.05
        w=np.zeros_like(g)
        for _ in range(60):
            w=np.maximum(0,w-(g@w-g+.05*w+.002)/L);np.fill_diagonal(w,0)
        return ids.astype(np.int32),w.astype(np.float32)
    slim=load("slim-prox-600",slim_fit) if full else None
    # Directional association rule confidence with shrinkage on the existing graph edges.
    def rules_fit():
        joint=(mat.T@mat).tocsr();joint.setdiag(0);joint.eliminate_zeros()
        vals=joint.data.astype(np.float32)
        row=np.repeat(np.arange(len(usage)),np.diff(joint.indptr))
        vals=vals/np.maximum(1,usage[row])*vals/(vals+20)
        joint.data=vals
        return joint
    rules=load("association-confidence",rules_fit) if full else None
    counts=np.asarray(mat.sum(axis=1)).reshape(-1)
    csc=mat.tocsc()
    pop=np.log1p(usage);pop/=max(1e-8,float(pop.max()))
    frozen=json.loads(pathlib.Path("showcase/v11-benchmark.json").read_text())["selection"]
    def user_knn(prof,shrink=3,min_common=2,k=140):
        liked=[i for i,r in prof if r>=4]
        if not liked:return np.zeros(len(usage),np.float32)
        overlap=np.asarray(csc[:,liked].sum(axis=1),dtype=np.float32).reshape(-1)
        s=overlap/np.sqrt(np.maximum(1,counts)*len(liked))*overlap/(overlap+shrink)
        s[overlap<min_common]=0
        top=np.argpartition(-s,min(k,len(s)-1))[:k];top=top[s[top]>0]
        if not len(top):return np.zeros(len(usage),np.float32)
        return np.asarray(s[top]@mat[top],dtype=np.float32).reshape(-1)/max(1e-8,float(sum(s[top])))
    def scoring(prof,n):
        anchors=[i for i,r in prof if r!=3]
        weights=np.array([np.clip((r-3)/2,-1,1) for i,r in prof if r!=3],np.float32)
        svd=v10.dot_score(item,anchors,weights);ts=v10.dot_score(tag,anchors,weights)
        knn=v10.score_itemknn(graph,prof,len(usage));old=.2*ts+.2*svd+.6*pop
        raw=.52*old+.48*knn
        p=frozen[str(max(k for k in (3,5,10,20,50,100) if k<=n))]
        if p["accepted"]:
            adj=v11.transform(prof,p["negativeScale"]);adaptive=(1-p["gamma"])*pop+p["gamma"]*(.52*v10.v9_scores(item,tag,usage,adj)+.48*v10.score_itemknn(graph,adj,len(usage)))
        else:adaptive=raw
        content=v10.dot_score(genre,anchors,weights)
        d={"popular":pop,"svd":svd,"tag-only":ts,"genre-content":content,"v9-tag":old,"item-knn":knn,"tag+item-knn":raw,"v11-frozen":adaptive,"user-knn":user_knn(prof),"ease-1200":v10.score_ease(ease,prof,len(usage))}
        if ease3 is not None:d["ease-3000"]=v10.score_ease(ease3,prof,len(usage))
        if ab is not None:
            d["als"]=v10.dot_score(ab[0],anchors,weights);d["bpr"]=v10.dot_score(ab[1],anchors,weights);d["tag+als"]=.52*old+.48*d["als"]
        if i2v is not None:
            d["item2vec"]=v10.dot_score(i2v,anchors,weights);d["tag+item2vec"]=.52*old+.48*d["item2vec"]
        if nmf is not None:d["implicit-nmf16"]=v10.dot_score(nmf,anchors,weights)
        if slim is not None:d["slim-prox-600"]=v10.score_ease(slim,prof,len(usage))
        if rules is not None:d["association-confidence"]=v10.score_itemknn(rules,prof,len(usage))
        if full:
            d["user-knn-common1"]=user_knn(prof,10,1,80)
            for neg in (.0,.5):
                w=np.where(weights<0,weights*neg,weights)
                d["svd-neg-"+str(neg)]=v10.dot_score(item,anchors,w)
                d["tag-neg-"+str(neg)]=v10.dot_score(tag,anchors,w)
            if len(anchors):
                w=weights*np.geomspace(.25,1,len(anchors))
                d["svd-recency-order"]=v10.dot_score(item,anchors,w)
            else:d["svd-recency-order"]=svd
            for mix in (.25,.5,.75):d["tag-knn-pop-"+str(mix)]=mix*(.5*ts+.5*knn)+(1-mix)*pop
            d["genre+knn"]=.5*content+.5*knn
        return d
    return scoring,usage,timings,failures

def collect(held,phase,n,scoring,allowed):
    results=[];times=defaultdict(list)
    for j,(uid,h) in enumerate(sorted(held.items())):
        if (uid%2==0)!=(phase=="validation"):continue
        cache={}
        for p,r,x,y in cases(h,n,uid):
            profile=tuple((i,v) for i,v,t in x);seen={i for i,v in profile}
            truth={i for i,v,t in y if v>=4 and allowed[i]}
            if profile not in cache:
                start=time.monotonic();d=scoring(profile,n)
                cache[profile]={m:rank(s,seen,allowed) for m,s in d.items()}
                times["all-models"].append(time.monotonic()-start)
            group="mostly-positive" if sum(v>=4 for i,v in profile)/n>=.7 else "mixed-feedback"
            results.append((uid,p,r,truth,cache[profile],group))
        if j%50==0:print(phase,n,j,"of",len(held),flush=True)
    return results,{k:{"median_ms":float(np.median(v)*1000),"p95_ms":float(np.quantile(v,.95)*1000)} for k,v in times.items()}

def search_policies(names,shortlist):
    for n in names:yield n
    for a,b in itertools.combinations(shortlist,2):
        for w in (.25,.5,.75):
            for mode,k in (("rrf",20),("rrf",60),("borda",20)):
                yield (mode+":"+a+"+"+b+":"+str(w)+":"+str(k),(a,b),(w,1-w),mode,k)
    if len(shortlist)>=3:yield ("rrf:top3",tuple(shortlist[:3]),(1/3,)*3,"rrf",20)

def run(budget,counts):
    start=time.monotonic();base.EXCLUDE_REMAINDER=43
    with tempfile.TemporaryDirectory(prefix="v13-") as tmp:
        archive=str(pathlib.Path(tmp)/"ml-25m.zip");base.download(base.ZIP_URL,archive)
        link,meta=base.load_small()
        with zipfile.ZipFile(archive) as zf:ids,meta,genome,valid,fullmat,held,total=base.prepare(zf,link,meta)
    fullusage=np.asarray(fullmat.sum(axis=0)).reshape(-1);allowed=fullusage>=10
    genres=sorted({g for m in ids for g in meta.get(m,{}).get("genre",set())})
    genre=v10.cosine(np.array([[float(g in meta.get(m,{}).get("genre",set())) for g in genres] for m in ids],np.float32))
    mat=sample_users(fullmat,budget);del fullmat
    scoring,usage,timing,failures=train_models(mat,genome,valid,genre,budget==0)
    # Same reference popularity and eligible catalog for every nested size.
    pop=(fullusage+1)/(float(fullusage.sum())+len(fullusage))
    report={"dataset":"MovieLens 25M","source_raw_ratings":total,"training_positive_interactions":int(mat.nnz),"budget_positive_interactions":budget,"heldout_users":len(held),"cohort":"uid % 509 == 43, even validation/odd test; disjoint from 17 and 29","candidate_count":int(allowed.sum()),"counts":counts,"protocols":{"A":"first/latest","B":"random from old 80%/latest","C":"first/random from remainder","D":"random from all/random from remainder"},"random_repeats":REPEATS,"objective":"equal A-D mean NDCG@10","fit_seconds":timing,"model_failures":failures,"results":{},"limitations":["Only mapped Small catalog, binary positive training matrix; no full 62k catalog or explicit rating MF","Tag Genome is upstream and may contain future/held-out signals; no global time cutoff","Scale subsets sampled by whole users; candidate eligibility fixed by full training data","EASE/SLIM catalog limits; SLIM approximate bounded optimization","Five random repetitions; 95% paired bootstrap CI unadjusted, exploration only","No deployment, no raw user histories or model weights exported","No true NCF/LightGCN/SVD++/FM/LightFM/explicit MF/stacking in this phase"]}
    out=pathlib.Path("research-results");out.mkdir(exist_ok=True)
    file=out/("v13-25m-"+str(budget)+"-"+str(counts[0])+".json")
    for n in counts:
        val,lat=collect(held,"validation",n,scoring,allowed)
        if not val:continue
        names=sorted(val[0][4])
        # Accuracy-only cheap screening for RRF candidates; all reported metrics
        # computed only for base models and selected finalists.
        def quick(rows,policy):
            by=defaultdict(list)
            for uid,p,r,t,rs,g in rows:
                rr=rs[policy] if isinstance(policy,str) else fuse([rs[m] for m in policy[1]],policy[2],policy[3],policy[4])
                hits=[i for i,x in enumerate(rr[:10]) if int(x) in t]
                ideal=sum(1/math.log2(i+2) for i in range(min(10,len(t))))
                by[(uid,p)].append(sum(1/math.log2(i+2) for i in hits)/ideal if ideal else 0.)
            return float(np.mean([np.mean(v) for v in by.values()]))
        singles={m:quick(val,m) for m in names}
        shortlist=sorted(names,key=lambda m:(-singles[m],m))[:5]
        candidates=list(search_policies(names,shortlist))
        scores={p if isinstance(p,str) else p[0]:(singles[p] if isinstance(p,str) else quick(val,p)) for p in candidates}
        ensemble=max((p for p in candidates if not isinstance(p,str)),key=lambda p:scores[p[0]])
        selected=ensemble if scores[ensemble[0]]>=singles[shortlist[0]]+.001 else shortlist[0]
        lock=selected if isinstance(selected,str) else selected[0]
        print("LOCKED",n,lock,flush=True)
        test,tlat=collect(held,"test",n,scoring,allowed)
        if not test:continue
        reports={};vectors={}
        for p in [*names,ensemble]:
            key=p if isinstance(p,str) else p[0];reports[key],vectors[key]=summarize(test,p,genre,pop,"test")
        baseline="v11-frozen";delta=vectors[lock]-vectors[baseline]
        report["results"][str(n)]={"validation_ndcg10":scores,"shortlist":shortlist,"selected":selected,"test":reports,"paired_vs_v11":{"mean":float(delta.mean()),"ci95":ci(delta),"n":len(delta)},"validation_latency":lat,"test_latency":tlat}
        report["elapsed_seconds"]=round(time.monotonic()-start,2);report["peak_rss_mib"]=round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024,2)
        file.write_text(json.dumps(report,indent=2,allow_nan=False)+"\n")
        print("COMPLETE",n,lock,report["results"][str(n)]["paired_vs_v11"],flush=True)
    assert set(report["results"])==set(map(str,counts)),"Missing profile result"

if __name__=="__main__":
    if sys.argv[1]=="--self-test":selftest()
    else:run(int(sys.argv[1]),[int(x) for x in sys.argv[2].split(",")])
