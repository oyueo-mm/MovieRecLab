'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const base=path.resolve(__dirname,'..'),text=f=>fs.readFileSync(path.join(base,f),'utf8');
const movies=Array.from({length:24},(_,i)=>({id:i+1,title:'Film '+(i+1),n:100-i,genres:['Adventure']}));
let calls={v11:0,v10:0},accepted=true,unavailable=false;
const root={MovieRecV11:{ready:()=>true,recommend:(kind,rated,catalog,limit,opt)=>{calls.v11++;assert.equal(opt.experimental,false);return accepted&&!unavailable?movies.slice(5,15).map(movie=>({movie,score:.8,why:'V11'})):null;}},MovieRecV10:{ready:()=>true,recommend:()=>{calls.v10++;return unavailable?null:movies.slice(14,24).map(movie=>({movie,score:.7,why:'V10'}));}}};
vm.runInNewContext(text('showcase/v11-primary.js'),{window:root,console});
const api=root.MovieRecV11Primary,rated=[[1,5],[2,4],[3,4]];
assert.ok(api.ready());assert.equal(api.recommend(rated.slice(0,2),movies),null);
const first=api.recommend(rated,movies);assert.equal(first.source,'V11');assert.equal(first.recs.length,10);assert.deepEqual(calls,{v11:1,v10:0});
assert.equal(api.recommend(rated,movies),first);assert.equal(calls.v11,1);
accepted=false;api.reset();const fallback=api.recommend(rated,movies);assert.equal(fallback.source,'V10');assert.equal(fallback.recs.length,10);assert.equal(calls.v10,1);
unavailable=true;api.reset();assert.equal(api.recommend(rated,movies),null);
const ui=text('showcase/showcase.js'),html=text('showcase/index.html');
assert.match(ui,/if\(mode==='adaptive'&&window\.MovieRecV11Primary\?\.ready\(\)\)mode='v11-primary'/);
assert.match(ui,/bridge\.setMode\(value==='v11-primary'\?'adaptive':value\)/);
assert.match(ui,/primarySource:ranked\?\.source\|\|'Small'/);
assert.match(ui,/recs:ranked\?\.recs\|\|snap\.recs/);
assert.match(html,/src="\.\/v11-primary\.js\?v=1"/);
for(const file of ['showcase/ml25m-model.js','showcase/ml25m-recommender.js','showcase/v10-model.js','showcase/v10-recommender.js','showcase/v11-config.js','showcase/v11-recommender.js','showcase/v11-primary.js']){globalThis.window=globalThis;require(path.join(base,file));}
const ids=globalThis.MovieRec25MData.films.map(row=>row[0]),catalog=ids.map(id=>({id,title:String(id),n:1,genres:[]}));
const real=globalThis.MovieRecV11Primary;
assert.ok(real.ready());
for(const n of [3,5,10,20,50,100]){
  const profile=ids.slice(0,n).map((id,i)=>[id,i%2===0?5:4]);
  const result=real.recommend(profile,catalog);
  assert.ok(result&&result.recs.length===10,'real model '+n);
  assert.equal(result.source,n<20?'V11':'V10');
  const selected=new Set(profile.map(x=>x[0])),out=result.recs.map(x=>x.movie.id);
  assert.equal(new Set(out).size,out.length);assert.ok(out.every(id=>!selected.has(id)));
}
console.log('V11 default, real bundled weights, V10/Small fallback, cache, and selectable previous model passed');
