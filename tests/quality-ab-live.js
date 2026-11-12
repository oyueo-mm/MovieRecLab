'use strict';
/* Reproducible leave-users-out quality study for real MovieLens ml-latest-small data. */
const E=require('../engine.js');
const BASE='https://raw.githubusercontent.com/smanihwr/ml-latest-small/ba3cd91761e54faa64483456b619d1a1f4d70971/';
async function load(name){const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),30000);try{const response=await fetch(BASE+name,{signal:ac.signal});if(!response.ok)throw Error(name+' HTTP '+response.status);return await response.text();}finally{clearTimeout(timer);}}
const choices=[
 {name:'content-legacy',mode:'content',options:{useLegacy:true}},
 {name:'content-v2',mode:'content',options:{}},
 {name:'content-best',mode:'content',options:{contentAverageWeight:.3,contentBestWeight:.55,contentDislikeWeight:.2,contentPriorWeight:.26}},
 {name:'content-prior',mode:'content',options:{contentAverageWeight:.5,contentBestWeight:.26,contentDislikeWeight:.14,contentPriorWeight:.52}},
 {name:'content-genre',mode:'content',options:{contentAverageWeight:.75,contentBestWeight:.4,contentDislikeWeight:.2,contentPriorWeight:.22}},
 {name:'user-legacy',mode:'user',options:{useLegacy:true}},
 {name:'user-v2',mode:'user',options:{}},
 {name:'user-pop',mode:'user',options:{userPopularityWeight:.75,userShrink:.5,userOverlapShrink:4,userSupportWeight:.05}},
 {name:'user-neighbors',mode:'user',options:{userPopularityWeight:.35,userShrink:.3,userOverlapShrink:2,userSupportWeight:.08}},
 {name:'user-stable',mode:'user',options:{userPopularityWeight:.60,userShrink:1.1,userOverlapShrink:6,userSupportWeight:.02}}
];
function statistics(){return {ndcg:0,recall:0,hit:0,people:0,coverage:new Set()};}
function evaluate(model,people,profiles){const aggregates=Object.fromEntries(choices.map(c=>[c.name,statistics()]));let valid=0;for(const [uid,history] of people){const sorted=history.slice().sort((a,b)=>a[3]-b[3]||a[1]-b[1]);const nTest=Math.max(3,Math.floor(sorted.length*.2)),initial=sorted.slice(0,-nTest).slice(0,profiles).map(r=>[r[1],r[2]]),truth=new Set(sorted.slice(-nTest).filter(r=>r[2]>=4&&model.movieById.get(r[1])?.n>=2).map(r=>r[1]));if(!truth.size||initial.length<profiles)continue;valid++;const ideal=Array.from({length:Math.min(10,truth.size)},(_,i)=>1/Math.log2(i+2)).reduce((a,b)=>a+b,0);for(const c of choices){const items=E.recommend(model,initial,c.mode,10,{...c.options,excludeUser:uid});const a=aggregates[c.name];let h=0,dcg=0;items.forEach((item,i)=>{a.coverage.add(item.movie.id);if(truth.has(item.movie.id)){h++;dcg+=1/Math.log2(i+2);}});a.ndcg+=dcg/ideal;a.recall+=h/truth.size;a.hit+=+(h>0);a.people++;}}const r=Object.fromEntries(Object.entries(aggregates).map(([name,a])=>[name,{ndcg:Number((a.ndcg/a.people).toFixed(5)),recall:Number((a.recall/a.people).toFixed(5)),hit:Number((a.hit/a.people).toFixed(5)),coverage:a.coverage.size,users:a.people}]));return {valid,results:r};}
async function main(){const [movies,ratings,links,tags]=await Promise.all(['movies.csv','ratings.csv','links.csv','tags.csv'].map(load));const parsed=E.parseFiles({'movies.csv':movies,'ratings.csv':ratings,'links.csv':links,'tags.csv':tags});const users=new Map();for(const row of parsed.ratings){if(!users.has(row[0]))users.set(row[0],[]);users.get(row[0]).push(row);}const eligible=[...users].filter(([,rs])=>rs.length>=25&&rs.some(r=>r[3]>0)).sort((a,b)=>a[0]-b[0]),count=Math.min(44,eligible.length),chosen=Array.from({length:count},(_,i)=>eligible[Math.floor(i*eligible.length/count)]),held=new Set(chosen.map(x=>x[0])),train=parsed.ratings.filter(x=>!held.has(x[0])),model=E.createModel(parsed.movies,train);console.log('MovieLens ml-latest-small, holdout-users='+chosen.length+', training='+model.users.size+', ratings='+train.length+', movies='+model.movies.length);for(const p of [5,10]){const a=evaluate(model,chosen,p);console.log('PROFILE '+p+' VALID '+a.valid);for(const c of choices){const s=a.results[c.name];console.log(c.name.padEnd(19)+' NDCG@10 '+s.ndcg.toFixed(5)+' Recall@10 '+s.recall.toFixed(5)+' Hit@10 '+s.hit.toFixed(5)+' Coverage '+s.coverage);}}}
main().catch(e=>{console.error(e);process.exitCode=1;});
