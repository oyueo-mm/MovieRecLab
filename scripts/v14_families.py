#!/usr/bin/env python3
"""V14 model families. Each job trains actual requested model objectives on all mapped training ratings."""
import sys,time,json,math,pathlib,resource,itertools,hashlib
import numpy as np
from scipy import sparse,linalg
from sklearn.decomposition import TruncatedSVD,LatentDirichletAllocation
from sklearn.cluster import MiniBatchKMeans
import v14_common as c
import benchmark_v10 as v10

def gram(mat):
    return (mat.T@mat).toarray().astype(np.float32)
def ease_family(d,tag):
    g=gram(d["pos"]) if tag!="ridge" else None;n=len(d["usage"])
    for lam in ((100.,500.,1500.) if tag!="ridge" else ()):
        g.flat[::n+1]+=lam
        p=linalg.cho_solve(linalg.cho_factor(g,lower=True,check_finite=False),np.eye(n,dtype=np.float32),check_finite=False)
        g.flat[::n+1]-=lam
        b=-p/np.diag(p)[None,:];np.fill_diagonal(b,0)
        del p
        for k in (100,300):
            yield "ease","ease-full-l"+str(int(lam))+"-k"+str(k),c.model("linear",b=c.top_sparse(b,k))
        # Dense exact full catalog is also evaluated, never published/deployed.
        yield "ease-exact","ease-full-exact-l"+str(int(lam)),c.model("linear",b=b),False
        del b
    if tag!="ridge":return
    # Ridge reconstruction with explicit mean-centered rating signal.
    x=d["ratings"].copy();x.data-=3.5
    g=gram(x);n=len(g)
    for lam in (100.,1000.):
        g.flat[::n+1]+=lam
        p=linalg.cho_solve(linalg.cho_factor(g,lower=True,check_finite=False),np.eye(n,dtype=np.float32),check_finite=False)
        g.flat[::n+1]-=lam
        b=-lam*p;np.fill_diagonal(b,0)
        yield "ridge","ridge-explicit-l"+str(int(lam)),c.model("linear",b=c.top_sparse(b,300))
        del p,b

def slim_family(d,tag):
    g=gram(d["pos"]);norms=np.sqrt(np.maximum(1,np.diag(g)));g/=norms[:,None];g/=norms[None,:]
    np.fill_diagonal(g,0)
    n=len(g)
    for k,alpha,l2 in ((100,.01,.05),(200,.002,.1),(200,.01,.05)):
        # All target items, restricted per-target support, nonnegative elastic net.
        rows=[];cols=[];vals=[]
        for start in range(0,n,64):
            target=np.arange(start,min(start+64,n))
            ix=np.argpartition(g[target],-k,axis=1)[:,-k:]
            q=g[target[:,None],ix];gg=g[ix[:,:,None],ix[:,None,:]].copy()
            gg[:,np.arange(k),np.arange(k)]=1+l2
            L=np.maximum(1,np.max(np.sum(np.abs(gg),axis=2),axis=1))
            w=np.zeros_like(q);z=w.copy();t=1.
            for _ in range(60):
                wn=np.maximum(0,z-(np.einsum("bij,bj->bi",gg,z)-q+alpha)/L[:,None])
                tn=(1+math.sqrt(1+4*t*t))/2;z=wn+(t-1)/tn*(wn-w);w=wn;t=tn
            # Exclude target itself even if isolated; convert normalized coefficients to original input scale.
            w=np.where(ix!=target[:,None],w*norms[target,None]/norms[ix],0.)
            pos=np.where(w>0);rows.extend(ix[pos].tolist());cols.extend(target[pos[0]].tolist());vals.extend(w[pos].tolist())
        b=sparse.csr_matrix((np.asarray(vals,np.float32),(rows,cols)),shape=(n,n))
        yield "slim",f"slim-all-target-k{k}-a{alpha}",c.model("linear",b=b)

def knn_family(d,tag):
    p=d["pos"];u=d["usage"];g=gram(p) if tag=="knn" else None
    if g is not None:np.fill_diagonal(g,0)
    for method in (("cosine","jaccard","confidence","lift") if tag=="knn" else ()):
        for k in (50,150):
            if method=="cosine":s=g/np.sqrt(np.maximum(1,u[:,None])*np.maximum(1,u[None,:]))
            elif method=="jaccard":s=g/np.maximum(1,u[:,None]+u[None,:]-g)
            elif method=="confidence":s=g/np.maximum(1,u[:,None])
            else:s=(g/np.maximum(1,u[:,None]))/(u[None,:]/max(1,p.shape[0])+.001)
            s*=g/(g+20.)
            yield "association" if method in ("confidence","lift") else "itemknn",f"{method}-k{k}",c.model("linear",b=c.top_sparse(s,k))
            del s
    del g
    # Aggregated clusters for privacy-safe user-neighbor approximation.
    for dim,groups in (((24,64),(48,128)) if tag=="cohort" else ()):
        z=TruncatedSVD(dim,n_iter=4,random_state=c.SEED).fit(p);q=c.norm(z.components_.T)
        user=c.norm(p@q);active=np.flatnonzero(np.diff(p.indptr)>=5)
        km=MiniBatchKMeans(groups,batch_size=2048,n_init=2,random_state=c.SEED).fit(user[active])
        label=km.predict(user[active]);membership=sparse.csr_matrix((np.ones(len(active),np.float32),(label,active)),shape=(groups,p.shape[0]))
        counts=np.asarray(membership.sum(axis=1)).ravel();prefs=(membership@p).toarray().astype(np.float32)
        prefs/=np.maximum(1,counts[:,None]);prefs[counts<20]=0
        yield "cohort",f"cohort-{groups}-dim{dim}",c.model("cohort",q=q,centers=c.norm(km.cluster_centers_),groups=prefs)
    # SVD and tag/genre ablation and actual calendar-time decay variants.
    for dim in ((24,64) if tag=="svd" else ()):
        z=TruncatedSVD(dim,n_iter=4,random_state=c.SEED).fit(p);q=c.norm(z.components_.T)
        for neg,decay in ((1.,0),(.5,0),(0.,0),(1.,30),(1.,180),(1.,365)):
            yield "svd",f"svd-d{dim}-neg{neg}-days{decay}",c.model("latent",q=q,negative=neg,time_decay=decay)
    if tag=="tag-genre" and d["genome"] is not None:
        v=d["found"];g=d["genome"][v];z=TruncatedSVD(48,n_iter=4,random_state=c.SEED).fit_transform(g-g.mean(axis=0))
        q=np.zeros((len(u),48),np.float32);q[v]=c.norm(z)
        for neg in (0.,.5,1.):
            yield "tag",f"tag-genome-neg{neg}",c.model("latent",q=q,negative=neg)
    if tag!="tag-genre":return
    yield "genre","genre-only",c.model("latent",q=d["genre"])
    yield "genre","genre-ridge",c.model("fold",q=d["genre"],bias=np.zeros(len(u),np.float32),reg=.5)

def text_family(d,tag):
    from gensim.models import Word2Vec
    import re
    p=d["pos"]
    for dim in ((24,48) if tag=="lda" else ()):
        lda=LatentDirichletAllocation(n_components=dim,learning_method="online",max_iter=3,batch_size=1024,n_jobs=2,random_state=c.SEED)
        lda.fit(p);yield "lda",f"lda-topics{dim}",c.model("latent",q=c.norm(lda.components_.T))
    # Distinct Word2Vec over title/genre text, not item-ID baskets.
    ids=d["ids"];corpus=[re.findall(r"[a-z0-9]+",d["meta"][int(i)]["title"].lower())+["genre_"+g.lower() for g in sorted(d["meta"][int(i)]["genre"])] for i in ids]
    for dim in ((32,64) if tag=="word2vec" else ()):
        w=Word2Vec(corpus,vector_size=dim,window=5,min_count=2,sg=1,workers=2,epochs=20,seed=c.SEED)
        q=np.array([np.mean([w.wv[t] for t in row if t in w.wv],axis=0) if any(t in w.wv for t in row) else np.zeros(dim) for row in corpus],np.float32)
        yield "word2vec",f"title-genre-word2vec-d{dim}",c.model("latent",q=c.norm(q))
    for dim in ((32,64) if tag=="item2vec" else ()):
        w=Word2Vec(sentences=v10.BasketSentences(p),vector_size=dim,window=8,min_count=5,sg=1,workers=2,negative=5,epochs=5,seed=c.SEED)
        q=np.zeros((p.shape[1],dim),np.float32)
        for i in range(len(q)):
            if str(i) in w.wv:q[i]=w.wv[str(i)]
        yield "item2vec",f"item2vec-d{dim}",c.model("latent",q=c.norm(q))

def implicit_family(d,tag):
    from implicit.als import AlternatingLeastSquares
    from implicit.bpr import BayesianPersonalizedRanking
    from sklearn.decomposition import NMF
    p=d["pos"]
    for dim,reg in (((32,.08),(64,.15)) if tag=="als" else ()):
        a=AlternatingLeastSquares(factors=dim,regularization=reg,iterations=15,random_state=c.SEED,num_threads=2)
        a.fit(p,show_progress=False)
        yield "als",f"als-d{dim}-r{reg}",c.model("latent",q=c.norm(a.item_factors))
    for dim in ((32,64) if tag=="bpr" else ()):
        b=BayesianPersonalizedRanking(factors=dim,learning_rate=.035,regularization=.01,iterations=20,verify_negative_samples=True,random_state=c.SEED,num_threads=2)
        b.fit(p,show_progress=False)
        yield "bpr",f"bpr-d{dim}",c.model("latent",q=c.norm(b.item_factors))
    for dim in ((16,32) if tag=="nmf" else ()):
        a=NMF(n_components=dim,init="nndsvda",solver="mu",max_iter=20,random_state=c.SEED).fit(p)
        yield "nmf",f"nmf-d{dim}",c.model("latent",q=c.norm(a.components_.T))

def torch_family(d,mode):
    import torch
    from torch import nn
    torch.set_num_threads(2);torch.manual_seed(c.SEED)
    r=d["ratings"];p=d["pos"];nu,ni=r.shape
    active=np.flatnonzero(np.diff(r.indptr)>0);rng=np.random.default_rng(c.SEED)
    genre=torch.from_numpy(d["genre"])
    class Net(nn.Module):
        def __init__(self,k):
            super().__init__();self.u=nn.Embedding(nu,k);self.i=nn.Embedding(ni,k);self.bias=nn.Embedding(ni,1);self.ub=nn.Embedding(nu,1)
            self.y=nn.Embedding(ni,k) if mode=="svdpp" else None
            self.g=nn.Parameter(torch.randn(genre.shape[1],k)*.025) if mode in ("fm","lightfm") else None
            self.gb=nn.Parameter(torch.zeros(genre.shape[1])) if self.g is not None else None
            if mode=="ncf":
                self.um=nn.Embedding(nu,k);self.im=nn.Embedding(ni,k);self.h=nn.Linear(2*k,32);self.o=nn.Linear(k+32,1)
                nn.init.normal_(self.um.weight,std=.045);nn.init.normal_(self.im.weight,std=.045)
            for e in (self.u,self.i,self.y):
                if e is not None:nn.init.normal_(e.weight,std=.045)
            nn.init.zeros_(self.bias.weight);nn.init.zeros_(self.ub.weight)
        def item(self,j):
            q=self.i(j);b=self.bias(j).squeeze(-1)
            if self.g is not None:
                f=genre[j];z=f@self.g
                if mode=="fm":
                    b=b+f@self.gb+(q*z).sum(-1)+.5*((z*z).sum(-1)-((f*f)@(self.g*self.g)).sum(-1))
                else:b=b+f@self.gb
                q=q+z
            return q,b
        def predict(self,u,j,imp=None):
            x=self.u(u);q,b=self.item(j)
            if imp is not None:x=x+imp
            if mode=="ncf":return self.o(torch.cat((x*q,torch.relu(self.h(torch.cat((self.um(u),self.im(j)),1)))),1)).squeeze(-1)
            return (x*q).sum(-1)+b+self.ub(u).squeeze(-1)
    for k,lr in ((24,.025),(48,.012)):
        net=Net(k);opt=torch.optim.Adagrad(net.parameters(),lr=lr,weight_decay=1e-6)
        for epoch in range(5):
            order=rng.permutation(active);total=0.;steps=0;t=time.monotonic()
            for start in range(0,len(order),256):
                users=order[start:start+256];length=np.diff(r.indptr)[users]
                ix=np.concatenate([np.arange(r.indptr[u],r.indptr[u+1]) for u in users])
                u=torch.from_numpy(np.repeat(users,length).astype(np.int64));j=torch.from_numpy(r.indices[ix].astype(np.int64));y=torch.from_numpy(r.data[ix].astype(np.float32)-3.5)
                if len(j)==0:continue
                imp=None
                if mode=="svdpp":
                    bag=torch.nn.functional.embedding_bag(j,net.y.weight,torch.from_numpy(np.r_[0,np.cumsum(length)[:-1]].astype(np.int64)),mode="sum")
                    bag=bag/torch.sqrt(torch.from_numpy(length.astype(np.float32)))[:,None];imp=torch.repeat_interleave(bag,torch.from_numpy(length.astype(np.int64)),dim=0)
                if mode=="lightfm":
                    mask=y>=.5;u=u[mask];j=j[mask]
                    if not len(j):continue
                    neg=torch.from_numpy(rng.integers(0,ni,len(j),dtype=np.int64))
                    # Rejection of observed positives before pairwise BPR loss.
                    uu=u.numpy();nnn=neg.numpy();bad=np.asarray(p[uu,nnn]).ravel()>0
                    keep=torch.from_numpy(~bad);u=u[keep];j=j[keep];neg=neg[keep]
                    if not len(j):continue
                    loss=torch.nn.functional.softplus(net.predict(u,neg)-net.predict(u,j)).mean()
                else:loss=(net.predict(u,j,imp)-y).square().mean()
                opt.zero_grad();loss.backward();opt.step();total+=float(loss.detach());steps+=1
            print(mode,k,epoch,"loss",total/max(1,steps),"seconds",round(time.monotonic()-t,1),flush=True)
        with torch.no_grad():
            q,b=net.item(torch.arange(ni));q=q.numpy().copy();b=b.numpy().copy()
            if mode=="ncf":
                h=net.h.weight.numpy().T;o=net.o.weight.numpy().ravel()
                yield mode,f"neumf-d{k}-lr{lr}",c.model("ncf",g=q,q=net.im.weight.numpy().copy(),wu=h[:k].copy(),wi=h[k:].copy(),hb=net.h.bias.numpy().copy(),og=o[:k].copy(),oh=o[k:].copy(),ob=float(net.o.bias[0]),reg=2.)
            elif mode=="lightfm":
                yield mode,f"lightfm-bpr-d{k}-lr{lr}",c.model("latent",q=c.norm(q))
            else:
                kw={"y":net.y.weight.numpy().copy()} if mode=="svdpp" else {}
                yield mode,f"{mode}-d{k}-lr{lr}",c.model("fold",q=q,bias=b,reg=2.,**kw)
        del net,opt

def lightgcn_family(d,tag):
    import torch
    torch.set_num_threads(2);torch.manual_seed(c.SEED)
    p=d["pos"];nu,ni=p.shape
    # All positive interactions participate in normalized graph propagation.
    adj=sparse.bmat([[None,p],[p.T,None]],format="csr",dtype=np.float32)
    degree=np.maximum(1,np.asarray(adj.sum(axis=1)).ravel());di=sparse.diags(1/np.sqrt(degree))
    adj=(di@adj@di).tocsr();del di
    a=torch.sparse_csr_tensor(torch.from_numpy(adj.indptr.astype(np.int64)),torch.from_numpy(adj.indices.astype(np.int64)),torch.from_numpy(adj.data),size=adj.shape)
    del adj
    coo=p.tocoo();rng=np.random.default_rng(c.SEED)
    for k,layers in ((24,2),(48,3)):
        e=torch.nn.Parameter(torch.randn(nu+ni,k)*.035);opt=torch.optim.Adam([e],lr=.025)
        for step in range(36):
            z=e;agg=e
            for _ in range(layers):z=torch.sparse.mm(a,z);agg=agg+z
            agg=agg/(layers+1)
            ix=rng.integers(0,p.nnz,size=200000)
            u=coo.row[ix];i=coo.col[ix];j=rng.integers(0,ni,len(ix));keep=np.asarray(p[u,j]).ravel()==0
            u=torch.from_numpy(u[keep].astype(np.int64));i=torch.from_numpy(i[keep].astype(np.int64))+nu;j=torch.from_numpy(j[keep].astype(np.int64))+nu
            diff=(agg[u]*(agg[i]-agg[j])).sum(1)
            loss=torch.nn.functional.softplus(-diff).mean()+1e-4*(e[u].square().mean()+e[i].square().mean()+e[j].square().mean())
            opt.zero_grad();loss.backward();opt.step()
            if step%6==0:print("LightGCN",k,layers,step,float(loss.detach()),flush=True)
        with torch.no_grad():
            z=e;agg=e
            for _ in range(layers):z=torch.sparse.mm(a,z);agg=agg+z
            q=c.norm((agg[nu:]/(layers+1)).numpy().copy())
        yield "lightgcn",f"lightgcn-d{k}-l{layers}",c.model("latent",q=q)

def family(d,mode):
    f={"ease":ease_family,"ridge":ease_family,"slim":slim_family,**{x:knn_family for x in ("knn","cohort","svd","tag-genre")},**{x:text_family for x in ("lda","word2vec","item2vec")},**{x:implicit_family for x in ("als","bpr","nmf")},"lightgcn":lightgcn_family}
    return f[mode](d,mode) if mode in f else torch_family(d,mode)

def run(mode):
    d=c.load();c.MODELS.mkdir(exist_ok=True);c.OUT.mkdir(exist_ok=True)
    report={"family":mode,"explicit_train_ratings":int(d["ratings"].nnz),"positive_train":int(d["pos"].nnz),"catalog":len(d["ids"]),"catalog_sha256":hashlib.sha256(d["ids"].tobytes()).hexdigest(),"variants":{},"selected":{},"limitations":["validation only; independent test in integration","cold-start fold-in or item vectors; no user factors exported","SLIM per-target sparse support; LightGCN sampled BPR while full graph propagates; LightFM BPR-style feature model"]}
    start=time.monotonic()
    def write():
        report["elapsed_s"]=time.monotonic()-start;report["peak_rss_mib"]=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024
        (c.OUT/f"family-{mode}.json").write_text(json.dumps(report,indent=2,allow_nan=False))
    gen=family(d,mode)
    while True:
        t=time.monotonic()
        try:entry=next(gen)
        except StopIteration:break
        group,name,m,*export=entry
        exportable=not export or export[0]
        e=c.evaluate(d,m)
        e["fit_or_build_seconds"]=time.monotonic()-t-e["elapsed"];e["exportable"]=exportable;report["variants"][name]=e
        if exportable and (group not in report["selected"] or e["mean"]>report["selected"][group]["validation"]):
            path=c.MODELS/f"{group}.npz";c.save(path,m)
            report["selected"][group]={"name":name,"validation":e["mean"],"artifact_bytes":path.stat().st_size}
        print("VARIANT",name,e["mean"],flush=True);write()
    assert report["variants"] and report["selected"];write()

if __name__=="__main__":
    if sys.argv[1]=="--self-test":c.selftest()
    else:run(sys.argv[1])
