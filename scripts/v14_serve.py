#!/usr/bin/env python3
"""V14 serving adapter. Exact frozen evaluated policies, no raw ratings sent to clients."""
import argparse,hashlib,json,os,pathlib,threading,time
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
import numpy as np
import v14_common as c
import v14_integration as q

ARCHIVE_SHA="8b21cfb7eb1706b4ec0aac894368d90acf26ebdfb6aced3ebd4ad5bd1eb9c6aa"
WEIGHTS=pathlib.Path(os.environ.get("V14_MODEL_DIR","v14-models"))
REPORT=pathlib.Path(os.environ.get("V14_REPORT","v14-serving/integration-3.json"))
ORIGIN=os.environ.get("V14_ORIGIN","https://oyueo-mm.github.io")
KEYS=("primary","user","content","hidden","discovery","genre")
MAX_BODY=16384
MAX_PROFILE=300

def sha(p):
    with open(p,"rb") as f:return hashlib.file_digest(f,"sha256").hexdigest()

def freeze(report):
    expected=set(map(str,c.ALL_COUNTS))
    assert set(report["results"])==expected
    policies={}
    for n,r in report["results"].items():
        method,inds,weights=r["selected"]
        assert method in ("rrf20","rrf60","borda")
        assert len(inds)==len(weights) and abs(sum(weights)-1)<1e-6
        policies[int(n)]={"method":method,"parts":tuple((r["names"][i],float(w)) for i,w in zip(inds,weights)),"user":r["rail_selection"]["user"],"similar":r["rail_selection"]["similar"],"penalty":float(r["rail_selection"]["penalty"])}
    return policies

def build_row(d,a,w,ts,models,user,baseline,service):
    scores={name:c.score(m,a,w,ts) for name,m in models.items()}
    scores.update(user(a,w));scores["v11-refit"]=baseline(a,w)
    live=service.call(a,w,False)
    ranks={m:c.rank(s,a,d["allowed"]) for m,s in scores.items()}
    ranks.update({m:r[:50] for m,r in live.items() if m!="live"})
    names=sorted(ranks);ix=np.unique(np.concatenate([ranks[m] for m in names]))
    F=np.zeros((len(ix),len(names)),np.float32);R=np.zeros_like(F);B=np.zeros_like(F);M=np.zeros_like(F)
    for h,m in enumerate(names):
        rr=ranks[m];loc=np.searchsorted(ix,rr)
        F[loc,h]=1/(20+np.arange(len(rr))+1);R[loc,h]=1/(60+np.arange(len(rr))+1);B[loc,h]=(50-np.arange(len(rr)))/50
    return (0,0,0,a,w,set(),ix,F,R,B,M,ranks,None),names

class Engine:
    def __init__(self):
        source=pathlib.Path(os.environ["V14_DATASET"])
        if sha(source)!=ARCHIVE_SHA:raise RuntimeError("MovieLens archive differs from evaluated V14")
        report=json.loads(REPORT.read_text());self.policies=freeze(report)
        self.d=c.load();d=self.d
        manifest=json.loads((WEIGHTS/"manifest.json").read_text())
        digest=hashlib.sha256(d["ids"].tobytes()).hexdigest()
        if manifest["catalog_sha256"]!=digest or manifest["explicit_train_ratings"]!=int(d["ratings"].nnz) or manifest["positive_train"]!=int(d["pos"].nnz):raise RuntimeError("corpus fingerprint mismatch")
        paths={p.stem:p for p in WEIGHTS.glob("*.npz")}
        if set(paths)!=set(manifest["weights"]):raise RuntimeError("incomplete weight set")
        for name,p in paths.items():
            if sha(p)!=manifest["weights"][name]:raise RuntimeError("weight checksum mismatch")
        self.models={name:c.restore(p) for name,p in paths.items()}
        simple,_=q.small_same(d);self.models.update(simple)
        self.pop=(d["usage"]+1)/(float(d["usage"].sum())+len(d["usage"]))
        self.models["pop"]=c.model("pop",p=self.pop)
        self.user=q.knn(d);self.baseline=q.v11_refit(d);self.service=q.Service(d)
        self.idx={int(m):i for i,m in enumerate(d["ids"])}
        self.lock=threading.Lock()
        self.report=report
    def close(self):self.service.close()
    def infer(self,a,w,ts):
        n=len(a);bucket=max(k for k in self.policies if k<=n);p=self.policies[bucket]
        row,names=build_row(self.d,a,w,ts,self.models,self.user,self.baseline,self.service)
        if names!=self.report["results"][str(bucket)]["names"]:raise RuntimeError("runtime model list differs from evaluation")
        policy=(p["method"],tuple(names.index(m) for m,_ in p["parts"]),tuple(v for _,v in p["parts"]))
        rr=q.rails(row,policy,p["user"],p["similar"],names,None,self.d["genre"],self.pop,p["penalty"])
        ids=self.d["ids"]
        return {"version":"v14","bucket":bucket,"matched":n,"extrapolated":bucket!=n,"parts":[[m,v] for m,v in p["parts"]],"method":p["method"],"rows":{k:[int(ids[i]) for i in arr] for k,arr in zip(KEYS,rr)}}
    def recommend(self,ratings):
        if not isinstance(ratings,list) or not 3<=len(ratings)<=MAX_PROFILE:raise ValueError("profile must have 3–300 ratings")
        seen=set();a=[];w=[]
        for row in ratings:
            if not isinstance(row,list) or len(row)!=2:raise ValueError("invalid rating")
            m,r=row
            if type(m) is not int or type(r) not in (int,float) or not np.isfinite(r) or not .5<=r<=5 or r*2%1:raise ValueError("invalid movie or rating")
            if m in seen:raise ValueError("duplicate movie")
            seen.add(m)
            if m in self.idx:a.append(self.idx[m]);w.append(r)
        if len(a)<3:raise ValueError("at least three matched movies required")
        # No rating timestamps in the existing browser profile. All chosen policies are non-temporal.
        return self.infer(np.array(a,np.int32),np.array(w,np.float32),np.zeros(len(a),np.int64))

def serve(engine):
    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup();self.connection.settimeout(15)
        def log_message(self,*args):pass
        def reply(self,status,payload):
            data=json.dumps(payload,separators=(",",":"),allow_nan=False).encode()
            self.send_response(status);self.send_header("Content-Type","application/json")
            self.send_header("Cache-Control","no-store")
            self.send_header("Vary","Origin")
            if self.headers.get("Origin")==ORIGIN:self.send_header("Access-Control-Allow-Origin",ORIGIN)
            self.send_header("Content-Length",str(len(data)));self.end_headers();self.wfile.write(data)
        def do_OPTIONS(self):
            if self.headers.get("Origin")!=ORIGIN:return self.reply(403,{"error":"origin not allowed"})
            self.send_response(204);self.send_header("Access-Control-Allow-Origin",ORIGIN)
            self.send_header("Access-Control-Allow-Methods","POST, GET, OPTIONS");self.send_header("Access-Control-Allow-Headers","Content-Type")
            self.send_header("Access-Control-Max-Age","600");self.end_headers()
        def do_GET(self):
            if self.path=="/health":return self.reply(200,{"ready":True,"version":"v14"})
            self.reply(404,{"error":"not found"})
        def do_POST(self):
            if self.path!="/recommend":return self.reply(404,{"error":"not found"})
            if self.headers.get("Origin")!=ORIGIN:return self.reply(403,{"error":"origin not allowed"})
            if self.headers.get("Content-Type","").split(";")[0]!="application/json":return self.reply(415,{"error":"json required"})
            try:
                size=int(self.headers.get("Content-Length","0"))
                if not 0<size<=MAX_BODY:return self.reply(413,{"error":"request too large"})
                payload=json.loads(self.rfile.read(size))
                if not isinstance(payload,dict) or set(payload)!={"ratings"}:raise ValueError("ratings required")
            except (ValueError,TypeError):return self.reply(400,{"error":"invalid request"})
            if not engine.lock.acquire(blocking=False):return self.reply(429,{"error":"busy; retry later"})
            try:
                result=engine.recommend(payload["ratings"])
            except ValueError:return self.reply(400,{"error":"invalid or insufficient matched ratings"})
            except Exception:return self.reply(503,{"error":"V14 inference unavailable"})
            finally:engine.lock.release()
            self.reply(200,result)
    server=ThreadingHTTPServer(("0.0.0.0",int(os.environ.get("PORT","8080"))),Handler)
    try:server.serve_forever()
    finally:server.server_close();engine.close()

def main():
    parser=argparse.ArgumentParser();parser.add_argument("--smoke",action="store_true");args=parser.parse_args()
    engine=Engine()
    if not args.smoke:return serve(engine)
    try:
        for n in c.ALL_COUNTS:
            uid,p,r,a,w,ts,truth=next(c.profiles(engine.d,n,"validation"))
            result=engine.infer(a,w,ts);flat=sum(result["rows"].values(),[])
            assert len(result["rows"]["primary"])>=10
            assert len(flat)==len(set(flat)) and not set(flat)&set(engine.d["ids"][a].tolist())
            assert result["bucket"]==n
            # Compare serving adapter to the original evaluation pipeline on the same profile.
            original=c.profiles
            c.profiles=lambda *args,**kwargs:iter([(uid,p,r,a,w,ts,truth)])
            try:rows,names=q.collect(engine.d,n,"validation",engine.models,engine.user,engine.baseline,engine.service)
            finally:c.profiles=original
            recorded=engine.report["results"][str(n)]
            ref=q.rails(rows[0],recorded["selected"],recorded["rail_selection"]["user"],recorded["rail_selection"]["similar"],names,None,engine.d["genre"],engine.pop,recorded["rail_selection"]["penalty"])
            assert [result["rows"][k] for k in KEYS]==[[int(engine.d["ids"][i]) for i in row] for row in ref],f"parity failed {n}"
            print("V14 exact serving parity",n,flush=True)
    finally:engine.close()

if __name__=="__main__":main()
