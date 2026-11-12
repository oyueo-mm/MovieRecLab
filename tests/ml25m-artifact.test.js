'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dir=path.resolve(__dirname,'..'),modelFile=path.join(dir,'showcase/ml25m-model.js'),reportFile=path.join(dir,'showcase/ml25m-evaluation.json');
assert.ok(fs.existsSync(modelFile),'real offline-trained 25M model must exist, cannot silently substitute fake fixture');
assert.ok(fs.existsSync(reportFile),'real user-level holdout quality evidence must exist');
assert.ok(fs.statSync(modelFile).size<12*1024*1024,'mobile payload budget must remain under 12 MiB');
const context={window:{}};vm.runInNewContext(fs.readFileSync(modelFile,'utf8'),context);
const d=context.window.MovieRec25MData,report=JSON.parse(fs.readFileSync(reportFile,'utf8'));
assert.equal(d.version,'25m-2026-v9');
assert.equal(d.dims,24);assert.equal(d.centers.length,36);assert.equal(d.cohorts.length,36);
assert.ok(d.films.length>4000);
assert.ok(d.ratingsTrained>24000000);
assert.ok(report.counts.matchedMovies>8000);
assert.ok(report.counts.tagGenomeMovies>6500);
assert.ok(report.counts.testUsers>=50);
assert.equal(new Set(Array.from(d.films,x=>x[0])).size,d.films.length,'matched MovieLens-small film IDs must be unique');
assert.ok(Array.from(d.films,x=>x[1]).every(v=>v.length===d.dims&&v.every(x=>Number.isInteger(x)&&Math.abs(x)<=120)));
assert.ok(Array.from(d.films,x=>x[2]).every(v=>v.length===d.dims&&v.every(x=>Number.isInteger(x)&&Math.abs(x)<=120)));
assert.ok(Array.from(d.films,x=>x[3]).every(Number.isFinite));
for(const [p,metrics] of Object.entries(report.metrics)){
  assert.ok(['5','10'].includes(p));
  for(const model of ['popular','genres','tag','user']){
    const score=metrics[model];
    for(const key of ['ndcg','recall','hit'])assert.ok(Number.isFinite(score[key])&&score[key]>=0&&score[key]<=1,'bounded '+key);
  }
}
const scorer=fs.readFileSync(path.join(dir,'showcase/ml25m-recommender.js'),'utf8');vm.runInNewContext(scorer,context);
assert.equal(context.window.MovieRec25M.ready(),true);
const catalog=Array.from(d.films,x=>({id:x[0],n:100,title:'영화 '+x[0]}));
let profiles=Array.from(d.films.filter(x=>x[2].some(v=>v!==0)).slice(0,10),(x,i)=>[x[0],i%3===0?5:4]);
for(const mode of ['user','similarity']){const out=context.window.MovieRec25M.recommend(mode,profiles,catalog,12);assert.ok(out?.length>=6,'usable live '+mode);assert.equal(new Set(out.map(x=>x.movie.id)).size,out.length);assert.ok(out.every(x=>!profiles.some(([id])=>id===x.movie.id)));}
console.log('Real 25M pack passed:',JSON.stringify({films:d.films.length,bytes:fs.statSync(modelFile).size,ratings:report.counts.ratings,holdout:report.counts.testUsers,metrics:report.metrics}));