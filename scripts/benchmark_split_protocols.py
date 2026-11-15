#!/usr/bin/env python3
"""Independent 25M split sensitivity study. Aggregate results only."""
import json
import pathlib
import tempfile
import zipfile
from collections import defaultdict
import numpy as np
import benchmark_v10 as v10
import benchmark_v11 as v11
import train_ml25m as base

SEED = 20261115
COUNTS = (3, 5, 10, 20, 50, 100)
PROTOCOLS = ("chronological", "past_random", "random")
REPEATS = 10
BOOTSTRAPS = 4000

def split_cases(history, n, uid):
    h = sorted(history, key=lambda r:(r[2],r[0]))
    m = max(3,len(h)//5)
    if len(h)-m<n:
        return
    old,future=h[:-m],h[-m:]
    yield "chronological",0,old[:n],future
    for r in range(REPEATS):
        rng=np.random.default_rng(np.random.SeedSequence([SEED,uid,n,r]))
        picks=rng.permutation(len(old))[:n]
        yield "past_random",r,[old[i] for i in sorted(picks)],future
        perm=rng.permutation(len(h))
        yield "random",r,[h[i] for i in sorted(perm[:n])],[h[i] for i in perm[n:n+m]]

def rank(scores,seen,usage):
    ids=np.flatnonzero(usage>=v10.MIN_POP)
    ids=ids[~np.isin(ids,list(seen))]
    values=np.nan_to_num(scores[ids],nan=-np.inf)
    return ids[np.lexsort((ids,-values))[:10]].tolist()

def summarize(records):
    users=sorted(records)
    a=np.array([np.mean([x[1] for x in records[u]],axis=0) for u in users])
    repeats=sorted({x[0] for u in users for x in records[u]})
    cov=[len({i for u in users for r,_,ranked,_ in records[u] if r==rep for i in ranked}) for rep in repeats]
    out={"n":len(users),"repeats":len(repeats),"empty_truth_rate":float(np.mean([np.mean([x[3] for x in records[u]]) for u in users])),
         "coverage_mean":float(np.mean(cov)),"coverage_sd":float(np.std(cov,ddof=1)) if len(cov)>1 else 0.}
    rng=np.random.default_rng(SEED)
    bs=a[rng.integers(0,len(a),(BOOTSTRAPS,len(a)))].mean(axis=1)
    for j,k in enumerate(("ndcg","recall","hit")):
        out[k]=float(a[:,j].mean())
        out[k+"_sd"]=float(a[:,j].std(ddof=1)) if len(a)>1 else 0.
        out[k+"_ci95"]=np.quantile(bs[:,j],[.025,.975]).tolist()
    return out,(users,a)

def paired(a,b):
    assert a[0]==b[0]
    d=b[1]-a[1]
    rng=np.random.default_rng(SEED+1)
    bs=d[rng.integers(0,len(d),(BOOTSTRAPS,len(d)))].mean(axis=1)
    return {k:{"mean":float(d[:,j].mean()),"ci95":np.quantile(bs[:,j],[.025,.975]).tolist()} for j,k in enumerate(("ndcg","recall","hit"))}

def run():
    base.EXCLUDE_REMAINDER=29
    with tempfile.TemporaryDirectory(prefix="split-25m-") as tmp:
        archive=str(pathlib.Path(tmp)/"ml-25m.zip")
        base.download(base.ZIP_URL,archive)
        links,meta=base.load_small()
        with zipfile.ZipFile(archive) as zf:
            ids,meta,genome,valid,mat,held,total=base.prepare(zf,links,meta)
    assert len(held)>=250 and all(u%509==29 for u in held)
    item,tag,_,_,usage,_=base.train(genome,valid,mat)
    graph=v10.build_item_knn(mat,usage)
    ease=v10.build_ease(mat,usage)
    als,bpr=v10.build_implicit_models(mat)
    item2vec=v10.build_item2vec(mat)
    counts=np.asarray(mat.sum(axis=1)).reshape(-1)
    pop=np.log1p(usage);pop/=max(1e-8,float(pop.max()))
    frozen=json.loads(pathlib.Path("showcase/v11-benchmark.json").read_text())["selection"]
    def scores(profile,n):
        anchors=[i for i,r in profile if r!=3]
        w=np.array([np.clip((r-3)/2,-1,1) for i,r in profile if r!=3],dtype=np.float32)
        old=v10.v9_scores(item,tag,usage,profile)
        knn=v10.score_itemknn(graph,profile,len(ids));raw=.52*old+.48*knn
        p=frozen[str(n)]
        if p["accepted"]:
            adj=v11.transform(profile,p["negativeScale"])
            hybrid=.52*v10.v9_scores(item,tag,usage,adj)+.48*v10.score_itemknn(graph,adj,len(ids))
            adaptive=(1-p["gamma"])*pop+p["gamma"]*hybrid
        else:
            adaptive=raw
        out={"popular":pop,"v9-tag":old,"item-knn":knn,"tag+item-knn":raw,"v11-frozen":adaptive,
             "svd":v10.dot_score(item,anchors,w),"user-knn":v10.score_user_knn(mat,usage,profile,counts),
             "ease-top1200":v10.score_ease(ease,profile,len(ids)),"als":v10.dot_score(als,anchors,w),
             "bpr":v10.dot_score(bpr,anchors,w),"item2vec":v10.dot_score(item2vec,anchors,w)}
        out["tag+als"]=.52*old+.48*out["als"]
        out["tag+item2vec"]=.52*old+.48*out["item2vec"]
        return out
    out={"dataset":"MovieLens 25M","original_ratings":total,"catalog":len(ids),"candidate_count":int(np.sum(usage>=v10.MIN_POP)),
         "holdout_users":len(held),"holdout_rule":"uid % 509 == 29; disjoint from V9-V11 remainder 17",
         "training_interactions":int(mat.nnz),"active_training_users":int(np.count_nonzero(counts)),
         "seed":SEED,"bootstrap":BOOTSTRAPS,"profiles":list(COUNTS),"results":{},"paired_vs_chronological":{},
         "limitations":["Precomputed Tag Genome may contain held-out/future signal","No global time cutoff",
                        "Empty truth scored zero; candidate requires >=10 training positives","EASE limited to 1200 trained movies",
                        "Coverage mean per repeat; confidence intervals not multiple-comparison adjusted"]}
    folder=pathlib.Path("research-results");folder.mkdir(exist_ok=True)
    for n in COUNTS:
        rows=defaultdict(lambda:defaultdict(lambda:defaultdict(list)))
        for uid,hist in sorted(held.items()):
            for proto,rep,prof,target in split_cases(hist,n,uid):
                truth={i for i,r,_ in target if r>=4 and usage[i]>=v10.MIN_POP}
                profile=[(i,r) for i,r,_ in prof];seen={i for i,r in profile}
                assert not seen.intersection(i for i,_,_ in target)
                for name,s in scores(profile,n).items():
                    ranked=rank(s,seen,usage)
                    rows[proto][name][uid].append((rep,v10.metrics(ranked,truth),ranked,not truth))
        if not rows:continue
        out["results"][str(n)]={};arrays={}
        for proto in PROTOCOLS:
            out["results"][str(n)][proto]={};arrays[proto]={}
            for name,users in rows[proto].items():
                out["results"][str(n)][proto][name],arrays[proto][name]=summarize(users)
        out["paired_vs_chronological"][str(n)]={p:{name:paired(arrays["chronological"][name],ary) for name,ary in arrays[p].items()} for p in PROTOCOLS[1:]}
        (folder/"split-25m.json").write_text(json.dumps(out,indent=2,allow_nan=False)+"\n")
        print("COMPLETED",n,"users",len(next(iter(rows["chronological"].values()))),flush=True)
    assert set(out["results"])==set(map(str,COUNTS))

if __name__=="__main__":
    run()
