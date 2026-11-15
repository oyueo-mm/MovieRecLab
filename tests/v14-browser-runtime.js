'use strict';
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),{chromium}=require('playwright');
const folder=path.resolve('v14-browser');
async function main(){
 const server=http.createServer((req,res)=>{const name=path.basename(req.url);if(!name||name==='/'){res.setHeader('content-type','text/html');res.end('<html><body>MovieRecLab isolated benchmark</body></html>');return}const p=path.join(folder,name);if(!fs.existsSync(p)){res.statusCode=404;res.end();return}res.setHeader('content-type','application/json');fs.createReadStream(p).pipe(res)});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,args:['--enable-precise-memory-info']});
 try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port+'/');
 const report=await page.evaluate(async()=>{
  const manifest=await (await fetch('manifest.json')).json(),results={};
  const pct=(a,p)=>a.slice().sort((x,y)=>x-y)[Math.floor((a.length-1)*p)];
  function unpack(x){if(x.sparse)return {sparse:x.sparse,data:unpack(x.data),ix:unpack(x.ix),ptr:unpack(x.ptr)};if(!x.base64)return x;const b=Uint8Array.from(atob(x.base64),c=>c.charCodeAt(0)),v=x.dtype==='i8'?new Int8Array(b.buffer):x.dtype==='i16'?new Int16Array(b.buffer):new Int32Array(b.buffer);return {shape:x.shape,v,scale:x.scale}}
  const get=(a,i)=>a.v[i]*a.scale;
  function dot(q,i,x){let z=0,k=x.length;for(let j=0;j<k;j++)z+=get(q,i*k+j)*x[j];return z}
  function solve(q,a,w,bias,implicit,reg){const k=q.shape[1],mat=Array.from({length:k},(_,i)=>Array.from({length:k+1},(_,j)=>i===j?reg:0));for(let t=0;t<a.length;t++){let y=w[t]-3.5-(bias?get(bias,a[t]):0)-(implicit?dot(q,a[t],implicit):0);for(let i=0;i<k;i++){const qi=get(q,a[t]*k+i);mat[i][k]+=qi*y;for(let j=0;j<k;j++)mat[i][j]+=qi*get(q,a[t]*k+j)}}for(let i=0;i<k;i++){let d=mat[i][i];for(let j=i;j<=k;j++)mat[i][j]/=d;for(let h=0;h<k;h++)if(h!==i){const z=mat[h][i];for(let j=i;j<=k;j++)mat[h][j]-=z*mat[i][j]}}return mat.map((r,i)=>r[k]+(implicit?implicit[i]:0))}
  function profile(m,a,w,ts){const v=w.map((x,i)=>{let z=Math.max(-1,Math.min(1,(x-3)/2));if(z<0)z*=m.negative??1;if(m.time_decay)z*=Math.pow(2,-(Math.max(...ts)-ts[i])/(86400*m.time_decay));return z});const q=m.q,k=q?.shape[1];
   if(m.kind==='pop')return Float32Array.from(m.p.v,x=>x*m.p.scale);
   if(m.kind==='linear'){const b=m.b,out=new Float32Array(b.sparse[1]);for(let i=0;i<a.length;i++)for(let j=get(b.ptr,a[i]);j<get(b.ptr,a[i]+1);j++)out[get(b.ix,j)]+=v[i]*get(b.data,j);return out}
   if(m.kind==='fold'){let imp=null;if(m.y){imp=Array(k).fill(0);for(const i of a)for(let j=0;j<k;j++)imp[j]+=get(m.y,i*k+j)/Math.sqrt(a.length)}const x=solve(q,a,w,m.bias,imp,m.reg??2);return Float32Array.from({length:q.shape[0]},(_,i)=>dot(q,i,x)+get(m.bias,i))}
   if(m.kind==='ncf'){const g=m.g,p=solve(g,a,w,null,null,m.reg??2),x=solve(q,a,w,null,null,m.reg??2),h=m.hb.shape[0],u=Array.from({length:h},(_,j)=>get(m.hb,j)+x.reduce((sum,v,i)=>sum+v*get(m.wu,i*h+j),0));return Float32Array.from({length:q.shape[0]},(_,i)=>{let z=m.ob;for(let j=0;j<p.length;j++)z+=p[j]*get(g,i*p.length+j)*get(m.og,j);for(let j=0;j<h;j++){let b=u[j];for(let t=0;t<k;t++)b+=get(q,i*k+t)*get(m.wi,t*h+j);z+=Math.max(0,b)*get(m.oh,j)}return z})}
   const x=Array(k).fill(0);for(let t=0;t<a.length;t++)for(let j=0;j<k;j++)x[j]+=v[t]*get(q,a[t]*k+j);const length=Math.max(1e-8,Math.hypot(...x));for(let j=0;j<k;j++)x[j]/=length;
   if(m.kind==='latent')return Float32Array.from({length:q.shape[0]},(_,i)=>dot(q,i,x));
   if(m.kind==='cohort'){const n=m.groups.shape[1],out=new Float32Array(n);let z=0;for(let h=0;h<m.centers.shape[0];h++){const s=Math.max(0,dot(m.centers,h,x))**3;z+=s;for(let i=0;i<n;i++)out[i]+=s*get(m.groups,h*n+i)}for(let i=0;i<n;i++)out[i]/=Math.max(1e-8,z);return out}
   throw Error(m.kind)
  }
  for(const [name,info] of Object.entries(manifest.models)){
   let t=performance.now();const raw=await (await fetch(name+'.json',{cache:'no-store'})).json();const m=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,v&&typeof v==='object'?unpack(v):v]));const load=performance.now()-t;
   const elapsed=[],agreement=[];for(let i=0;i<manifest.profiles.length;i++){const p=manifest.profiles[i],seen=new Set(p.a);t=performance.now();const s=profile(m,p.a,p.w,p.ts);const rr=manifest.allowed.filter(i=>!seen.has(i)).sort((a,b)=>s[b]-s[a]||a-b).slice(0,10);elapsed.push(performance.now()-t);agreement.push(rr.filter(x=>info.references[i].includes(x)).length/10)}
   results[name]={local_load_decode_ms:load,p50_inference_ms:pct(elapsed,.5),p95_inference_ms:pct(elapsed,.95),mean_top10_agreement:agreement.reduce((a,b)=>a+b,0)/agreement.length,heap_bytes:performance.memory?.usedJSHeapSize??null};
  }
  return {browser:navigator.userAgent,synthetic_profiles:manifest.profiles.length,models:results,limitations:'isolated headless Chromium on CI host, localhost fetch, not mobile/network; no live site edits'};
 });
 fs.writeFileSync('v14-results/browser-runtime.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await browser.close();server.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
