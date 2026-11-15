'use strict';
const E=require('../engine.js');require('../advanced.js');
const {fuse}=require('../adaptive-fusion.js'),A=globalThis.MovieRecAdvanced;
const fs=require('node:fs'),assert=require('node:assert/strict');
const SEED=20261117,PREV=20261115,COUNTS=[3,5,10,20,50,100],REPEATS=5,BOOT=8000,DEPTH=50;
const MODES=['ease','association','ncf','hybrid','user','popular','item','slim'];
const PROTOS=['A','B','C','D'],WEIGHTS=[.25,.25,.25,.25];
const SRC='https://raw.githubusercontent.com/smanihwr/ml-latest-small/ba3cd91761e54faa64483456b619d1a1f4d70971/';
function rng(seed){let x=seed>>>0;return()=>{x=(x+0x6D2B79F5)>>>0;let t=Math.imul(x^(x>>>15),1|x);t^=t+Math.imul(t^(t>>>7),61|t);return ((t^(t>>>14))>>>0)/4294967296;};}
function shuffle(items,rand){const a=items.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
const order=(a,b)=>a[3]-b[3]||a[1]-b[1];
function cases(history,n,uid){
  const h=history.slice().sort(order),m=Math.max(3,Math.floor(h.length*.2));if(h.length-m<n)return [];
  const old=h.slice(0,-m),future=h.slice(-m),out=[[0,0,old.slice(0,n),future]];
  for(let r=0;r<REPEATS;r++){
    const rand=rng(SEED+uid*100003+n*103+r*13);
    out.push([1,r,shuffle(old,rand).slice(0,n).sort(order),future]);
    out.push([2,r,h.slice(0,n),shuffle(h.slice(n),rand).slice(0,m)]);
    const s=shuffle(h,rand);out.push([3,r,s.slice(0,n).sort(order),s.slice(n,n+m)]);
  }
  return out;
}
function metrics(rank,truth){
  if(!truth.size)return [0,0,0];
  let dcg=0,hits=0,ideal=0;rank.slice(0,10).forEach((i,j)=>{if(truth.has(i)){hits++;dcg+=1/Math.log2(j+2);}});
  for(let i=0;i<Math.min(10,truth.size);i++)ideal+=1/Math.log2(i+2);
  return [dcg/ideal,hits/truth.size,Number(hits>0)];
}
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
const sd=a=>{const m=mean(a);return a.length>1?Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/(a.length-1)):0;};
function objective(matrix){return WEIGHTS.reduce((s,w,i)=>s+w*matrix[i][0],0);}
function candidates(){
  const out=MODES.map(m=>({id:m,kind:'static',models:[m],weights:[1]}));
  for(let i=0;i<MODES.length;i++)for(let j=i+1;j<MODES.length;j++)for(const w of [.25,.5,.75])out.push({id:MODES[i]+'+'+MODES[j]+':'+w,kind:'fusion',models:[MODES[i],MODES[j]],weights:[w,1-w]});
  for(const trio of [['ease','association','user'],['ease','association','popular'],['ncf','association','hybrid']])out.push({id:trio.join('+')+':equal',kind:'fusion',models:trio,weights:[1/3,1/3,1/3]});
  return out;
}
function ci(delta,alpha=.05){
  const rand=rng(SEED+50),d=[];
  for(let b=0;b<BOOT;b++){let s=0;for(let j=0;j<delta.length;j++)s+=delta[Math.floor(rand()*delta.length)];d.push(s/delta.length);}
  d.sort((a,b)=>a-b);return [d[Math.floor(alpha/2*BOOT)],d[Math.min(BOOT-1,Math.floor((1-alpha/2)*BOOT))]];
}
function aggregate(rows,coverage,empties){
  const pm=PROTOS.map((_,p)=>[0,1,2].map(j=>mean(rows.map(r=>r[p][j]))));
  const result={n:rows.length,objective:objective(pm),objective_sd:sd(rows.map(objective)),protocols:{}};
  PROTOS.forEach((name,p)=>{const cov=coverage[p].map(s=>s.size);result.protocols[name]={ndcg:pm[p][0],recall:pm[p][1],hit:pm[p][2],coverage:mean(cov),empty_truth_rate:empties[p]};});return result;
}
async function csv(name){const r=await fetch(SRC+name,{signal:AbortSignal.timeout(90000)});if(!r.ok)throw Error(name+': '+r.status);return r.text();}
function quote(x){return '"'+String(x).replaceAll('"','""')+'"';}
function getRank(model,trained,profile,seen,mode,depth){
  const r=trained[mode]?A.score(trained[mode],model,profile,depth):E.recommend(model,profile,mode,depth);
  return [...new Set(r.map(x=>x.movie.id).filter(id=>!seen.has(id)&&model.movieById.get(id)?.n>=2))].slice(0,depth);
}
function evaluate(model,trained,users,n,policies){
  const result=Object.fromEntries(policies.map(p=>[p.id,{rows:[],coverage:PROTOS.map((_,i)=>Array.from({length:i?REPEATS:1},()=>new Set()))}]));
  const empty=[0,0,0,0],caseCount=[0,0,0,0];
  const allModes=[...new Set(policies.flatMap(p=>p.models))];
  let evaluated=0;
  for(const [uid,h] of users){
    const group=cases(h,n,uid);if(!group.length)continue;evaluated++;
    const sums=Object.fromEntries(policies.map(p=>[p.id,PROTOS.map(()=>[0,0,0])]));
    for(const [pi,rep,pr,te] of group){
      const profile=pr.map(x=>[x[1],x[2]]),seen=new Set(profile.map(x=>x[0]));
      assert(te.every(x=>!seen.has(x[1])));
      const truth=new Set(te.filter(x=>x[2]>=4&&model.movieById.get(x[1])?.n>=2).map(x=>x[1]));
      empty[pi]+=Number(!truth.size);caseCount[pi]++;
      const neededFusion=new Set(policies.filter(p=>p.kind==='fusion').flatMap(p=>p.models));
      const neededDirect=new Set(policies.filter(p=>p.kind==='static').flatMap(p=>p.models));
      const long={},direct={};
      for(const mode of allModes){
        if(neededFusion.has(mode))long[mode]=getRank(model,trained,profile,seen,mode,DEPTH);
        if(neededDirect.has(mode))direct[mode]=getRank(model,trained,profile,seen,mode,10);
      }
      for(const p of policies){
        const ranked=p.kind==='static'?direct[p.models[0]]:fuse(p.models.map(m=>long[m]),p.weights,10,20,seen);
        const m=metrics(ranked,truth);
        m.forEach((v,j)=>sums[p.id][pi][j]+=v/(pi?REPEATS:1));
        ranked.forEach(id=>result[p.id].coverage[pi][rep].add(id));
      }
    }
    for(const p of policies)result[p.id].rows.push(sums[p.id]);
    if(evaluated%10===0)console.log('profile',n,'users',evaluated,'of',users.length,'policies',policies.length);
  }
  if(!evaluated)throw Error('No eligible users');
  const rates=empty.map((v,i)=>v/caseCount[i]);
  for(const p of policies)result[p.id].summary=aggregate(result[p.id].rows,result[p.id].coverage,rates);
  return result;
}
function compare(baseline,selected){
  assert.equal(baseline.rows.length,selected.rows.length);
  const diff=selected.rows.map((r,i)=>objective(r)-objective(baseline.rows[i]));
  const confidence=ci(diff,.05/COUNTS.length);
  const details=Object.fromEntries(PROTOS.map((p,i)=>[p,{
    ndcg_delta:selected.summary.protocols[p].ndcg-baseline.summary.protocols[p].ndcg,
    recall_delta:selected.summary.protocols[p].recall-baseline.summary.protocols[p].recall,
    hit_delta:selected.summary.protocols[p].hit-baseline.summary.protocols[p].hit,
    coverage_ratio:selected.summary.protocols[p].coverage/Math.max(1,baseline.summary.protocols[p].coverage),
    ndcg_ci95:ci(selected.rows.map((r,j)=>r[i][0]-baseline.rows[j][i][0]))
  }]));
  const checks={enough_test_users:diff.length>=25,objective_delta:mean(diff)>=.005,adjusted_lower_bound:confidence[0]>0,
    no_material_protocol_loss:PROTOS.every(p=>details[p].ndcg_delta>=-.005&&details[p].recall_delta>=-.005&&details[p].hit_delta>=-.02),
    coverage:PROTOS.every(p=>details[p].coverage_ratio>=.9)};
  return {passed:Object.values(checks).every(Boolean),objective_delta:mean(diff),objective_ci_bonferroni:confidence,checks,details};
}
async function run(n){
  assert(COUNTS.includes(n));
  const [movies,ratings,tags]=await Promise.all(['movies.csv','ratings.csv','tags.csv'].map(csv));
  const orig=E.parseFiles({'movies.csv':movies,'ratings.csv':ratings}),map=new Map();
  for(const r of orig.ratings){if(!map.has(r[0]))map.set(r[0],[]);map.get(r[0]).push(r);}
  const eligible=[...map].filter(([uid,h])=>h.length>=25&&h.some(x=>x[3]>0)).sort((a,b)=>a[0]-b[0]);
  const prev44=new Set(Array.from({length:44},(_,j)=>eligible[Math.floor(j*eligible.length/44)][0]));
  const prev88=new Set(shuffle(eligible.filter(([u])=>!prev44.has(u)),rng(PREV)).slice(0,88).map(x=>x[0]));
  const prev160=new Set(shuffle(eligible.filter(([u])=>!prev44.has(u)&&!prev88.has(u)),rng(20261116)).slice(0,160).map(x=>x[0]));
  const held=shuffle(eligible.filter(([u])=>!prev44.has(u)&&!prev88.has(u)&&!prev160.has(u)),rng(SEED)).slice(0,160);
  assert.equal(held.length,160);const heldIds=new Set(held.map(x=>x[0]));
  assert([...heldIds].every(x=>!prev44.has(x)&&!prev88.has(x)&&!prev160.has(x)));
  const validation=held.filter((_,i)=>i%2===0),test=held.filter((_,i)=>i%2===1);
  const tagRows=E.csv(tags).filter((r,i)=>i===0||!heldIds.has(+r[0])).map(r=>r.map(quote).join(',')).join('\n');
  const data=E.parseFiles({'movies.csv':movies,'ratings.csv':ratings,'tags.csv':tagRows});
  const model=E.createModel(data.movies,data.ratings.filter(r=>!heldIds.has(r[0])));
  assert([...heldIds].every(x=>!model.users.has(x)));
  const trained={};for(const m of MODES)if(A.labels[m]){console.log('training',m);trained[m]=A.train(m,model);}
  const policies=candidates();const val=evaluate(model,trained,validation,n,policies);
  const byKind=kind=>policies.filter(p=>p.kind===kind).sort((a,b)=>val[b.id].summary.objective-val[a.id].summary.objective||a.id.localeCompare(b.id))[0];
  const switching=byKind('static'),ensemble=byKind('fusion');
  // Simplicity margin, fixed before testing.
  const selected=val[ensemble.id].summary.objective>=val[switching.id].summary.objective+.001?ensemble:switching;
  const testPolicies=[...new Map([...policies.filter(p=>p.kind==='static'),ensemble,selected].map(p=>[p.id,p])).values()];
  console.log('locked validation selection',JSON.stringify({switching,ensemble,selected}));
  const tested=evaluate(model,trained,test,n,testPolicies);
  const gate=compare(tested.ease,tested[selected.id]);
  gate.checks.enough_validation_users=val[selected.id].summary.n>=25;
  gate.passed=Object.values(gate.checks).every(Boolean);
  const report={dataset:'MovieLens Small',input_count:n,seed:SEED,training_users:model.users.size,holdout_users:heldIds.size,validation_users:80,test_users:80,
    protocol_weights:Object.fromEntries(PROTOS.map((name,i)=>[name,WEIGHTS[i]])),repeats:REPEATS,bootstrap:BOOT,
    selection:{switching,ensemble,selected,approved:gate.passed?selected:policies.find(p=>p.id==='ease')},
    validation:Object.fromEntries(policies.map(p=>[p.id,val[p.id].summary])),
    test:Object.fromEntries(testPolicies.map(p=>[p.id,tested[p.id].summary])),
    comparisons:{selected:gate,switching:compare(tested.ease,tested[switching.id]),ensemble:compare(tested.ease,tested[ensemble.id])},
    limitations:['Only exact input counts evaluated; no inference for intermediate counts','New users disjoint from prior known 44/88/160-user experiments; other past cohorts not verified','No global time cutoff; unobserved ratings are not negatives','Gate does not tune parameters on test and does not deploy site','Separate test still used for go/no-go, not proof of universal improvement']};
  fs.mkdirSync('research-results',{recursive:true});fs.writeFileSync('research-results/v13-small-adaptive-'+n+'.json',JSON.stringify(report,null,2)+'\n');
  console.log('RESULT',JSON.stringify({n,selected,gate,baseline:tested.ease.summary,candidate:tested[selected.id].summary}));
}
if(process.argv[2]==='--self-test'){
  const h=Array.from({length:100},(_,i)=>[1,i,4,i]);const a=cases(h,10,1);assert.equal(a.length,16);
  for(const [p,r,x,y] of a){assert.equal(x.length,10);assert.equal(y.length,20);assert(x.every(v=>!y.includes(v)));if(p!==3)assert(Math.max(...x.map(v=>v[3]))<Math.min(...y.map(v=>v[3])));}
  assert.deepEqual(fuse([[1,2,3],[2,4,1]],[.5,.5],3),[2,1,4]);assert.equal(metrics([1],new Set([1]))[0],1);
  assert.equal(candidates().length,95);console.log('adaptive split/fusion invariants passed');
}else run(Number(process.argv[2])).catch(e=>{console.error(e);process.exitCode=1;});
