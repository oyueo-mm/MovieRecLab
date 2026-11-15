#!/usr/bin/env python3
"""V14 shared corpus, model payload and cold-start evaluation helpers."""
import csv,io,json,time,math,tempfile,pathlib,zipfile,urllib.request,os,subprocess,random
from array import array
from collections import defaultdict
import numpy as np
from scipy import sparse
import train_ml25m as base
import benchmark_v10 as v10
import benchmark_comprehensive_v13 as prev
SEED=20261118
COUNTS=(3,5,10,20,50,100)
ALL_COUNTS=tuple(range(3,21))+(25,30,40,50,75,100)
PROTOS=("A","B","C","D")
OUT=pathlib.Path("v14-results")
MODELS=pathlib.Path("v14-models")
prev.SEED=SEED
prev.REPEATS=5

def norm(v):
    v=np.asarray(v,np.float32)
    return v/np.maximum(1e-8,np.linalg.norm(v,axis=1,keepdims=True))

def binary(r):
    p=r.copy();p.data=(p.data>=4).astype(np.float32);p.eliminate_zeros();return p

def download_archive(path):
    # Raw data remains local to this runner, never an Actions artifact/cache.
    local=os.environ.get("V14_DATASET")
    if local:
        path=local
        with zipfile.ZipFile(path) as z:
            assert "ml-25m/ratings.csv" in z.namelist()
        return path
    for attempt in range(1,11):
        try:
            print("DATASET DOWNLOAD ATTEMPT",attempt,flush=True)
            subprocess.run(["curl","--fail","--location","--connect-timeout","35","--max-time","420","--silent","--show-error","--output",path,base.ZIP_URL],check=True)
            with zipfile.ZipFile(path) as z:
                assert all("ml-25m/"+x in z.namelist() for x in ("ratings.csv","movies.csv","links.csv","genome-scores.csv"))
            print("DATASET READY",os.path.getsize(path),flush=True)
            return path
        except (subprocess.CalledProcessError,zipfile.BadZipFile,OSError,AssertionError) as exc:
            pathlib.Path(path).unlink(missing_ok=True)
            print("DATASET DOWNLOAD FAILED",attempt,str(exc),flush=True)
            if attempt==10:raise
            time.sleep(min(120,10*2**(attempt-1))+random.uniform(0,10))

def retry(fn):
    for attempt in range(5):
        try:return fn()
        except (OSError,TimeoutError,urllib.error.URLError) as exc:
            if attempt==4:raise
            print("SMALL DATA RETRY",attempt+1,str(exc),flush=True)
            time.sleep(5*2**attempt+random.uniform(0,5))

def small_source(name):
    local=os.environ.get("V14_SMALL_DIR")
    if local:
        return (pathlib.Path(local)/name).read_bytes()
    def fetch():
        with urllib.request.urlopen(base.SMALL_BASE+name,timeout=90) as f:return f.read()
    return retry(fetch)

def local_small_meta():
    def rows(name):return list(csv.DictReader(io.StringIO(small_source(name).decode("utf-8-sig"),newline="")))
    linkset={(int(x["imdbId"]),int(x["tmdbId"])):int(x["movieId"]) for x in rows("links.csv") if x.get("imdbId","").isdigit() and x.get("tmdbId","").isdigit()}
    meta={int(x["movieId"]):{"genre":set(x["genres"].split("|"))-{"(no genres listed)"},"title":x["title"]} for x in rows("movies.csv")}
    return linkset,meta

def load(cutoff=0, native=False):
    """Train on explicit ratings, excluding a new user cohort before any fitting."""
    base.EXCLUDE_REMAINDER=61
    with tempfile.TemporaryDirectory(prefix="v14-") as tmp:
        p=download_archive(str(pathlib.Path(tmp)/"ml-25m.zip"))
        links,meta=local_small_meta()
        with zipfile.ZipFile(p) as z:
            if native:
                movies=list(base.read_csv(z,"movies.csv"))[1:]
                ids=sorted(int(row[0]) for row in movies)
                meta={int(mid):{"title":title,"genre":set(g.split("|"))-{"(no genres listed)"}} for mid,title,g in movies}
                mapping={i:i for i in ids}
            else:
                mapping=base.id_map(z,links);ids=sorted(set(mapping.values()))
            index={m:i for i,m in enumerate(ids)};map25={m:index[s] for m,s in mapping.items()}
            genome=None;found=None
            if not native and not cutoff:
                genome=np.zeros((len(ids),1128),np.float32);found=np.zeros(len(ids),bool)
                rows=iter(base.read_csv(z,"genome-scores.csv"));next(rows)
                for m,t,w in rows:
                    i=map25.get(int(m))
                    if i is not None:genome[i,int(t)-1]=float(w);found[i]=True
            u=array("i");i=array("i");v=array("f");held=defaultdict(list);total=0
            rows=iter(base.read_csv(z,"ratings.csv"));next(rows)
            for uid,mid,r,ts in rows:
                total+=1;j=map25.get(int(mid))
                if j is None:continue
                user=int(uid);stamp=int(ts);value=float(r)
                if user%509==61:held[user].append((j,value,stamp));continue
                if cutoff and stamp>cutoff:continue
                u.append(user-1);i.append(j);v.append(value)
            assert total==25000095 and len(held)>250
            r=sparse.csr_matrix((np.asarray(v,dtype=np.float32),(np.asarray(u,dtype=np.int32),np.asarray(i,dtype=np.int32))),shape=(162541,len(ids)))
            r.sum_duplicates();r.sort_indices()
        del u,i,v
    genres=sorted({g for m in ids for g in meta.get(m,{}).get("genre",set())})
    genre=norm([[float(g in meta.get(m,{}).get("genre",set())) for g in genres] for m in ids])
    pos=binary(r);usage=np.asarray(pos.sum(axis=0)).ravel()
    print("CORPUS",r.shape,r.nnz,pos.nnz,"held",len(held),"cutoff",cutoff,flush=True)
    return {"ids":np.asarray(ids,np.int32),"meta":meta,"genre":genre,"genome":genome,"found":found,"ratings":r,"pos":pos,"usage":usage,"allowed":usage>=10,"held":held,"cutoff":cutoff}

def small_ratings(ids):
    mp={int(x):i for i,x in enumerate(ids)}
    with io.BytesIO(small_source("ratings.csv")) as f:
        rows=csv.DictReader(io.TextIOWrapper(f,encoding="utf-8-sig"))
        data=[(int(x["userId"])-1,mp[int(x["movieId"])],float(x["rating"])) for x in rows if int(x["movieId"]) in mp]
    u,i,r=zip(*data)
    return sparse.csr_matrix((np.asarray(r,np.float32),(u,i)),shape=(610,len(ids)))

def profiles(d,n,phase,real_time=False):
    for uid,h in sorted(d["held"].items()):
        bucket=uid%4
        if (phase=="stack" and bucket!=0) or (phase=="validation" and bucket!=2) or (phase=="test" and bucket%2!=1):continue
        if real_time:
            pre=[x for x in h if x[2]<=d["cutoff"]];post=[x for x in h if x[2]>d["cutoff"]]
            pre.sort(key=lambda x:(x[2],x[0]))
            if len(pre)<n or not post:continue
            rng=np.random.default_rng(np.random.SeedSequence([SEED,uid,n]))
            split=[(0,0,pre[:n],post)]+[(1,j,[pre[i] for i in sorted(rng.choice(len(pre),n,replace=False))],post) for j in range(5)]
        else:split=prev.cases(h,n,uid)
        for p,r,x,y in split:
            a=np.array([i for i,v,t in x],np.int32);w=np.array([v for i,v,t in x],np.float32);ts=np.array([t for i,v,t in x],np.int64)
            truth={i for i,v,t in y if v>=4 and d["allowed"][i]}
            assert not set(a)&truth
            yield uid,p,r,a,w,ts,truth

def model(kind,**kw):return {"kind":kind,**kw}

def save(path,m):
    a={};meta={}
    for k,v in m.items():
        if sparse.issparse(v):
            v=v.tocsr();a[k+"__data"]=v.data;a[k+"__indices"]=v.indices;a[k+"__ptr"]=v.indptr;meta[k]={"sparse":list(v.shape)}
        elif isinstance(v,np.ndarray):a[k]=v
        else:meta[k]=v
    np.savez_compressed(path,meta=np.array(json.dumps(meta)),**a)

def restore(path):
    with np.load(path,allow_pickle=False) as z:
        m=json.loads(str(z["meta"]))
        for k,v in list(m.items()):
            if isinstance(v,dict) and "sparse" in v:
                m[k]=sparse.csr_matrix((z[k+"__data"],z[k+"__indices"],z[k+"__ptr"]),shape=v["sparse"])
        for k in z.files:
            if k!="meta" and "__" not in k:m[k]=z[k]
    return m

def centered(w,negative=1):
    v=np.clip((w-3)/2,-1,1);return np.where(v<0,v*negative,v).astype(np.float32)

def fold(q,ratings,bias=None,implicit=None,reg=2.):
    if not len(q):return np.zeros(q.shape[1],np.float32)
    y=ratings-3.5
    if bias is not None:y=y-bias
    if implicit is not None:y=y-q@implicit
    p=np.linalg.solve(q.T@q+np.eye(q.shape[1],dtype=np.float32)*reg,q.T@y).astype(np.float32)
    return p if implicit is None else p+implicit

def score(m,a,w,ts=None):
    v=centered(w,m.get("negative",1.))
    if m.get("time_decay",0) and ts is not None:v*=np.exp2(-(max(ts)-ts)/(86400*m["time_decay"])).astype(np.float32)
    k=m["kind"]
    if k=="pop":return m["p"]
    if k=="linear":
        b=m["b"][a]
        return np.asarray(v@b,np.float32).reshape(-1)
    if k=="latent":
        q=m["q"];x=v@q[a];return q@(x/max(1e-8,float(np.linalg.norm(x))))
    if k=="fold":
        q=m["q"];bias=m["bias"];imp=None
        if "y" in m:imp=m["y"][a].sum(axis=0)/np.sqrt(max(1,len(a)))
        p=fold(q[a],w,bias[a],imp,m.get("reg",2.))
        return q@p+bias
    if k=="ncf":
        g=m["g"];q=m["q"];p=fold(g[a],w,reg=m.get("reg",2.));x=fold(q[a],w,reg=m.get("reg",2.))
        # NeuMF concatenated GMF/MLP, full-catalog forward pass, no stored user factors.
        h=np.maximum(0,x@m["wu"]+q@m["wi"]+m["hb"])
        return (g*p)@m["og"]+h@m["oh"]+float(m["ob"])
    if k=="cohort":
        q=m["q"];x=v@q[a];x=x/max(1e-8,float(np.linalg.norm(x)))
        sim=np.maximum(0,m["centers"]@x)**3
        return (sim@m["groups"])/max(1e-8,float(sim.sum()))
    raise ValueError(k)

def rank(s,a,allowed,k=50):
    return prev.rank(s,set(a.tolist()),allowed)[:k]

def ndcg(rr,truth,k=10):
    h=[i for i,x in enumerate(rr[:k]) if int(x) in truth]
    denom=sum(1/math.log2(i+2) for i in range(min(k,len(truth))))
    return sum(1/math.log2(i+2) for i in h)/denom if denom else 0.

def evaluate(d,m,counts=COUNTS,phase="validation"):
    t=time.monotonic();by=defaultdict(list);lat=[]
    for n in counts:
        for uid,p,r,a,w,ts,truth in profiles(d,n,phase):
            stamp=time.perf_counter();rr=rank(score(m,a,w,ts),a,d["allowed"])
            lat.append(time.perf_counter()-stamp);by[(n,uid,p)].append(ndcg(rr,truth))
    groups=defaultdict(list)
    for (n,uid,p),v in by.items():groups[(n,p)].append(float(np.mean(v)))
    return {"mean":float(np.mean([np.mean(v) for v in groups.values()])) if groups else 0.,"by_count":{str(n):{PROTOS[p]:float(np.mean(v)) for (nn,p),v in groups.items() if nn==n} for n in counts},"p95_ms":float(np.quantile(lat,.95)*1000) if lat else None,"elapsed":time.monotonic()-t}

def top_sparse(b,k=200):
    # Includes signed weights; sparse row-oriented source->target.
    n=b.shape[0];k=min(k,n)
    ii=[];vv=[];ptr=[0]
    for start in range(0,n,128):
        chunk=b[start:start+128];ix=np.argpartition(np.abs(chunk),-k,axis=1)[:,-k:]
        val=np.take_along_axis(chunk,ix,axis=1)
        ii.append(ix.astype(np.int32).ravel());vv.append(val.astype(np.float32).ravel())
        ptr.extend((np.arange(1,len(chunk)+1)*k+ptr[-1]).tolist())
    return sparse.csr_matrix((np.concatenate(vv),np.concatenate(ii),np.asarray(ptr,np.int32)),shape=b.shape)

def quant(m):
    """Round deployment weights with per-array symmetric scale, then reconstruct for evaluation."""
    out={}
    for k,v in m.items():
        if sparse.issparse(v):
            x=v.copy();scale=max(float(np.max(np.abs(x.data))) if x.nnz else 0,1e-8)/32767
            x.data=(np.round(x.data/scale).clip(-32767,32767)*scale).astype(np.float32);out[k]=x
        elif isinstance(v,np.ndarray) and v.dtype.kind=="f":
            scale=max(float(np.max(np.abs(v))),1e-8)/127;out[k]=(np.round(v/scale).clip(-127,127)*scale).astype(np.float32)
        else:out[k]=v
    return out

def selftest():
    q=np.array([[1.,0.],[0.,1.],[1.,1.]],np.float32);a=np.array([0,1]);w=np.array([5.,1.],np.float32)
    for m in [model("latent",q=norm(q)),model("fold",q=q,bias=np.zeros(3,np.float32)),model("linear",b=sparse.eye(3,format="csr"))]:
        s=score(m,a,w);assert s.shape==(3,) and np.isfinite(s).all()
        with tempfile.TemporaryDirectory() as t:
            path=pathlib.Path(t)/"m.npz";save(path,m);np.testing.assert_allclose(score(restore(path),a,w),s)
    print("V14 shared model/split invariants passed")
