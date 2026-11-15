'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),E=require('../engine.js');require('../advanced.js');const A=globalThis.MovieRecAdvanced;
const policies={3:['hybrid','slim'],5:['ncf','association','hybrid'],10:['ease','association','popular'],20:['ease','association','user']};
const movies=Array.from({length:155},(_,i)=>({id:i+1,title:'Movie '+(i+1),year:1980+i%40,genres:[['Action','Comedy','Drama','Adventure'][i%4]],tags:[]}));
const ratings=[];for(let u=1;u<=35;u++)for(let id=1;id<=movies.length;id++)if((u*7+id*3)%11<7)ratings.push([u,id,.5+((u*7+id*2)%10)*.5,1700000000+u*100+id]);
const model=E.createModel(movies,ratings),adaptive=A.train('adaptive',model),cache=new Map();
function native(mode,profile,depth){
  const raw=A.labels[mode]?(cache.has(mode)||cache.set(mode,A.train(mode,model)),A.score(cache.get(mode),model,profile,depth)):E.recommend(model,profile,mode,depth);
  const seen=new Set(profile.map(x=>x[0])),unique=new Set();return raw.map(r=>r.movie.id).filter(id=>{if(seen.has(id)||unique.has(id)||model.movieById.get(id)?.n<2)return false;unique.add(id);return true;});
}
function independentExpected(profile){
  const modes=policies[profile.length];if(!modes)return native('ease',profile,10);
  const weighted=new Map();for(const m of modes){native(m,profile,50).forEach((id,rank)=>weighted.set(id,(weighted.get(id)||0)+(1/modes.length)/(21+rank)));}
  return [...weighted].sort((a,b)=>b[1]-a[1]||a[0]-b[0]).slice(0,10).map(x=>x[0]);
}
for(const n of [0,1,2,3,4,5,6,7,9,10,11,12,19,20,21,49,50,100]){
  const profile=Array.from({length:n},(_,i)=>[i+1,[5,4.5,2,4,1][i%5]]),res=A.score(adaptive,model,profile,10);
  assert.deepEqual(A.adaptivePolicy(n),policies[n]||['ease']);
  assert.deepEqual(res.map(x=>x.movie.id),independentExpected(profile),'benchmark parity for '+n);
  assert.equal(res.length,10);assert.equal(new Set(res.map(x=>x.movie.id)).size,10);
  assert.ok(res.every(x=>Number.isFinite(x.score)&&!profile.some(([id])=>id===x.movie.id)&&x.method==='adaptive'));
}
const cached=adaptive.fit.cache.size;A.score(adaptive,model,[[1,5],[2,4],[3,3]],10);assert.equal(adaptive.fit.cache.size,cached);
const messages=[],sandbox={self:{postMessage:m=>messages.push(m)}};const context=vm.createContext(sandbox);
sandbox.importScripts=(...names)=>names.forEach(n=>vm.runInContext(fs.readFileSync(path.join(root,n),'utf8'),context));vm.runInContext(fs.readFileSync(path.join(root,'advanced-worker.js'),'utf8'),context);
sandbox.self.onmessage({data:{type:'init',movies,ratings}});
for(const mode of ['adaptive','ease','adaptive'])sandbox.self.onmessage({data:{type:'recommend',id:messages.length,mode,profile:[[1,5],[2,4],[3,4],[4,2],[5,5]],limit:10}});
assert.equal(messages.filter(x=>x.type==='error').length,0);assert.equal(messages.filter(x=>x.type==='result').length,3);
console.log('Adaptive exact-count policy, ranking parity, EASE fallback, worker and cache passed.');
