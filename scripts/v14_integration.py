#!/usr/bin/env python3
"""One fresh cohort: tune exact neighbor models, stack, fuse 2-5 models, evaluate six rails."""
import sys,os,json,time,math,itertools,subprocess,resource
from collections import defaultdict
import numpy as np
from scipy import sparse
from sklearn.linear_model import LogisticRegression
from sklearn.decomposition import TruncatedSVD
import v14_common as c
import benchmark_comprehensive_v13 as v13
import benchmark_v10 as v10
import benchmark_v11 as v11
import train_ml25m as base

def knn(d):
    p=d["pos"];pc=p.tocsc();counts=np.asarray(p.sum(axis=1)).ravel()
    r=d["ratings"];rc=r.tocsc();center=r.copy();center.data-=np.repeat(np.asarray(r.sum(axis=1)).ravel()/np.maximum(1,np.diff(r.indptr)),np.diff(r.indptr));cc=center.tocsc()
    variants=list(itertools.product((60,140,300),(1,2),(3.,10.)))
    def fn(a,w):
        liked=a[w>=4];out={}
        if len(liked):
            overlap=np.asarray(pc[:,liked].sum(axis=1)).ravel()
            for k,m,sh in variants:
                s=overlap/np.sqrt(np.maximum(1,counts)*len(liked))*overlap/(overlap+sh);s[overlap<m]=0
                top=np.argpartition(-s,k-1)[:k];top=top[s[top]>0]
                out[f"user-k{k}-m{m}-s{sh:g}"]=np.asarray(s[top]@p[top],np.float32).ravel()/max(1e-8,float(s[top].sum())) if len(top) else np.zeros(p.shape[1],np.float32)
        else:
            for k,m,sh in variants:out[f"user-k{k}-m{m}-s{sh:g}"]=np.zeros(p.shape[1],np.float32)
        # Explicit user-centered neighborhood: correlation on co-rated items and shrinkage.
        xx=cc[:,a];wv=w-w.mean();ov=np.asarray((rc[:,a]!=0).sum(axis=1)).ravel()
        num=np.asarray(xx@wv).ravel();den=np.sqrt(np.asarray(xx.power(2).sum(axis=1)).ravel()*max(1e-8,float(wv@wv)))
        s=num/np.maximum(1e-8,den)*ov/(ov+5);s[ov<2]=0
        for k in (60,140,300):
            top=np.argpartition(-s,k-1)[:k];top=top[s[top]>0]
            out[f"user-centered-k{k}"]=np.asarray(s[top]@center[top],np.float32).ravel()/max(1e-8,float(s[top].sum())) if len(top) else np.zeros(p.shape[1],np.float32)
        return out
    return fn

def v11_refit(d):
    p=d["pos"];g=d["genome"];found=d["found"]
    item,tag,*_=base.train(g,found,p);usage=d["usage"];graph=v10.build_item_knn(p,usage)
    pop=np.log1p(usage);pop/=max(1e-8,float(pop.max()))
    frozen=json.loads(c.pathlib.Path("showcase/v11-benchmark.json").read_text())["selection"]
    def fn(a,w):
        profile=list(zip(a.tolist(),w.tolist()));setting=frozen[str(max(k for k in c.COUNTS if k<=len(a)))]
        adj=v11.transform(profile,setting["negativeScale"]) if setting["accepted"] else profile
        raw=.52*v10.v9_scores(item,tag,usage,adj)+.48*v10.score_itemknn(graph,adj,len(usage))
        return (1-setting["gamma"])*pop+setting["gamma"]*raw if setting["accepted"] else raw
    return fn

def small_same(d):
    # Same model recipes, same 25M evaluation profiles. Small user identities cannot be linked.
    r=c.small_ratings(d["ids"]);p=c.binary(r);u=np.asarray(p.sum(axis=0)).ravel()
    svd=TruncatedSVD(24,n_iter=4,random_state=c.SEED).fit(p)
    g=v10.build_item_knn(p,u);q=c.norm(svd.components_.T)
    pop=np.log1p(u);pop/=max(1e-8,float(pop.max()))
    # Clean scale control: within-25M nested whole-user sample close to 100k total ratings.
    x=d["ratings"];rr=np.random.default_rng(c.SEED).permutation(np.flatnonzero(np.diff(x.indptr)))
    keep=rr[:np.searchsorted(np.cumsum(np.diff(x.indptr)[rr]),r.nnz)+1];xp=c.binary(x[keep]);xu=np.asarray(xp.sum(axis=0)).ravel()
    xq=c.norm(TruncatedSVD(24,n_iter=4,random_state=c.SEED).fit(xp).components_.T);xg=v10.build_item_knn(xp,xu);xpop=np.log1p(xu);xpop/=max(1e-8,float(xpop.max()))
    full=p=d["pos"];fu=d["usage"];fq=c.norm(TruncatedSVD(24,n_iter=4,random_state=c.SEED).fit(full).components_.T);fg=v10.build_item_knn(full,fu);fpop=np.log1p(fu);fpop/=max(1e-8,float(fpop.max()))
    models={}
    for label,qq,gg,pp in (("small",q,g,pop),("25m100k",xq,xg,xpop),("25mfull",fq,fg,fpop)):
        models[label+"-svd"]=c.model("latent",q=qq);models[label+"-itemknn"]=c.model("linear",b=gg);models[label+"-popular"]=c.model("pop",p=pp)
    return models,{"small_matched_ratings":r.nnz,"nested_25m_ratings":int(x[keep].nnz),"full_25m_ratings":x.nnz}

def norm_score(s,allowed):
    s=np.asarray(s,np.float32);v=s[allowed];low,high=np.quantile(v,[.05,.95])
    return np.clip((s-low)/max(1e-8,float(high-low)),0,3).astype(np.float32)

class Service:
    def __init__(self,d):
        self.proc=subprocess.Popen(["node","tests/v14-current-service.js"],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True,bufsize=1)
        msg=json.loads(self.proc.stdout.readline());assert msg["ready"]
        self.ids=d["ids"];self.idx={int(m):i for i,m in enumerate(self.ids)};self.allowed=d["allowed"]
    def call(self,a,w,rails=False):
        self.proc.stdin.write(json.dumps({"profile":[[int(self.ids[i]),float(r)] for i,r in zip(a,w)],"rails":rails})+"\n");self.proc.stdin.flush()
        out=json.loads(self.proc.stdout.readline())
        if "error" in out:raise RuntimeError(out["error"])
        def conv(v):return np.array([self.idx[i] for i in v if i in self.idx and self.allowed[self.idx[i]]],np.int32)
        return {k:conv(v) if k!="live" else [conv(x) for x in v] for k,v in out.items()}
    def close(self):
        self.proc.stdin.close();self.proc.wait(timeout=30)

def collect(d,n,phase,models,user,baseline,service):
    rows=[];cache={};names=None
    for j,(uid,p,r,a,w,ts,truth) in enumerate(c.profiles(d,n,phase)):
        key=(uid,a.tobytes(),w.tobytes(),ts.tobytes())
        if key not in cache:
            scores={m:c.score(mdl,a,w,ts) for m,mdl in models.items()};scores.update(user(a,w));scores["v11-refit"]=baseline(a,w)
            # Current production comparator is measured only on the held-out test;
            # bundled 25M models may have seen these users, so diagnostic only.
            live=service.call(a,w,phase=="test")
            ranks={m:c.rank(s,a,d["allowed"]) for m,s in scores.items()}
            ranks.update({m:r[:50] for m,r in live.items() if m!="live"})
            names=sorted(ranks);ix=np.unique(np.concatenate([ranks[m] for m in names]))
            F=np.zeros((len(ix),len(names)),np.float32);R=np.zeros_like(F);B=np.zeros_like(F);M=np.zeros_like(F)
            for h,m in enumerate(names):
                rr=ranks[m];loc=np.searchsorted(ix,rr);F[loc,h]=1/(20+np.arange(len(rr))+1);B[loc,h]=(50-np.arange(len(rr)))/50
                R[loc,h]=1/(60+np.arange(len(rr))+1)
                M[:,h]=norm_score(scores[m],d["allowed"])[ix] if m in scores else B[:,h]
            cache[key]=(ix,F,R,B,M,ranks,live.get("live"))
        ix,F,R,B,M,ranks,live=cache[key]
        rows.append((uid,p,r,a,w,truth,ix,F,R,B,M,ranks,live))
        if j%500==0:print("COLLECT",n,phase,j,flush=True)
    assert rows and names
    return rows,names

def policy_rank(row,policy,names,stack=None):
    _,_,_,a,w,truth,ix,F,R,B,M,ranks,live=row
    if isinstance(policy,str):return ranks[policy]
    method,idx,weights=policy
    if method=="stack":
        s=stack.decision_function(np.concatenate((F*20,B,M),axis=1))
    else:
        x={"rrf20":F,"rrf60":R,"borda":B,"score":M}[method]
        s=x[:,idx]@np.asarray(weights,np.float32)
    return ix[np.lexsort((ix,-s))[:50]]

def user_averages(rows,policy,names,stack=None):
    by=defaultdict(list)
    for row in rows:by[(row[0],row[1])].append(c.ndcg(policy_rank(row,policy,names,stack),row[5]))
    users=sorted({u for u,p in by})
    return np.array([np.mean([np.mean(by[u,p]) for p in range(4)]) for u in users])

def choose(rows,names,stack):
    singles={m:float(user_averages(rows,m,names).mean()) for m in names}
    shortlist=sorted(names,key=lambda m:(-singles[m],m))[:8];ix=[names.index(m) for m in shortlist]
    candidates=[(s,(i,j),(w,1-w)) for i,j in itertools.combinations(ix,2) for w in (.25,.5,.75) for s in ("rrf20","rrf60","borda","score")]
    values={}
    def ev(p):
        key=repr(p)
        if key not in values:values[key]=float(user_averages(rows,p,names,stack).mean())
        return values[key]
    best=max(candidates,key=ev);allbest=best
    for count in (3,4,5):
        m,inds,ws=best
        cs=[(method,tuple(inds)+(i,),tuple([1/count]*count)) for i in ix if i not in inds for method in ("rrf20","rrf60","borda","score")]
        if not cs:break
        best=max(cs,key=ev)
        if ev(best)>ev(allbest):allbest=best
    rng=np.random.default_rng(c.SEED)
    m,inds,ws=allbest
    for _ in range(30):
        p=(m,inds,tuple(rng.dirichlet(np.ones(len(inds))).tolist()))
        if ev(p)>ev(allbest):allbest=p
    stacking=("stack",(),())
    selected=max([shortlist[0],allbest,stacking],key=lambda p:singles[p] if isinstance(p,str) else ev(p))
    return selected,shortlist,singles,allbest,values

def fit_stack(rows):
    # Calibration users separate from validation and test; observed positives vs sampled unobserved candidates.
    rng=np.random.default_rng(c.SEED);xs=[];ys=[]
    for row in rows:
        ix,F,R,B,M=row[6:11];y=np.isin(ix,list(row[5]));pos=np.flatnonzero(y);neg=np.flatnonzero(~y)
        keep=np.concatenate((pos,rng.choice(neg,min(len(neg),80),replace=False)))
        xs.append(np.concatenate((F[keep]*20,B[keep],M[keep]),axis=1));ys.append(y[keep])
    x=np.concatenate(xs);y=np.concatenate(ys);assert y.any() and (~y).any()
    return LogisticRegression(C=.2,max_iter=200,class_weight="balanced",random_state=c.SEED).fit(x,y)

def report_metrics(d,rows,policy,names,stack):
    pop=(d["usage"]+1)/(d["usage"].sum()+len(d["usage"]));by=defaultdict(list);coverage=defaultdict(set)
    for row in rows:
        rr=policy_rank(row,policy,names,stack);by[(row[0],row[1])].append(v13.metrics(rr,row[5],d["genre"],pop));coverage[row[1],row[2]].update(rr[:10].tolist())
    data=np.array([[np.mean(by[u,p],axis=0) for p in range(4)] for u in sorted({u for u,p in by})])
    vals=data.mean(axis=0);return {"n":len(data),"objective_ndcg10":float(data[:,:,1,0].mean()),"protocols":{c.PROTOS[p]:{str(k):dict(zip(("ndcg","recall","precision","hit","mrr","genre_diversity","novelty_bits"),map(float,vals[p,j]))) for j,k in enumerate(v13.KS)}|{"coverage10":float(np.mean([len(x) for (pp,r),x in coverage.items() if pp==p]))} for p in range(4)}}

def rails(row,primary,user,similar,names,stack,genre,pop,penalty):
    rr=[policy_rank(row,primary,names,stack),row[11][user],row[11][similar]]
    used=set();out=[]
    for r in rr:
        keep=[int(x) for x in r if int(x) not in used][:12];out.append(keep);used.update(keep)
    cand=policy_rank(row,primary,names,stack);extra=np.unique(np.concatenate((cand,*rr,row[6])))
    lookup={int(i):j for j,i in enumerate(cand)};a,w=row[3:5];fav=(w>=4).astype(np.float32)@genre[a]
    for mode in ("hidden","discovery","genre"):
        available=np.array([i for i in extra if int(i) not in used],np.int32);pick=[]
        if not len(available):out.append(pick);continue
        rel=np.array([1/(1+lookup.get(int(i),60)) for i in available])
        if mode=="hidden":value=rel+penalty*(-np.log2(pop[available]))/20
        elif mode=="genre":value=rel+penalty*(genre[available]@fav)/max(1e-8,float(np.linalg.norm(fav)))
        else:value=rel.copy()
        for _ in range(min(12,len(available))):
            k=int(np.argmax(value));m=int(available[k]);pick.append(m);used.add(m);value[k]=-np.inf
            if mode=="discovery":value-=penalty*(genre[available]@genre[m])
        out.append(pick)
    return out

def rail_metrics(rows,fn,genre,pop,novelty=False):
    by=defaultdict(list)
    for row in rows:
        lists=fn(row);flat=[int(i) for arr in lists for i in arr];unique=list(dict.fromkeys(flat));truth=row[5]
        g=genre[unique];dist=1-(g@g.T);div=float(dist[np.triu_indices(len(g),1)].mean()) if len(g)>1 else 0.
        vals=[len(set(unique)&truth)/max(1,len(truth)),float(bool(set(unique)&truth)),1-len(unique)/max(1,len(flat)),div,float(np.mean(-np.log2(pop[unique]))) if unique else 0.,len(unique),c.ndcg(unique,truth,50)]
        by[row[0],row[1]].append(vals)
    x=np.mean([np.mean(v,axis=0) for v in by.values()],axis=0)
    return dict(zip(("union_recall","union_hit","duplicate_fraction","genre_diversity","novelty_bits","unique_count","union_ndcg50"),map(float,x)))

def run(counts):
    d=c.load();models={p.stem:c.restore(p) for p in sorted(c.MODELS.glob("*.npz"))}
    assert models,"No family artifacts supplied"
    simple,scalestats=small_same(d);models.update(simple)
    pop=(d["usage"]+1)/(float(d["usage"].sum())+len(d["usage"]));models["pop"]=c.model("pop",p=pop)
    # Ablation exposes selected signals independently; addition via score fusion candidates.
    user=knn(d);baseline=v11_refit(d);service=Service(d);c.OUT.mkdir(exist_ok=True)
    report={"counts":counts,"model_artifacts":sorted(models),"scale_same_protocol":scalestats,"cohort":"uid%509=61; mod4=0 stack, mod4=2 validation, odd test","ratings":d["ratings"].nnz,"positive_ratings":d["pos"].nnz,"catalog":len(d["ids"]),"results":{},"limitations":["Small identities cannot be linked across releases; exact Small comparison is descriptive; nested 25M scale control is user-disjoint","Production bundled 25M adapters may have trained on these evaluation users; live rail scores diagnostic only","V11 refit uses held-in ratings, upstream Tag Genome may include heldout/future information","Candidate-union normalized-score stacking and fusion; sampled unobserved negatives, not known dislikes","V14 candidate rails simulate replacement; no deployment","No exhaustive hyperparameter Cartesian grid; staged search"] }
    start=time.monotonic()
    try:
        for n in counts:
            train,names=collect(d,n,"stack",models,user,baseline,service)
            stack=fit_stack(train);del train
            val,n2=collect(d,n,"validation",models,user,baseline,service);assert names==n2
            selected,shortlist,singles,best,search=choose(val,names,stack)
            u=max((m for m in names if m.startswith("user-") or m in ("cohort","small_user")),key=lambda m:singles[m])
            sim=max((m for m in names if m in ("tag","genre","itemknn","association","word2vec","item2vec","v11-refit","small_similarity","svd")),key=lambda m:singles[m])
            penalties={str(p):rail_metrics(val,lambda row:rails(row,selected,u,sim,names,stack,d["genre"],pop,p),d["genre"],pop) for p in (0.,.05,.15,.3)}
            # Rank first by union recall and then diversity among near ties.
            highest=max(q["union_recall"] for q in penalties.values())
            penalty=float(max((k for k,v in penalties.items() if v["union_recall"]>=highest-.005),key=lambda k:penalties[k]["genre_diversity"]))
            del val
            test,n3=collect(d,n,"test",models,user,baseline,service);assert names==n3
            policies={"selected":selected,"best-fusion":best,"stacking":("stack",(),()),"small-current":"small","v11-refit":"v11-refit","pop":"pop",**{m:m for m in names}}
            results={k:report_metrics(d,test,p,names,stack) for k,p in policies.items()}
            delta=user_averages(test,selected,names,stack)-user_averages(test,"v11-refit",names,stack)
            rng=np.random.default_rng(c.SEED);bs=delta[rng.integers(0,len(delta),(20000,len(delta)))].mean(axis=1)
            alpha=.05/len(c.ALL_COUNTS);ci=np.quantile(bs,[alpha/2,1-alpha/2]).tolist()
            base_delta=user_averages(test,selected,names,stack)-user_averages(test,"small",names,stack)
            bbs=base_delta[rng.integers(0,len(delta),(20000,len(delta)))].mean(axis=1)
            # Both reference comparisons must be treated separately; small overlap caveat.
            report["results"][str(n)]={"validation_singles":singles,"shortlist":shortlist,"search_count":len(search),"selected":selected,"names":names,"test":results,"paired_vs_v11_refit":{"delta":float(delta.mean()),"bonferroni_ci":ci},"paired_vs_small":{"delta":float(base_delta.mean()),"bonferroni_ci":np.quantile(bbs,[alpha/2,1-alpha/2]).tolist()},"rail_selection":{"user":u,"similar":sim,"penalty":penalty,"validation":penalties},"rail_test":{"proposed":rail_metrics(test,lambda row:rails(row,selected,u,sim,names,stack,d["genre"],pop,penalty),d["genre"],pop),"current_bundle_diagnostic":rail_metrics(test,lambda row:row[12] or [],d["genre"],pop)}}
            del test
            report["elapsed_s"]=time.monotonic()-start;report["peak_rss_mib"]=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024
            (c.OUT/f"integration-{counts[0]}.json").write_text(json.dumps(report,indent=2,allow_nan=False))
            print("COMPLETE",n,selected,ci,flush=True)
    finally:service.close()
    assert len(report["results"])==len(counts)

if __name__=="__main__":run(list(map(int,sys.argv[1].split(","))))
