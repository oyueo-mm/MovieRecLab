'use strict';
const E=require('../engine.js');require('../advanced.js');
const A=globalThis.MovieRecAdvanced,fs=require('node:fs'),assert=require('node:assert/strict');
const MODES=['popular','content','user','item','hybrid-previous','hybrid',...A.modes.filter(x=>x!=='adaptive')];
const COUNTS=[3,5,10,20,50,100],PROTOCOLS=['chronological','past_random','first_random','random'],REPEATS=5,BOOTSTRAPS=2000,SEED=20261117;
const source='https://raw.githubusercontent.com/smanihwr/ml-latest-small/ba3cd91761e54faa64483456b619d1a1f4d70971/';
function rng(seed){let x=seed>>>0;return()=>{x=(x+0x6D2B79F5)>>>0;let t=Math.imul(x^(x>>>15),1|x);t^=t+Math.imul(t^(t>>>7),61|t);return ((t^(t>>>14))>>>0)/4294967296;};}
function shuffle(items,rand){const a=items.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
const order=(a,b)=>a[3]-b[3]||a[1]-b[1];
function cases(history,n,uid){
  const sorted=history.slice().sort(order),m=Math.max(3,Math.floor(sorted.length*.2));
  if(sorted.length-m<n)return [];
  const old=sorted.slice(0,-m),future=sorted.slice(-m),out=[['chronological',0,old.slice(0,n),future]];
  for(let r=0;r<REPEATS;r++){
    const rand=rng(SEED+uid*100003+n*103+r*13);
    out.push(['past_random',r,shuffle(old,rand).slice(0,n).sort(order),future]);
    out.push(['first_random',r,sorted.slice(0,n),shuffle(sorted.slice(n),rand).slice(0,m)]);
    const s=shuffle(sorted,rand);
    out.push(['random',r,s.slice(0,n).sort(order),s.slice(n,n+m)]);
  }
  return out;
}
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
function sd(a){if(a.length<2)return 0;const m=mean(a);return Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/(a.length-1));}
function metric(ranked,truth){
  if(!truth.size)return [0,0,0];
  const hits=ranked.map((id,i)=>truth.has(id)?1/Math.log2(i+2):0),count=hits.filter(Boolean).length;
  const ideal=Array.from({length:Math.min(10,truth.size)},(_,i)=>1/Math.log2(i+2));
  return [hits.reduce((a,b)=>a+b,0)/ideal.reduce((a,b)=>a+b,0),count/truth.size,Number(count>0)];
}
function bootstrap(rows){
  const random=rng(SEED+1),dist=[[],[],[]];
  for(let b=0;b<BOOTSTRAPS;b++){
    const sums=[0,0,0];
    for(let i=0;i<rows.length;i++){const v=rows[Math.floor(random()*rows.length)];for(let j=0;j<3;j++)sums[j]+=v[j];}
    for(let j=0;j<3;j++)dist[j].push(sums[j]/rows.length);
  }
  return dist.map(x=>{x.sort((a,b)=>a-b);return [x[Math.floor(.025*x.length)],x[Math.floor(.975*x.length)]];});
}
function summarize(records){
  const rows=records.map(list=>[0,1,2].map(j=>mean(list.map(x=>x.metrics[j]))));
  const ci=bootstrap(rows),coverage=Array.from({length:records[0].length},(_,i)=>new Set(records.flatMap(list=>list[i].ranked)).size);
  const result={n:rows.length,repeats:coverage.length,empty_truth_rate:mean(records.map(list=>mean(list.map(x=>Number(x.empty))))),coverage_mean:mean(coverage),coverage_sd:sd(coverage)};
  ['ndcg','recall','hit'].forEach((k,j)=>{const a=rows.map(x=>x[j]);result[k]=mean(a);result[k+'_sd']=sd(a);result[k+'_ci95']=ci[j];});
  return {result,rows};
}
function paired(a,b){
  assert.equal(a.length,b.length);
  const rows=a.map((x,i)=>x.map((v,j)=>b[i][j]-v)),ci=bootstrap(rows);
  return Object.fromEntries(['ndcg','recall','hit'].map((k,j)=>[k,{mean:mean(rows.map(x=>x[j])),ci95:ci[j]}]));
}
async function csv(name){const r=await fetch(source+name,{signal:AbortSignal.timeout(90000)});if(!r.ok)throw Error(name+': HTTP '+r.status);return r.text();}
function quote(x){return '"'+String(x).replaceAll('"','""')+'"';}
async function run(){
  const shard=Number(process.argv[2]||0),shards=Number(process.argv[3]||1);assert(shards>0&&shard>=0&&shard<shards);
  const [movies,ratings,tags]=await Promise.all(['movies.csv','ratings.csv','tags.csv'].map(csv));
  const orig=E.parseFiles({'movies.csv':movies,'ratings.csv':ratings}),map=new Map();
  for(const r of orig.ratings){if(!map.has(r[0]))map.set(r[0],[]);map.get(r[0]).push(r);}
  const eligible=[...map].filter(([uid,h])=>h.length>=25&&h.some(x=>x[3]>0)).sort((a,b)=>a[0]-b[0]);
  const previous=new Set(Array.from({length:44},(_,j)=>eligible[Math.floor(j*eligible.length/44)][0]));
  const prev88=new Set(shuffle(eligible.filter(([uid])=>!previous.has(uid)),rng(20261115)).slice(0,88).map(x=>x[0]));
  const prev160=new Set(shuffle(eligible.filter(([u])=>!previous.has(u)&&!prev88.has(u)),rng(20261116)).slice(0,160).map(x=>x[0]));
  const chosen=shuffle(eligible.filter(([uid])=>!previous.has(uid)&&!prev88.has(uid)&&!prev160.has(uid)),rng(SEED)).slice(0,160).sort((a,b)=>a[0]-b[0]);
  assert.equal(chosen.length,160);
  const held=new Set(chosen.map(x=>x[0]));assert([...held].every(uid=>!previous.has(uid)&&!prev88.has(uid)&&!prev160.has(uid)));
  const tagRows=E.csv(tags),filteredTags=tagRows.filter((r,i)=>i===0||!held.has(+r[0])).map(r=>r.map(quote).join(',')).join('\n');
  const data=E.parseFiles({'movies.csv':movies,'ratings.csv':ratings,'tags.csv':filteredTags});
  const model=E.createModel(data.movies,data.ratings.filter(r=>!held.has(r[0])));assert([...held].every(uid=>!model.users.has(uid)));
  const groups=Object.fromEntries(COUNTS.map(n=>[n,chosen.map(([uid,h])=>cases(h,n,uid)).filter(x=>x.length)]));
  const result={dataset:'MovieLens Small',holdout_users:held.size,training_users:model.users.size,candidate_count:model.movies.filter(m=>m.n>=2).length,seed:SEED,bootstrap:BOOTSTRAPS,shard,shards,profiles:COUNTS,results:{},paired_vs_chronological:{},limitations:['Disjoint from previous known 44/88/160-user benchmark cohorts; other historical cohorts not verified','No global time cutoff','Held-out user tags removed before aggregation','No-positive targets count as zero; reported rate','Native model candidate restrictions remain; EASE/SLIM limited to 125 trained films','Coverage is mean distinct recommendations per repeat','Intervals unadjusted for multiple comparisons']};
  fs.mkdirSync('research-results',{recursive:true});
  for(const [index,mode] of MODES.entries()){
    if(index%shards!==shard)continue;
    const trained=A.labels[mode]?A.train(mode,model):null;
    for(const n of COUNTS){
      if(!groups[n].length)continue;
      const records=Object.fromEntries(PROTOCOLS.map(p=>[p,[]]));
      for(const userCases of groups[n]){
        const per=Object.fromEntries(PROTOCOLS.map(p=>[p,[]]));
        for(const [proto,rep,profile,target] of userCases){
          const input=profile.map(x=>[x[1],x[2]]),seen=new Set(input.map(x=>x[0]));assert(target.every(x=>!seen.has(x[1])));
          const truth=new Set(target.filter(x=>x[2]>=4&&model.movieById.get(x[1])?.n>=2).map(x=>x[1]));
          const recs=trained?A.score(trained,model,input,10):E.recommend(model,input,mode,10);
          const ranked=[...new Set(recs.map(x=>x.movie.id).filter(id=>!seen.has(id)&&model.movieById.get(id)?.n>=2))].slice(0,10);
          per[proto].push({metrics:metric(ranked,truth),ranked,empty:!truth.size});
        }
        for(const p of PROTOCOLS)records[p].push(per[p]);
      }
      const summaries=Object.fromEntries(PROTOCOLS.map(p=>[p,summarize(records[p])]));
      result.results[n]??={};result.paired_vs_chronological[n]??={};
      for(const p of PROTOCOLS){
        result.results[n][p]??={};result.results[n][p][mode]=summaries[p].result;
        if(p!=='chronological'){result.paired_vs_chronological[n][p]??={};result.paired_vs_chronological[n][p][mode]=paired(summaries.chronological.rows,summaries[p].rows);}
      }
      console.log('COMPLETED',mode,n,groups[n].length);
      fs.writeFileSync('research-results/v13-small-native-'+shard+'.json',JSON.stringify(result,null,2)+'\n');
    }
  }
}
if(require.main===module){
  if(process.argv[2]==='--self-test'){
    const h=Array.from({length:100},(_,i)=>[1,i,5,i]);const a=cases(h,10,1);assert.equal(a.length,16);
    for(const [p,r,x,y] of a){assert.equal(x.length,10);assert.equal(y.length,20);assert(x.every(v=>!y.includes(v)));if(p!=='random')assert(Math.max(...x.map(v=>v[3]))<Math.min(...y.map(v=>v[3])));}
    assert.deepEqual(cases(h,10,1),a);assert.equal(metric([1,2],new Set([1]))[0],1);console.log('split self-test passed');
  }else run().catch(e=>{console.error(e);process.exitCode=1;});
}
