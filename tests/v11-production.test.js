'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dir=path.resolve(__dirname,'..'),win={atob:s=>Buffer.from(s,'base64').toString('binary')},ctx=vm.createContext({window:win,console});
for(const file of ['ml25m-model.js','v10-model.js','v11-config.js','v10-recommender.js','v11-recommender.js'])vm.runInContext(fs.readFileSync(path.join(dir,'showcase',file),'utf8'),ctx,{filename:file});
const v10=win.MovieRecV10,v11=win.MovieRecV11;
assert.equal(v10.ready(),true);assert.equal(v11.ready(),true);
const catalog=win.MovieRec25MData.films.map(([id],index)=>({id,title:'영화 '+id,n:100+index%250}));
assert.ok(catalog.length>8000);
const seeds=win.MovieRec25MData.films.filter(x=>x[2].some(y=>y!==0)).slice(0,26).map((x,i)=>[x[0],i%4===0?1:i%3===0?2:4.5]);
assert.ok(seeds.length>=26);
for(const count of [3,5,10]){
  const profile=seeds.slice(0,count),out=v11.recommend('similarity',profile,catalog,12),old=v10.recommend('similarity',profile,catalog,12);
  assert.ok(out?.length===12,'trained V11 should return 12 results for '+count);
  assert.ok(old?.length===12,'V10 baseline must remain functional');
  assert.ok(out.every(x=>!profile.some(([id])=>id===x.movie.id)),'already-rated movies cannot be suggested');
  assert.equal(new Set(out.map(x=>x.movie.id)).size,out.length,'no duplicate recommended movies');
  assert.ok(out.every(x=>Number.isFinite(x.score)&&x.source==='MovieLens 25M V11'));
  assert.deepEqual(out.map(x=>x.movie.id),v11.recommend('similarity',profile,catalog,12).map(x=>x.movie.id),'deterministic inference');
  assert.equal(v11.info().buckets[count].accepted,true);
}
assert.equal(v11.recommend('similarity',seeds.slice(0,20),catalog,12),null,'20-film default must remain V10 when 25M heldout validation fails');
assert.ok(v11.recommend('similarity',seeds.slice(0,20),catalog,12,{experimental:true})?.length===12,'manual research-only comparison still works');
console.log('Real 25M compressed MovieRecLab V11 inference succeeded for 3/5/10 rating profiles, failed-bin fallback, and deterministic 12-card ranking.');