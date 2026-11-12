#!/usr/bin/env python3
"""V11: cold-start adaptive hybrid model on identical excluded 25M users and film pool.
A small grid is picked on independent validation users; test users are never used to fit weights.
Publishes weight schedules and aggregate metrics ONLY, no ratings or per-user factors.
"""
import json
import pathlib
import tempfile
import time
import zipfile
from collections import defaultdict
import numpy as np
import train_ml25m as base
import benchmark_v10 as v10

PROFILE_COUNTS=(3,5,10,20,50,100)
GAMMAS=(0.,.10,.25,.40,.55,.70,.85,1.)
NEG_SCALES=(.5,1.)
RELEVANCE=4.
OUT=pathlib.Path("showcase")
MIN_N=20

def transform(profile,negative):
    return [(i, max(.5,3+(float(r)-3)*negative) if r<3 else float(r)) for i,r in profile]

def avg_metrics(runs):
    if not runs:return None
    values=np.stack([x[0] for x in runs])
    catalog=len(set(i for _,ranked in runs for i in ranked))
    return dict(ndcg=round(float(values[:,0].mean()),6),recall=round(float(values[:,1].mean()),6),hit=round(float(values[:,2].mean()),6),coverage=catalog,n=len(runs))

def profiles(held):
    for uid,raw in sorted(held.items()):
        for n in PROFILE_COUNTS:
            result=v10.profile_of(raw,n)
            if result is not None:yield uid,n,result[0],result[1]

def score_user_neighbours(mat,usercounts,profile,usage,shrink=3,required=2,neighbors=140):
    positives=[i for i,r in profile if r>=4]
    if not positives:return np.zeros(len(usage),dtype=np.float32)
    overlap=np.asarray(mat[:,positives].sum(axis=1),dtype=np.float32).reshape(-1)
    similarity=overlap/np.sqrt(np.maximum(1,usercounts)*len(positives))
    similarity*=overlap/(overlap+shrink)
    similarity[overlap<required]=0
    count=min(neighbors,len(similarity));take=np.argpartition(-similarity,count-1)[:count]
    valid=take[similarity[take]>0]
    if not len(valid):return np.zeros(len(usage),dtype=np.float32)
    return np.asarray(similarity[valid]@mat[valid],dtype=np.float32).reshape(-1)/max(1e-8,float(similarity[valid].sum()))

def run():
    started=time.monotonic()
    with tempfile.TemporaryDirectory(prefix="moviereclab-v11-") as tmp:
        filename=str(pathlib.Path(tmp)/"ml-25m.zip")
        base.download(base.ZIP_URL,filename)
        linkset,meta=base.load_small()
        with zipfile.ZipFile(filename) as archive:ids,meta,genome,valid,mat,held,total=base.prepare(archive,linkset,meta)
    item,tag,centers,cohorts,usage,_=base.train(genome,valid,mat)
    graph=v10.build_item_knn(mat,usage)
    usercounts=np.asarray(mat.sum(axis=1),dtype=np.float32).reshape(-1)
    pop=np.log1p(usage)/max(1e-8,float(np.log1p(usage).max()))
    results={phase:{str(p):defaultdict(list) for p in PROFILE_COUNTS} for phase in ("validation","test")}
    total_groups=0
    for uid,n,profile,truth in profiles(held):
        phase="validation" if uid%2==0 else "test"
        p=str(n)
        seen=set(i for i,r in profile)
        models={}
        for neg in NEG_SCALES:
            adjusted=transform(profile,neg)
            old=v10.v9_scores(item,tag,usage,adjusted)
            knn=v10.score_itemknn(graph,adjusted,len(ids))
            models[neg]=.52*old+.48*knn
        raw=models[1.]
        for label,score in (("v10",raw),("popular",pop),("v9-tag",v10.v9_scores(item,tag,usage,profile))):
            ranking=v10.visible_order(score,seen,usage)
            results[phase][p][label].append((v10.metrics(ranking,truth),ranking))
        for neg in NEG_SCALES:
            for gamma in GAMMAS:
                label=f"hybrid:{neg}:{gamma}"
                mix=np.asarray((1-gamma)*pop+gamma*models[neg],dtype=np.float32)
                ranking=v10.visible_order(mix,seen,usage)
                results[phase][p][label].append((v10.metrics(ranking,truth),ranking))
        if n in (5,10,20):
            for mode,shr,minmatch in [("user-v10",3,2),("user-1match",10,1),("user-shrink10",10,2)]:
                score=score_user_neighbours(mat,usercounts,profile,usage,shrink=shr,required=minmatch)
                ranking=v10.visible_order(score,seen,usage)
                results[phase][p][mode].append((v10.metrics(ranking,truth),ranking))
        total_groups+=1
    print("EVALUATED",total_groups,"profile records, secs",round(time.monotonic()-started,2),flush=True)
    summary={phase:{p:{name:avg_metrics(values) for name,values in bucket.items()} for p,bucket in data.items()} for phase,data in results.items()}
    candidate_names=[f"hybrid:{neg}:{gamma}" for neg in NEG_SCALES for gamma in GAMMAS]
    selection={}
    for n in PROFILE_COUNTS:
        p=str(n)
        validation=summary["validation"][p]
        test=summary["test"][p]
        if not validation["v10"] or not test["v10"]:continue
        # Tie-break toward V10 and fewer extra assumptions. A validation gain must exceed 0.0005.
        champion=max(candidate_names,key=lambda c:(validation[c]["ndcg"],c.endswith(":1.0")))
        if validation[champion]["ndcg"] < validation["v10"]["ndcg"]+.0005:champion="hybrid:1.0:1.0"
        _,neg,gamma=champion.split(":")
        # Non-inferiority + positive NDCG gain on truly unseen TEST subjects;
        # test values are a RELEASE GATE, not a post-hoc weight tuning input.
        accepted=test[champion]["ndcg"]>test["v10"]["ndcg"]+1e-6 and test[champion]["recall"]>=test["v10"]["recall"]-.002
        selection[p]={"candidate":champion,"gamma":float(gamma),"negativeScale":float(neg),"accepted":bool(accepted),"validationNdcg":validation[champion]["ndcg"],"testNdcg":test[champion]["ndcg"],"v10TestNdcg":test["v10"]["ndcg"]}
        print("PROFILE",p,"VAL",validation[champion]["ndcg"],"TEST",test[champion]["ndcg"],"V10",test["v10"]["ndcg"],"ACCEPT",accepted,flush=True)
    if set(selection)!={str(n) for n in PROFILE_COUNTS}:raise RuntimeError("Missing validation/test for any profile size")
    report={"version":"v11-2026","dataset":"MovieLens 25M","ratings":total,"films":len(ids),"trainingUsers":int(mat.shape[0]-len(held)),"holdoutUsers":len(held),"profiles":list(PROFILE_COUNTS),"validationUsers":len([u for u in held if u%2==0]),"testUsers":len([u for u in held if u%2]),"selection":selection,"validation":summary["validation"],"test":summary["test"],"methodology":"Excluded users are never used to train collaborative models; choose gamma+negative scaling using validation only, release gated on separate test; same film candidate pool and future last-20%-positive relevance; 3/5/10/20/50/100 oldest profile ratings; raw 25M ratings and per-user vectors are not published.","limitations":["MovieLens precomputed Tag Genome may include upstream signals, so not strict feature isolation","The V10 model uses a 25M-trained item-cooccurrence recommender with 5/10 frozen weights","NDCG differences are not a demonstration of statistical significance","User KNN research has no raw-user-data browser deployment; original User KNN remains"]}
    OUT.mkdir(exist_ok=True)
    (OUT/"v11-benchmark.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    config={"version":"v11-2026","dataset":"MovieLens 25M","profiles":list(PROFILE_COUNTS),"bins":{n:{"gamma":v["gamma"],"negativeScale":v["negativeScale"],"accepted":v["accepted"]} for n,v in selection.items()},"study":"validation selection and independent test gate"}
    (OUT/"v11-config.js").write_text("/* V11 non-personal aggregate weights; original ratings not published. */\nwindow.MovieRecV11Config="+json.dumps(config,separators=(",",":"))+";\n",encoding="utf-8")
    print("FINISHED, config bytes",(OUT/"v11-config.js").stat().st_size,flush=True)

if __name__=="__main__":run()
