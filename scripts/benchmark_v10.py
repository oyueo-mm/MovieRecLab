#!/usr/bin/env python3
"""MovieRecLab V10: true 25M user-excluded, same-pool movie recommender tournament.
All model selection is done on the validation users. The test users are untouched until final reporting.
No raw ratings, per-user factors or per-user recommendations are exported.
"""
import csv
import io
import json
import math
import os
import pathlib
import tempfile
import time
import zipfile
from collections import defaultdict
import numpy as np
from scipy import sparse
from sklearn.decomposition import TruncatedSVD
import train_ml25m as base

SEED=20261112
OUT=pathlib.Path("showcase")
MIN_POP=10
K_ITEM=75
TOP_EASE=1200
EMBED=32
def cosine(v):
    v=np.asarray(v,dtype=np.float32)
    return v/np.maximum(1e-9,np.linalg.norm(v,axis=1,keepdims=True))
def dot_score(factors,anchors,weights):
    if not len(anchors):return np.zeros(factors.shape[0],dtype=np.float32)
    v=np.asarray(weights,dtype=np.float32)@factors[np.asarray(anchors,dtype=np.int32)]
    d=np.linalg.norm(v)
    return np.asarray(factors@(v/max(1e-8,d)),dtype=np.float32)
def visible_order(scores,seen,usage,k=10):
    scores=np.asarray(scores,dtype=np.float32).copy()
    scores[usage<MIN_POP]=-1e6
    scores[list(seen)]=-1e6
    return list(np.argpartition(-scores,min(len(scores)-1,k-1))[:k][np.argsort(-scores[np.argpartition(-scores,min(len(scores)-1,k-1))[:k]])])
def metrics(items,truth):
    if not truth:return np.zeros(3,dtype=np.float64)
    indexes=[i for i,x in enumerate(items[:10]) if x in truth]
    dcg=sum(1/math.log2(i+2) for i in indexes)
    ideal=sum(1/math.log2(i+2) for i in range(min(10,len(truth))))
    return np.array([dcg/max(1e-9,ideal),len(indexes)/len(truth),int(bool(indexes))],dtype=np.float64)
def build_item_knn(mat,usage):
    print("training exact Item KNN co-occurrence matrix",flush=True)
    joint=(mat.T@mat).tocsr()
    joint.setdiag(0);joint.eliminate_zeros()
    weights=[[],[],[]];start=time.monotonic()
    indptr=[0];indices=[];vals=[]
    for i in range(mat.shape[1]):
        a,b=joint.indptr[i:i+2]
        js=joint.indices[a:b]
        count=joint.data[a:b].astype(np.float32)
        sim=count/np.sqrt(np.maximum(1,usage[i])*np.maximum(1,usage[js]))
        sim*=count/(count+20.0)
        if len(sim)>K_ITEM:
            keep=np.argpartition(-sim,K_ITEM-1)[:K_ITEM]
            js,sim=js[keep],sim[keep]
        order=np.argsort(-sim)
        indices.extend(js[order].tolist());vals.extend(sim[order].tolist());indptr.append(len(indices))
    del joint
    graph=sparse.csr_matrix((np.asarray(vals,dtype=np.float32),np.asarray(indices,dtype=np.int32),np.asarray(indptr,dtype=np.int32)),shape=(mat.shape[1],mat.shape[1]))
    print("Item KNN graph",graph.nnz,"edges, seconds",round(time.monotonic()-start,2),flush=True)
    return graph
def build_ease(mat,usage):
    chosen=np.argsort(-usage)[:TOP_EASE]
    partial=mat[:,chosen].astype(np.float64)
    gram=(partial.T@partial).toarray()
    gram[np.diag_indices_from(gram)]+=500.0
    prec=np.linalg.inv(gram)
    coeff=-prec/np.diag(prec)[None,:]
    np.fill_diagonal(coeff,0)
    print("EASE model",len(chosen),"movies: limited catalog baseline",flush=True)
    return chosen.astype(np.int32),coeff.astype(np.float32)
def build_implicit_models(mat):
    print("training implicit ALS and BPR",flush=True)
    from implicit.als import AlternatingLeastSquares
    from implicit.bpr import BayesianPersonalizedRanking
    als=AlternatingLeastSquares(factors=EMBED,regularization=.08,iterations=11,random_state=SEED,num_threads=2)
    als.fit(mat,show_progress=False)
    bpr=BayesianPersonalizedRanking(factors=EMBED,learning_rate=.035,regularization=.01,iterations=18,verify_negative_samples=True,random_state=SEED,num_threads=2)
    bpr.fit(mat,show_progress=False)
    # A new visitor is not among the 25M training users; infer by weighted liked-item vectors.
    return cosine(als.item_factors),cosine(bpr.item_factors)
class BasketSentences:
    def __init__(self,mat):self.mat=mat
    def __iter__(self):
        csr=self.mat
        for u in range(csr.shape[0]):
            start,end=csr.indptr[u:u+2]
            if end-start>=2:
                yield [str(int(i)) for i in csr.indices[start:end]]
def build_item2vec(mat):
    from gensim.models import Word2Vec
    print("training Word2Vec item embeddings from anonymous positive-item baskets",flush=True)
    model=Word2Vec(sentences=BasketSentences(mat),vector_size=EMBED,window=5,min_count=10,sg=1,negative=4,workers=2,epochs=3,seed=SEED)
    vectors=np.zeros((mat.shape[1],EMBED),dtype=np.float32)
    for i in range(mat.shape[1]):
        if str(i) in model.wv:vectors[i]=model.wv[str(i)]
    return cosine(vectors)
def v9_scores(item,tags,usage,prof,mode="tag"):
    ids=np.array([i for i,r in prof if r!=3],dtype=np.int32)
    w=np.array([np.clip((r-3)/2,-1,1) for i,r in prof if r!=3],dtype=np.float32)
    if not len(ids):return np.zeros(len(usage),dtype=np.float32)
    cf=dot_score(item,ids,w)
    tag=dot_score(tags,ids,w)
    pop=np.log1p(usage);pop/=max(1e-8,float(pop.max()))
    return .2*tag+.2*cf+.6*pop
def score_user_knn(mat,usage,prof,activeusers):
    liked=[i for i,r in prof if r>=4]
    if not liked:return np.zeros(len(usage),dtype=np.float32)
    overlap=np.asarray(mat[:,liked].sum(axis=1),dtype=np.float32).reshape(-1)
    similarities=(overlap/np.sqrt(np.maximum(1,activeusers)*len(liked)))*(overlap/(overlap+3))
    similarities[overlap<2]=0
    top=np.argpartition(-similarities,min(140,len(similarities)-1))[:140]
    valid=top[similarities[top]>0]
    if not len(valid):return np.zeros(len(usage),dtype=np.float32)
    result=np.asarray(similarities[valid]@mat[valid],dtype=np.float32).reshape(-1)
    return result/max(1e-8,float(sum(similarities[valid])))
def score_itemknn(graph,prof,n):
    indices=[i for i,r in prof if r!=3]
    if not indices:return np.zeros(n,dtype=np.float32)
    weight=np.asarray([np.clip((r-3)/2,-1,1) for i,r in prof if r!=3],dtype=np.float32)
    return np.asarray(weight@graph[indices],dtype=np.float32).reshape(-1)/max(1e-8,float(sum(abs(weight))))
def score_ease(model,prof,n):
    chosen,coeff=model
    position={int(id):j for j,id in enumerate(chosen)}
    vec=np.zeros(len(chosen),dtype=np.float32)
    for i,r in prof:
        if i in position:vec[position[i]]=np.clip((r-3)/2,-1,1)
    scores=np.full(n,-1e5,dtype=np.float32)
    if vec.any():scores[chosen]=vec@coeff
    return scores
def profile_of(history,p):
    ordered=sorted(history,key=lambda x:(x[2],x[0]))
    split=max(3,int(.2*len(ordered)))
    train=ordered[:-split]
    if len(train)<p:return None
    answers=set(i for i,r,t in ordered[-split:] if r>=4)
    if not answers:return None
    prof=[(i,r) for i,r,_ in train[:p]]
    return prof,answers
def tournament():
    start=time.monotonic()
    with tempfile.TemporaryDirectory(prefix="movierec-v10-") as tmp:
        archive=str(pathlib.Path(tmp)/"ml-25m.zip")
        base.download(base.ZIP_URL,archive)
        linkset,meta=base.load_small()
        with zipfile.ZipFile(archive) as zf:
            ids,meta,genomes,gfound,mat,held,total=base.prepare(zf,linkset,meta)
    print("MATRIX",mat.shape,mat.nnz,"heldout users",len(held),"seconds",round(time.monotonic()-start,1),flush=True)
    item,tag,centers,cohorts,usage,sizes=base.train(genomes,gfound,mat)
    knn=build_item_knn(mat,usage)
    ease=build_ease(mat,usage)
    als,bpr=build_implicit_models(mat)
    item2vec=build_item2vec(mat)
    usercounts=np.asarray(mat.sum(axis=1),dtype=np.float32).reshape(-1)
    pop=np.log1p(usage)/max(1e-8,np.log1p(usage).max())
    names=["popular","v9-tag","svd","item-knn","user-knn","ease-top1200","als","bpr","item2vec","tag+als","tag+item-knn","tag+item2vec"]
    groups={"validation":defaultdict(lambda:defaultdict(list)),"test":defaultdict(lambda:defaultdict(list))}
    top_items={}
    for user,history in sorted(held.items()):
        phase="validation" if user%2==0 else "test"
        for p in (5,10):
            context=profile_of(history,p)
            if context is None:continue
            prof,truth=context
            seen=set(i for i,r in prof)
            anchors=[i for i,r in prof if r!=3]
            w=np.array([np.clip((r-3)/2,-1,1) for i,r in prof if r!=3],dtype=np.float32)
            score={
                "popular":np.asarray(pop,dtype=np.float32),
                "v9-tag":v9_scores(item,tag,usage,prof),
                "svd":dot_score(item,anchors,w),
                "item-knn":score_itemknn(knn,prof,len(ids)),
                "user-knn":score_user_knn(mat,usage,prof,usercounts),
                "ease-top1200":score_ease(ease,prof,len(ids)),
                "als":dot_score(als,anchors,w),
                "bpr":dot_score(bpr,anchors,w),
                "item2vec":dot_score(item2vec,anchors,w)
            }
            # All candidates are ranked over the SAME 9448 verified-ID movies.
            # Hybrids combine semantic relevance with distinct collaborative estimators.
            score["tag+als"]=.52*score["v9-tag"]+.48*score["als"]
            score["tag+item-knn"]=.52*score["v9-tag"]+.48*score["item-knn"]
            score["tag+item2vec"]=.52*score["v9-tag"]+.48*score["item2vec"]
            for name in names:
                ranking=visible_order(score[name],seen,usage,10)
                groups[phase][str(p)][name].append((metrics(ranking,truth),ranking))
        if user%100==0:print("rated heldout user",user,flush=True)
    report={"dataset":"MovieLens 25M","movieCount":len(ids),"ratings":total,"trainingInteractions":int(mat.nnz),"holdoutUsers":len(held),"evaluation":"user exclusion before all model training; validation/test user split; most recent 20% relevance >=4, 5/10 earliest history ratings; same 9448-film candidate universe; NDCG/Recall/Hit@10, coverage","catalogScope":"matched MovieLens latest-small films only","models":names,"counts":{},"validation":{},"test":{}}
    for phase in ["validation","test"]:
        for p in ["5","10"]:
            report[phase][p]={}
            for name,records in groups[phase][p].items():
                if not records:continue
                x=np.array([v[0] for v in records])
                coverage=len(set(i for _,r in records for i in r))
                report[phase][p][name]={"ndcg":round(float(x[:,0].mean()),6),"recall":round(float(x[:,1].mean()),6),"hit":round(float(x[:,2].mean()),6),"coverage":coverage}
            report["counts"][phase+"_"+p]=len(groups[phase][p]["popular"])
    if min(report["counts"].values())<100:raise RuntimeError("Insufficient independently excluded validation/test users")
    # Choose a single champion for the similar-film row on validation ONLY.
    candidates=["v9-tag","item-knn","als","bpr","item2vec","tag+als","tag+item-knn","tag+item2vec","svd"]
    def val_ndcg(name):return (report["validation"]["5"][name]["ndcg"]+report["validation"]["10"][name]["ndcg"])/2
    champion=max(candidates,key=val_ndcg)
    # The user-neighbour model is only eligible when it beats simple popularity
    # on BOTH held-out test settings and has >1 real common rated movies.
    user_champion="user-knn"
    gate_user=all(report["test"][str(p)][user_champion]["ndcg"]>report["test"][str(p)]["popular"]["ndcg"] for p in (5,10))
    gate_sim=all(report["test"][str(p)][champion]["ndcg"]>report["test"][str(p)]["v9-tag"]["ndcg"] for p in (5,10))
    report["selection"]={"similarity":champion,"user":user_champion,"quality":{"user":gate_user,"similarity":gate_sim},"method":"validation-only winner, independent test requires two-profile NDCG win","baseline":"v9-tag for similar films; popularity for user neighbourhood. User KNN still requires a separate V8 equal-test comparison."}
    print("SELECTION",json.dumps(report["selection"]),flush=True)
    for p in ["5","10"]:print("TEST",p,json.dumps(report["test"][p],sort_keys=True),flush=True)
    print("ELAPSED",round(time.monotonic()-start,1),"seconds",flush=True)
    OUT.mkdir(exist_ok=True)
    (OUT/"v10-benchmark.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    # Publish model coefficients only for a validated winning similar-film method.
    # Do not upload user-level neighbourhoods, or any original ratings or raw tags.
    def quant(v):return [int(round(float(x)*120)) for x in np.clip(v,-1,1)]
    if not gate_sim:
        payload={"version":"v10-2026","champion":champion,"quality":{"similarity":False,"user":False},"model":None,"note":"No candidate beat existing V9 on both independent test profile sizes; retain V9 in production."}
    else:
        method="item-knn" if champion in ("item-knn","tag+item-knn") else "als" if champion in ("als","tag+als") else "bpr" if champion=="bpr" else "item2vec" if champion in ("item2vec","tag+item2vec") else "svd"
        matrices={"als":als,"bpr":bpr,"item2vec":item2vec,"svd":item}
        if method=="item-knn":
            rows=[]
            for i,mid in enumerate(ids):
                a,b=knn.indptr[i:i+2]
                rows.append([mid,[[ids[int(j)],int(round(float(v)*10000))] for j,v in zip(knn.indices[a:b],knn.data[a:b])]])
            feature={"type":"itemknn","rows":rows}
        else:feature={"type":method,"rows":[[mid,quant(v)] for mid,v in zip(ids,matrices[method])]}
        payload={"version":"v10-2026","champion":champion,"quality":{"similarity":True,"user":False},"model":feature,"blend":(.52,.48),"trainRatings":total,"filmcnt":len(ids)}
    js="/* Derived aggregated V10 study parameters, no original ratings or user-level profiles. */\nwindow.MovieRecV10Data="+json.dumps(payload,separators=(",",":"))+";\n"
    (OUT/"v10-model.js").write_text(js,encoding="utf-8")
    size=(OUT/"v10-model.js").stat().st_size
    if size>10*1024*1024:raise RuntimeError("V10 payload exceeds 10MB")
    print("EXPORTED",size,"bytes, quality",payload["quality"],flush=True)

if __name__=="__main__":tournament()
