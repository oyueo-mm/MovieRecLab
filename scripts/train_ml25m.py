#!/usr/bin/env python3
"""Train compact, aggregated MovieLens-25M/Tag-Genome recommendation artifacts.
The official source ZIP and raw ratings/genome are transient CI files, never committed.
Dependencies: numpy scipy scikit-learn; Python 3.11.
"""
import argparse
import csv
import io
import json
import math
import os
import pathlib
import shutil
import tempfile
import time
import urllib.request
import zipfile
from array import array
from collections import defaultdict
import numpy as np
from scipy import sparse
from sklearn.decomposition import TruncatedSVD
from sklearn.cluster import MiniBatchKMeans

ZIP_URL = "https://files.grouplens.org/datasets/movielens/ml-25m.zip"
SMALL_BASE = "https://raw.githubusercontent.com/smanihwr/ml-latest-small/ba3cd91761e54faa64483456b619d1a1f4d70971/"
OUT_DIR = pathlib.Path("showcase")
SEED = 20261112
LATENT = 24
GROUPS = 36
EXCLUDE_REMAINDER = 17
EXCLUDE_MODULUS = 2033
BUDGET_MB = 120

def download(url, path):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "MovieRecLab-research-model/1.0"}), timeout=240) as response, open(path,"wb") as out:
        shutil.copyfileobj(response, out, 1024*1024)
    print("downloaded",path,os.path.getsize(path),"bytes",flush=True)

def load_small():
    def csv_source(file):
        with urllib.request.urlopen(SMALL_BASE+file,timeout=35) as data:
            return list(csv.DictReader(io.TextIOWrapper(data,encoding="utf-8-sig",newline="")))
    movies=csv_source("movies.csv")
    links=csv_source("links.csv")
    linkset={}
    for row in links:
        imdb,tmdb=row.get("imdbId",""),row.get("tmdbId","")
        if imdb.isdigit() and tmdb.isdigit():
            linkset[(int(imdb),int(tmdb))]=int(row["movieId"])
    meta={int(x["movieId"]):{"genre":set(x["genres"].split("|"))-{"(no genres listed)"},"title":x["title"]} for x in movies}
    return linkset,meta

def read_csv(zf,name):
    with zf.open("ml-25m/"+name) as f:
        yield from csv.reader(io.TextIOWrapper(f,encoding="utf-8-sig",newline=""))

def id_map(zf,linkset):
    rows=iter(read_csv(zf,"links.csv"));next(rows)
    mapping={}
    for mid,imdb,tmdb in rows:
        if not(imdb and tmdb and imdb.isdigit() and tmdb.isdigit()):continue
        target=linkset.get((int(imdb),int(tmdb)))
        if target is not None:mapping[int(mid)]=target
    return mapping

def normalize(a):
    norms=np.linalg.norm(a,axis=1,keepdims=True)
    return np.divide(a,np.maximum(norms,1e-8),out=np.zeros_like(a),where=norms>1e-8)

def hit_metrics(ranked,positive):
    if not positive:return (0,0,0)
    positions=[j for j,item in enumerate(ranked[:10]) if item in positive]
    ideal=sum(1/math.log2(i+2) for i in range(min(10,len(positive))))
    dcg=sum(1/math.log2(i+2) for i in positions)
    return (dcg/max(1e-8,ideal),len(positions)/len(positive),int(bool(positions)))

def prepare(zf,linkset,smallmeta):
    mapping=id_map(zf,linkset)
    ids=sorted(set(mapping.values()))
    at={id:i for i,id in enumerate(ids)}
    idx25={k:at[v] for k,v in mapping.items()}
    nfilm=len(ids)
    print("matched verified-ID movies",nfilm,"from",len(mapping),"25M link IDs",flush=True)
    assert nfilm>8000,"Movie IDs did not align across versions"
    rows=iter(read_csv(zf,"genome-scores.csv"));next(rows)
    genomes=np.zeros((nfilm,1128),dtype=np.float32)
    gfound=np.zeros(nfilm,dtype=bool)
    cnt=0
    for large,tag,weight in rows:
        i=idx25.get(int(large))
        if i is None:continue
        j=int(tag)-1
        if j<0 or j>=1128:continue
        genomes[i,j]=float(weight)
        gfound[i]=True
        cnt+=1
    print("matched tag-genome values",cnt,"movies",int(gfound.sum()),flush=True)
    assert gfound.sum()>6500,"Tag genome coverage unexpectedly low"
    ugroups=array("i");fgroups=array("i");held=defaultdict(list);rownum=0;allratings=0;usercounts=np.zeros(162542,dtype=np.int32)
    rows=iter(read_csv(zf,"ratings.csv"));next(rows)
    started=time.monotonic()
    for uid,mid,rating,stamp in rows:
        allratings+=1
        i=idx25.get(int(mid))
        if i is None:continue
        u=int(uid)
        score=float(rating)
        if u%EXCLUDE_MODULUS==EXCLUDE_REMAINDER:
            held[u].append((i,score,int(stamp)))
            continue
        if score>=4.0:
            ugroups.append(u);fgroups.append(i);usercounts[u]+=1;rownum+=1
        if allratings%5000000==0:print("processed ratings",allratings,"mapped positives",rownum,"elapsed",round(time.monotonic()-started,1),flush=True)
    assert allratings>24_000_000,"25M ratings file incomplete"
    assert rownum>5_000_000,"insufficient positive training interactions"
    U=np.frombuffer(ugroups,dtype=np.int32).copy()
    I=np.frombuffer(fgroups,dtype=np.int32).copy()
    del ugroups,fgroups
    nuser=int(max(162542,int(U.max()+1)))
    matrix=sparse.coo_matrix((np.ones(len(U),dtype=np.float32),(U,I)),shape=(nuser,nfilm),dtype=np.float32).tocsr()
    matrix.sum_duplicates();matrix.data[:]=1
    del U,I
    print("training CSR",matrix.shape,"nonzeros",matrix.nnz,"heldout",len(held),flush=True)
    return ids,smallmeta,genomes,gfound,matrix,held,allratings

def train(genome,gfound,matrix):
    nuser,nfilm=matrix.shape
    usage=np.asarray(matrix.sum(axis=0)).reshape(-1)
    usercounts=np.asarray(matrix.sum(axis=1)).reshape(-1)
    cols=np.power(np.maximum(usage,1),-.37).astype(np.float32)
    rows=np.power(np.maximum(usercounts,1),-.29).astype(np.float32)
    weighted=(sparse.diags(rows)@matrix@sparse.diags(cols)).tocsr()
    print("training collaborative SVD",LATENT,flush=True)
    svd=TruncatedSVD(n_components=LATENT,n_iter=3,random_state=SEED)
    svd.fit(weighted)
    item=normalize(svd.components_.T.astype(np.float32))
    # User projections and cluster centroids derive from held-in training users ONLY.
    users=np.asarray(weighted@svd.components_.T,dtype=np.float32)
    users=normalize(users)
    active=np.flatnonzero(usercounts>=8)
    print("clustering",len(active),"users into",GROUPS,"taste groups",flush=True)
    km=MiniBatchKMeans(n_clusters=GROUPS,batch_size=2048,max_iter=75,n_init=3,random_state=SEED)
    km.fit(users[active])
    centers=normalize(km.cluster_centers_.astype(np.float32))
    labels=km.predict(users).astype(np.int32)
    del users,weighted
    # Per-cluster positive movie counts: aggregated item preferences, not any raw user ratings.
    coo=matrix.tocoo(copy=False)
    flat=labels[coo.row].astype(np.int64)*nfilm+coo.col
    groups=np.bincount(flat,minlength=GROUPS*nfilm).reshape(GROUPS,nfilm).astype(np.float32)
    sizes=np.bincount(labels,minlength=GROUPS).astype(np.float32)
    del flat,coo
    global_rate=usage/max(1,nuser)
    cohorts=[]
    for c in range(GROUPS):
        density=groups[c]/max(1,sizes[c])
        quality=np.power(density+1e-9,.80)/np.power(global_rate+.0005,.20)
        quality=np.where((usage>=22)&(groups[c]>=5),quality,0)
        order=np.argsort(-quality,kind="stable")[:230]
        cohorts.append([(int(i),round(float(quality[i]),5)) for i in order if quality[i]>0])
    print("training Tag Genome dimensionality reduction",flush=True)
    valid=np.flatnonzero(gfound)
    matrixG=genome[valid]
    mean=matrixG.mean(axis=0)
    reducer=TruncatedSVD(n_components=LATENT,n_iter=4,random_state=SEED+1)
    vec=normalize(reducer.fit_transform(matrixG-mean).astype(np.float32))
    tags=np.zeros((nfilm,LATENT),dtype=np.float32)
    tags[valid]=vec
    return item,tags,centers,cohorts,usage,sizes

def ranker(ids,meta,item,tags,centers,cohorts,usage):
    n=len(ids);pop=np.log1p(usage).astype(np.float32)
    pop/=max(1e-8,float(pop.max()))
    membership={mid:i for i,mid in enumerate(ids)}
    all_items=np.arange(n)
    def core(profile,mode):
        anchors=[(i,float(r)) for i,r,*_ in profile if float(r)!=3 and 0<=i<n]
        if not anchors:return []
        anchor=np.array([i for i,r in anchors],dtype=np.int32)
        weights=np.array([max(-1,min(1,(r-3)/2)) for i,r in anchors],dtype=np.float32)
        exclude=set(i for i,r,*_ in profile)
        collab=normalize((weights@item[anchor])[None,:])[0]
        semantic=normalize((weights@tags[anchor])[None,:])[0]
        cf=item@collab
        sf=tags@semantic
        if mode=="tag":
            score=.57*sf+.43*cf+.065*pop
        elif mode=="user":
            closeness=centers@collab
            top=np.argsort(-closeness)[:5]
            s=np.zeros(n,dtype=np.float32);w=0
            for i in top:
                factor=float(max(0,closeness[i])**3)
                if factor<=0:continue
                w+=factor
                for rank,(j,value) in enumerate(cohorts[int(i)]):
                    s[j]+=factor*float(value)/(1+.025*rank)
            score=.50*cf+.50*(s/max(.0001,w))/max(.0001,max(s/max(.0001,w)))+.03*pop
        elif mode=="genres":
            liked=[(meta.get(ids[i],{}).get("genre",set()),(r-3)/2) for i,r in anchors]
            g=np.zeros(n,dtype=np.float32)
            for j,mid in enumerate(ids):
                gj=meta.get(mid,{}).get("genre",set())
                num=0;den=0
                for gs,w in liked:
                    if not gs or not gj:continue
                    overlap=len(gs&gj)/max(1,len(gs|gj))
                    num+=w*overlap;den+=abs(w)
                g[j]=num/max(.0001,den)
            score=g+.065*pop
        else:score=pop
        return [int(i) for i in np.argsort(-score) if int(i) not in exclude][:10]
    return core

def evaluate(held,ids,meta,item,tags,centers,cohorts,usage):
    core=ranker(ids,meta,item,tags,centers,cohorts,usage)
    result={}
    for nprofile in (5,10):
        agg={k:np.zeros(3,dtype=np.float64) for k in ("popular","genres","tag","user")}
        eligible=0
        for uid,history in sorted(held.items()):
            ordered=sorted(history,key=lambda x:(x[2],x[0]))
            ntest=max(3,int(.2*len(ordered)))
            profile=ordered[:-ntest][:nprofile]
            positives=set(i for i,r,t in ordered[-ntest:] if r>=4)
            if len(profile)<nprofile or not positives:continue
            eligible+=1
            for mode in agg:
                predicted=core(profile,mode)
                agg[mode]+=hit_metrics(predicted,positives)
        print("HOLDOUT",nprofile,"evaluated",eligible,flush=True)
        if eligible<25:raise RuntimeError("Too few held-out users to evaluate")
        result[str(nprofile)]={k:{"ndcg":round(float(v[0]/eligible),6),"recall":round(float(v[1]/eligible),6),"hit":round(float(v[2]/eligible),6)} for k,v in agg.items()}
        print("scores",nprofile,json.dumps(result[str(nprofile)]),flush=True)
    return result

def write_artifacts(ids,item,tags,centers,cohorts,usage,sizes,metrics,stats):
    # Only compact derived latent coefficients and aggregated 36-cohort preferences are published.
    # Explicit ratings, usernames, raw Tag Genome matrix, training data ZIP are NEVER published.
    quant=lambda a:[int(round(max(-1,min(1,float(v)))*120)) for v in a]
    details=[]
    for i,id in enumerate(ids):
        if usage[i]<10:continue
        details.append([id,quant(item[i]),quant(tags[i]),int(round(float(usage[i]))//5)])
    groups=[[[ids[i],int(round(value*10000))] for i,value in hits] for hits in cohorts]
    dataset={"version":"25m-2026-v9","source":"MovieLens 25M + Tag Genome","dims":LATENT,"ratingsTrained":stats["ratings"],"count":len(details),"films":details,"centers":[quant(x) for x in centers],"cohorts":groups,"evaluation":metrics}
    text="/* Derived low-dimensional research model; no original ratings or raw Tag Genome data. */\nwindow.MovieRec25MData="+json.dumps(dataset,separators=(",",":"),ensure_ascii=False)+";\n"
    OUT_DIR.mkdir(exist_ok=True)
    (OUT_DIR/"ml25m-model.js").write_text(text,encoding="utf-8")
    (OUT_DIR/"ml25m-evaluation.json").write_text(json.dumps({"dataset":"MovieLens 25M","holdout":"user-level, most recent 20%, same candidate pool","metrics":metrics,"counts":stats},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    size=(OUT_DIR/"ml25m-model.js").stat().st_size
    print("exported movie factors",len(details),"cohorts",len(groups),"bytes",size,flush=True)
    if size>12*1024*1024:raise RuntimeError("Web model too large")

def main():
    p=argparse.ArgumentParser();p.add_argument("--dataset",default="");args=p.parse_args()
    with tempfile.TemporaryDirectory(prefix="movierec-25m-") as tmp:
        archive=args.dataset or str(pathlib.Path(tmp)/"ml-25m.zip")
        if not args.dataset:download(ZIP_URL,archive)
        linkset,meta=load_small()
        with zipfile.ZipFile(archive) as zf:
            ids,meta,genome,gfound,matrix,held,total=prepare(zf,linkset,meta)
        item,tags,centers,cohorts,usage,sizes=train(genome,gfound,matrix)
        metrics=evaluate(held,ids,meta,item,tags,centers,cohorts,usage)
        stats={"ratings":total,"users":int(matrix.shape[0]),"matchedMovies":len(ids),"tagGenomeMovies":int(gfound.sum()),"testUsers":len(held),"cohorts":GROUPS}
        write_artifacts(ids,item,tags,centers,cohorts,usage,sizes,metrics,stats)
    print("COMPLETE",flush=True)

if __name__=="__main__":main()
