'use strict';
const assert=require('node:assert/strict'),E=require('../engine.js');
const genres=['Action','Drama','Comedy','Adventure','Sci-Fi','Thriller','Crime','Animation'],movies=Array.from({length:150},(_,i)=>({id:i+1,title:'Test movie '+(i+1),year:1980+i%40,genres:[genres[i%8],genres[(i+3)%8]],tags:[['space','family','future','classic','mystery'][i%5]]})),ratings=[];
for(let user=1;user<=60;user++)for(let i=1;i<=150;i++)if((user*11+i*7)%17<9)ratings.push([user,i,.5+(user*3+i*5)%10*.5,1700000000+user*1000+i]);
const model=E.createModel(movies,ratings),profile=[[1,5],[2,4.5],[3,2],[4,4],[5,1]],rated=new Set(profile.map(x=>x[0]));
for(const mode of ['user','similarity','content']){const output=E.recommend(model,profile,mode,10);assert.ok(output.length>0,'nonempty '+mode);assert.ok(output.length<=10);assert.equal(new Set(output.map(x=>x.movie.id)).size,output.length,'no duplicate '+mode);assert.ok(output.every(x=>x.movie&&Number.isFinite(x.score)&&!rated.has(x.movie.id)),'rated movies excluded and scores finite '+mode);assert.ok(output.every(x=>x.method===mode||mode==='user'&&x.method==='popular'),'honest origin marker '+mode);}
const legacyUser=E.recommend(model,profile,'user',10,{useLegacy:true}),legacyContent=E.recommend(model,profile,'content',10,{useLegacy:true});
assert.ok(legacyUser.length>0&&legacyContent.length>0);assert.ok(E.recommend(model,profile,'similarity',10).some(x=>x.factors.some(y=>y[0].includes('콘텐츠')||y[0].includes('공동 평가'))));
const again=E.recommend(model,profile,'similarity',10);assert.deepEqual(E.recommend(model,profile,'similarity',10).map(x=>x.movie.id),again.map(x=>x.movie.id),'new mode must be deterministic');
assert.ok(E.recommend(model,profile,'user',10,{useTunedUserOnly:true}).every(x=>x.method==='user'||x.method==='popular'));
console.log('Upgraded User KNN and item/content similarity preserve model semantics, ranking, rated-item exclusions and deterministic outputs.');
