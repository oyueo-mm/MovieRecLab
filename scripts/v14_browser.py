#!/usr/bin/env python3
"""Quantization accuracy and actual browser payloads; only aggregate report uploaded."""
import base64,gzip,json,pathlib,time
import numpy as np
from scipy import sparse
import v14_common as c

def encode(a):
    a=np.ascontiguousarray(a)
    scale=1.
    if a.dtype.kind=="f":
        scale=max(float(np.max(np.abs(a))),1e-8)/127;a=np.round(a/scale).clip(-127,127).astype(np.int8)
    elif a.dtype.kind=="i":a=a.astype("<i4")
    return {"dtype":"i8" if a.dtype==np.int8 else "i32","shape":list(a.shape),"scale":scale,"base64":base64.b64encode(a.tobytes()).decode()}

def package(m):
    out={}
    for k,v in m.items():
        if sparse.issparse(v):
            x=v.tocsr();scale=max(float(np.max(np.abs(x.data))) if x.nnz else 0,1e-8)/32767
            val=np.round(x.data/scale).clip(-32767,32767).astype("<i2")
            out[k]={"sparse":list(x.shape),"data":{"dtype":"i16","shape":list(val.shape),"scale":scale,"base64":base64.b64encode(val.tobytes()).decode()},"ix":encode(x.indices),"ptr":encode(x.indptr)}
        elif isinstance(v,np.ndarray):out[k]=encode(v)
        else:out[k]=v
    return out

def main():
    d=c.load();folder=pathlib.Path("v14-browser");folder.mkdir(exist_ok=True);c.OUT.mkdir(exist_ok=True)
    report={};rng=np.random.default_rng(c.SEED);eligible=np.flatnonzero(d["allowed"]);samples=[]
    for n in (3,5,10,20,50,100):
        for _ in range(6):
            a=rng.choice(eligible,n,replace=False).astype(np.int32);w=rng.choice(np.array([1,2,3,4,5],np.float32),n);ts=np.arange(n,dtype=np.int64)*86400*30
            samples.append((a,w,ts))
    manifest={"allowed":eligible.tolist(),"profiles":[{"a":a.tolist(),"w":w.tolist(),"ts":ts.tolist()} for a,w,ts in samples],"models":{}}
    for p in sorted(c.MODELS.glob("*.npz")):
        m=c.restore(p);q=c.quant(m);name=p.stem;payload=json.dumps(package(m),separators=(",",":")).encode()
        (folder/f"{name}.json").write_bytes(payload)
        refs=[c.rank(c.score(q,a,w,ts),a,d["allowed"],10).tolist() for a,w,ts in samples]
        # Actual new-user independent test quantization accuracy, only aggregate metrics exported.
        original=c.evaluate(d,m,counts=c.COUNTS,phase="test");quantized=c.evaluate(d,q,counts=c.COUNTS,phase="test")
        report[name]={"bytes":len(payload),"gzip_bytes":len(gzip.compress(payload)),"exact_ndcg10":original["mean"],"quantized_ndcg10":quantized["mean"],"delta":quantized["mean"]-original["mean"],"synthetic_top10":len(refs)}
        manifest["models"][name]={"references":refs}
        (c.OUT/"browser-quantization.json").write_text(json.dumps(report,indent=2,allow_nan=False));print("PACKAGED",name,flush=True)
    (folder/"manifest.json").write_text(json.dumps(manifest,separators=(",",":")))
    assert report
if __name__=="__main__":main()
