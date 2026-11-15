#!/usr/bin/env python3
"""Supplementary V14 hold-out: strict global temporal split and full 25M native catalog."""
import sys, json, time, math, resource
from collections import defaultdict
import numpy as np
from scipy import sparse
from sklearn.decomposition import TruncatedSVD
from implicit.als import AlternatingLeastSquares
import v14_common as c
import benchmark_comprehensive_v13 as prev

def evaluate(d,m,strict):
    by=defaultdict(list);coverage=defaultdict(set);pop=(d["usage"]+1)/(d["usage"].sum()+len(d["usage"]))
    for phase in ("validation","test"):
        for n in c.COUNTS:
            for uid,p,r,a,w,ts,truth in c.profiles(d,n,phase,real_time=strict):
                rr=c.rank(c.score(m,a,w,ts),a,d["allowed"]);by[phase,n,uid,p].append(prev.metrics(rr,truth,d["genre"],pop))
                coverage[phase,n,p,r].update(rr[:10].tolist())
    out={}
    for phase in ("validation","test"):
        out[phase]={}
        for n in c.COUNTS:
            result={}
            for p in range(2 if strict else 4):
                rows=[np.mean(v,axis=0) for (ph,nn,uid,pp),v in by.items() if ph==phase and nn==n and pp==p]
                if rows:
                    v=np.mean(rows,axis=0)
                    result[c.PROTOS[p]]={"users":len(rows),"ndcg10":float(v[1,0]),"recall10":float(v[1,1]),"hit10":float(v[1,3]),"coverage10":float(np.mean([len(x) for (ph,nn,pp,r),x in coverage.items() if ph==phase and nn==n and pp==p]))}
            out[phase][str(n)]=result
    return out

def main(mode):
    strict=mode=="time";cutoff=1451606400 if strict else 0 # 2016-01-01 UTC fixed prior to testing.
    d=c.load(cutoff=cutoff,native=not strict);p=d["pos"];u=d["usage"]
    c.OUT.mkdir(exist_ok=True);report={"mode":mode,"raw_catalog":len(d["ids"]),"candidate_count":int(d["allowed"].sum()),"training_ratings":d["ratings"].nnz,"training_positives":p.nnz,"global_cutoff_utc":cutoff,"results":{},"limitations":["Temporal split: only A/B meaningful across a genuine time cutoff; no upstream Tag Genome in either study","Full native catalog uses scalable popularity/SVD/ALS/genre, not dense full-universe EASE/SLIM; full service catalog EASE/SLIM attempted separately","New cohort excluded before training; no known identity overlap within 25M"]}
    def add(name,m):
        report["results"][name]=evaluate(d,m,strict);(c.OUT/f"supplement-{mode}.json").write_text(json.dumps(report,allow_nan=False,indent=2));print("DONE",mode,name,flush=True)
    add("popular",c.model("pop",p=np.log1p(u)))
    add("genre",c.model("latent",q=d["genre"]))
    for dim in (24,48):
        s=TruncatedSVD(dim,n_iter=4,random_state=c.SEED).fit(p);q=c.norm(s.components_.T);add(f"svd-{dim}",c.model("latent",q=q))
        if strict:add(f"svd-{dim}-decay180",c.model("latent",q=q,time_decay=180))
    a=AlternatingLeastSquares(factors=32,regularization=.08,iterations=15,random_state=c.SEED,num_threads=2);a.fit(p,show_progress=False)
    add("als",c.model("latent",q=c.norm(a.item_factors)))
    report["peak_rss_mib"]=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024
    (c.OUT/f"supplement-{mode}.json").write_text(json.dumps(report,allow_nan=False,indent=2))
if __name__=="__main__":main(sys.argv[1])
