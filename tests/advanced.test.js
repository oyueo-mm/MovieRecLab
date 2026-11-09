'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const E=require(path.join(root,'engine.js'));
require(path.join(root,'advanced.js'));
const A=globalThis.MovieRecAdvanced;
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
for(const name of ['engine.js','advanced.js','advanced-worker.js','eval-worker.js','app.js','onboarding.js'])new vm.Script(read(name),{filename:name});
assert.equal(A.modes.length,17);
const movieCount=70,userCount=24;
const movies=Array.from({length:movieCount},(_,i)=>({id:i+1,title:'Test Movie '+(i+1),year:1980+i%40,genres:[['Action','Comedy','Drama','Sci-Fi','Romance'][i%5]],tags:[['adventure','mystery','space','family','classic'][i%5]]}));
const ratings=[];
for(let u=1;u<=userCount;u++)for(let i=1;i<=movieCount;i++)if((u*7+i*3)%11<7)ratings.push([u,i,.5+((u*7+i*2)%10)*.5,1700000000+u*100+i]);
const model=E.createModel(movies,ratings);
const profile=[[1,5],[2,4],[3,2],[4,4.5],[5,1]];
for(const mode of A.modes){
const trained=A.train(mode,model),result=A.score(trained,model,profile,10);
assert.equal(result.length,10,mode+' must return 10 recommendations');
assert.equal(new Set(result.map(x=>x.movie.id)).size,10,mode+' must not repeat movies');
assert.ok(result.every(x=>Number.isFinite(x.score)&&!profile.some(([id])=>id===x.movie.id)),mode+' must exclude rated movies and return finite scores');
assert.ok(result.every(x=>x.method===mode||x.method==='popular'),mode+' must include honest method metadata');
}
function worker(filename){
const messages=[],sandbox={self:{postMessage:msg=>messages.push(msg)}};
const context=vm.createContext(sandbox);
sandbox.importScripts=(...names)=>names.forEach(name=>vm.runInContext(read(name.replace(/^\.\//,'')),context,{filename:name}));
vm.runInContext(read(filename),context,{filename});
return{send:data=>sandbox.self.onmessage({data}),messages};
}
const advancedWorker=worker('advanced-worker.js');
advancedWorker.send({type:'init',movies,ratings});
assert.ok(advancedWorker.messages.some(x=>x.type==='ready'));
advancedWorker.send({type:'recommend',id:1,mode:'mf',profile,limit:10});
advancedWorker.send({type:'recommend',id:2,mode:'mf',profile,limit:10});
assert.equal(advancedWorker.messages.filter(x=>x.type==='training'&&x.mode==='mf').length,1,'advanced worker must cache trained models');
assert.equal(advancedWorker.messages.filter(x=>x.type==='result').length,2);
const evaluation=worker('eval-worker.js');
evaluation.send({movies,ratings,profileCount:5,maxUsers:8,advancedMode:'bpr'});
const done=evaluation.messages.find(x=>x.type==='done');
assert.ok(done,'evaluation worker must complete: '+JSON.stringify(evaluation.messages.filter(x=>x.type==='error')));
assert.equal(done.results.length,7,'evaluation must compare six baselines plus one selected advanced mode');
assert.ok(done.results.some(x=>x.mode==='bpr'&&Number.isFinite(x.ndcg)));
console.log('PASS: 17 advanced algorithms, lazy-worker cache, holdout evaluation, JS syntax');
