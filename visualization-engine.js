(function(root){
'use strict';
const unit=(x,n)=>Math.max(0,Math.min(1,n?x/n:.5)),finite=x=>Number.isFinite(x)?x:0;
function pca(points,k){
const n=points.length,mean=new Float64Array(k),centered=points.map(p=>Float64Array.from(p.vector));for(const p of centered)for(let d=0;d<k;d++)mean[d]+=p[d]/n;
for(const p of centered)for(let d=0;d<k;d++)p[d]-=mean[d];
const basis=[],vecs=[];for(let axis=0;axis<2;axis++){let v=Float64Array.from({length:k},(_,i)=>Math.sin((i+1)*(axis+3)*1.37));for(let iter=0;iter<36;iter++){const next=new Float64Array(k);for(const p of centered){let scale=0;for(let j=0;j<k;j++)scale+=p[j]*v[j];for(let j=0;j<k;j++)next[j]+=scale*p[j];}for(const prev of basis){let project=0;for(let j=0;j<k;j++)project+=next[j]*prev[j];for(let j=0;j<k;j++)next[j]-=project*prev[j];}const len=Math.hypot(...next);if(len<1e-10){next.fill(0);next[axis%k]=1;v=next;break;}for(let j=0;j<k;j++)next[j]/=len;v=next;}basis.push(v);}
for(const p of centered){const vals=basis.map(v=>{let val=0;for(let d=0;d<k;d++)val+=p[d]*v[d];return val;});vecs.push(vals);}
const spans=[0,1].map(axis=>{const sorted=vecs.map(x=>x[axis]).sort((a,b)=>a-b);const lo=sorted[Math.floor(.015*(n-1))],hi=sorted[Math.floor(.985*(n-1))];return{lo,hi:hi>lo?hi:lo+1};});
return vecs.map(v=>[unit(v[0]-spans[0].lo,spans[0].hi-spans[0].lo),unit(v[1]-spans[1].lo,spans[1].hi-spans[1].lo)]);
}
function map(trained,profile=[],recommendations=[],limit=500){
const {p,fit}=trained;if(!fit.Q||!fit.k)throw Error('Item2Vec 임베딩을 사용할 수 없습니다.');
const rated=new Map(profile.map(([id,r])=>[+id,+r])),recs=new Set(recommendations.map(Number));
const chosen=new Set(p.films.map((_,i)=>i).sort((a,b)=>p.films[b].n-p.films[a].n||a-b).slice(0,limit));
for(const id of rated.keys()){const i=p.fi.get(id);if(i!==undefined)chosen.add(i);}
for(const id of recs){const i=p.fi.get(id);if(i!==undefined)chosen.add(i);}
const list=[...chosen].map(i=>({id:p.films[i].id,n:p.films[i].n,vector:Array.from(fit.Q.subarray(i*fit.k,(i+1)*fit.k))}));
if(list.length<4)throw Error('2차원 투영에 필요한 영화가 부족합니다.');
const xy=pca(list,fit.k);
return{source:'Item2Vec Skip-gram · PCA 2D 투영',total:p.films.length,points:list.map((v,i)=>({id:v.id,n:v.n,x:finite(xy[i][0]),y:finite(xy[i][1]),kind:rated.has(v.id)?rated.get(v.id)>=4?'liked':'disliked':recs.has(v.id)?'recommended':'other'}))};
}
function graph(trained,profile=[],recommendations=[],cap=26){
const {p,fit}=trained;if(fit.kind!=='association')throw Error('연관 규칙 결과가 필요합니다.');const I=p.films.length;
const rated=new Map(profile.map(([id,r])=>[+id,+r])),recommended=new Set(recommendations.map(Number));
let seeds=[...rated].filter(([,r])=>r>=4).map(([id])=>p.fi.get(id)).filter(i=>i!==undefined&&fit.counts[i]>0).slice(0,4);
if(!seeds.length)seeds=recommendations.map(id=>p.fi.get(+id)).filter(i=>i!==undefined&&fit.counts[i]>0).slice(0,2);
if(!seeds.length)seeds=p.films.map((_,i)=>i).filter(i=>fit.counts[i]>0).sort((a,b)=>fit.counts[b]-fit.counts[a]).slice(0,2);
const getCo=(i,j)=>fit.pair.get(i<j?i*I+j:j*I+i)||0;
const weight=(i,j,co)=>co/Math.sqrt(Math.max(1,fit.counts[i])*Math.max(1,fit.counts[j]));
const selected=new Set(seeds),weighted=[];
for(const i of seeds){const neighbors=[];for(let j=0;j<I;j++){if(j===i||fit.counts[j]<2)continue;const co=getCo(i,j);if(co<2)continue;neighbors.push({i,j,co,score:weight(i,j,co)});}neighbors.sort((a,b)=>b.score-a.score||b.co-a.co);weighted.push(...neighbors.slice(0,9));}
weighted.sort((a,b)=>b.score-a.score||b.co-a.co);
for(const edge of weighted){if(selected.size>=cap)break;selected.add(edge.j);}
const idx=[...selected],nodes=idx.map((i,t)=>({id:p.films[i].id,n:p.films[i].n,positive:fit.counts[i],kind:seeds.includes(i)?'seed':recommended.has(p.films[i].id)?'recommended':'other',x:.5+.34*Math.cos(t*2.39996),y:.5+.34*Math.sin(t*2.39996)}));
const edges=[];for(let a=0;a<idx.length;a++)for(let b=a+1;b<idx.length;b++){const co=getCo(idx[a],idx[b]);if(co<3)continue;const s=weight(idx[a],idx[b],co);if(seeds.includes(idx[a])||seeds.includes(idx[b])||s>=.13)edges.push({a,b,count:co,weight:s});}
edges.sort((a,b)=>b.weight-a.weight);edges.length=Math.min(65,edges.length);
if(nodes.length>1){for(let step=0;step<110;step++){const fx=nodes.map(()=>0),fy=nodes.map(()=>0);for(let a=0;a<nodes.length;a++)for(let b=a+1;b<nodes.length;b++){const dx=nodes[a].x-nodes[b].x,dy=nodes[a].y-nodes[b].y,d2=Math.max(.003,dx*dx+dy*dy),f=.00042/d2;fx[a]+=dx*f;fy[a]+=dy*f;fx[b]-=dx*f;fy[b]-=dy*f;}for(const e of edges){const dx=nodes[e.b].x-nodes[e.a].x,dy=nodes[e.b].y-nodes[e.a].y,dist=Math.sqrt(dx*dx+dy*dy)||.01,force=(dist-(e.weight>.3?.17:.26))*.018;fx[e.a]+=dx/dist*force;fy[e.a]+=dy/dist*force;fx[e.b]-=dx/dist*force;fy[e.b]-=dy/dist*force;}for(let i=0;i<nodes.length;i++){fx[i]+=(.5-nodes[i].x)*.001;fy[i]+=(.5-nodes[i].y)*.001;nodes[i].x=Math.max(.07,Math.min(.93,nodes[i].x+Math.max(-.023,Math.min(.023,fx[i]))));nodes[i].y=Math.max(.09,Math.min(.91,nodes[i].y+Math.max(-.023,Math.min(.023,fy[i]))));}}}
return{source:'MovieLens 4점 이상 공동 평가 · 연관 규칙',nodes,edges,seedCount:seeds.length,pairCriterion:'동시 고평가 최소 3명, 시각화 가능한 상위 관계'};
}
root.MovieRecVisualEngine={map,graph};
})(typeof self!=='undefined'?self:globalThis);
