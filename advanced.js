(function(root){
'use strict';
const labels={
association:'연관 규칙',regression:'Ridge 회귀',svd:'Truncated SVD',nmf:'NMF',mf:'MF (SGD)',
imf:'Implicit MF',bpr:'BPR-MF',fm:'Factorization Machines',lda:'LDA',word2vec:'Word2Vec',
item2vec:'Item2Vec',svdpp:'SVD++',lightfm:'LightFM형 하이브리드',ease:'EASE',slim:'SLIM',
ncf:'NCF',lightgcn:'LightGCN'
};
const descriptions={
association:'함께 4점 이상 평가한 영화의 조건부 연관성과 Lift를 계산합니다.',
regression:'입력한 평점에서 장르·연대 특성의 Ridge 회귀 계수를 추정합니다.',
svd:'중심화된 관측 평점의 희소 행렬을 저차원 특이벡터로 근사합니다.',
nmf:'관측 평점만 사용하여 비음수 사용자·영화 요인을 학습합니다.',
mf:'명시적 평점의 제곱 오차를 SGD로 최소화하는 편향 포함 행렬 분해입니다.',
imf:'4점 이상을 긍정 행동으로 변환하고 부정 샘플과 이진 선호를 학습합니다.',
bpr:'좋아한 영화가 미관측 영화보다 높은 점수를 갖도록 쌍별 학습합니다.',
fm:'사용자·영화·장르 특성 사이의 2차 상호작용을 학습합니다.',
lda:'장르와 제한된 태그의 토큰을 잠재 주제로 묶어 토픽 기반 추천을 만듭니다.',
word2vec:'장르·태그 토큰을 Skip-gram 음성 샘플링으로 학습합니다.',
item2vec:'사용자가 함께 좋아한 영화를 Skip-gram 임베딩으로 학습합니다.',
svdpp:'평점 MF에 사용자가 평가한 영화의 암묵적 요인 합을 추가합니다.',
lightfm:'사용자 벡터와 영화 ID·장르 특성 임베딩을 함께 BPR 학습합니다.',
ease:'인기 영화 하위집합의 Gram 행렬 역행렬로 선형 아이템 관계를 학습합니다.',
slim:'인기 영화 하위집합의 희소 Elastic Net 아이템 회귀를 학습합니다.',
ncf:'사용자·영화 임베딩의 비선형 MLP 상호작용으로 이진 선호를 학습합니다.',
lightgcn:'사용자-영화 상호작용 그래프에서 임베딩을 전파하고 BPR로 학습합니다.'
};
const modes=Object.keys(labels);
function rng(seed){return function(){seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};}
const sig=x=>x>30?1:x< -30?0:1/(1+Math.exp(-x));
const dot=(a,ai,b,bi,k)=>{let v=0;for(let d=0;d<k;d++)v+=a[ai*k+d]*b[bi*k+d];return v;};
function matrix(n,k,rand,scale=.12){const a=new Float32Array(n*k);for(let i=0;i<a.length;i++)a[i]=(rand()-.5)*2*scale;return a;}
function prepare(model){
const films=model.movies.filter(m=>m.n>=2),uids=[...model.users.keys()],fi=new Map(films.map((m,i)=>[m.id,i])),ui=new Map(uids.map((u,i)=>[u,i]));
const rows=[],hist=Array.from({length:uids.length},()=>[]),pos=hist.map(()=>[]),rated=hist.map(()=>new Set());
for(const [uid,entries] of model.users){const u=ui.get(uid);for(const [id,r] of entries){const i=fi.get(id);if(i===undefined)continue;rows.push([u,i,r]);hist[u].push([i,r]);rated[u].add(i);if(r>=4)pos[u].push(i);}}
const genreNames=[...model.genreDF.keys()],gi=new Map(genreNames.map((g,i)=>[g,i])),genres=films.map(m=>m.genres.map(g=>gi.get(g)).filter(x=>x!==undefined));
return{films,fi,uids,rows,hist,pos,rated,genres,ng:genreNames.length,mean:model.mean};
}
function ridgeSolve(A,b,n){const a=Float64Array.from(A),x=Float64Array.from(b);for(let i=0;i<n;i++){let p=i;for(let j=i+1;j<n;j++)if(Math.abs(a[j*n+i])>Math.abs(a[p*n+i]))p=j;for(let c=i;c<n;c++){const t=a[i*n+c];a[i*n+c]=a[p*n+c];a[p*n+c]=t;}const z=x[i];x[i]=x[p];x[p]=z;let div=a[i*n+i];if(Math.abs(div)<1e-8)div=1e-8;for(let c=i;c<n;c++)a[i*n+c]/=div;x[i]/=div;for(let j=0;j<n;j++)if(j!==i){const f=a[j*n+i];if(!f)continue;for(let c=i;c<n;c++)a[j*n+c]-=f*a[i*n+c];x[j]-=f*x[i];}}return x;}
function factorModel(p,mode){
const rand=rng(1733+modes.indexOf(mode)*79),k=12,U=p.uids.length,I=p.films.length;
const P=matrix(U,k,rand),Q=matrix(I,k,rand),bias=new Float32Array(I),rows=p.rows.slice();
const isNMF=mode==='nmf',isBPR=mode==='bpr'||mode==='lightfm',isIMF=mode==='imf',isSVDPP=mode==='svdpp',isFM=mode==='fm';
if(isNMF){for(let z=0;z<P.length;z++)P[z]=.16+rand()*.16;for(let z=0;z<Q.length;z++)Q[z]=.16+rand()*.16;}
const Y=isSVDPP?matrix(I,k,rand,.04):null,G=(isFM||mode==='lightfm')?matrix(p.ng,k,rand,.08):null;
const filmVec=(i,d)=>{let v=Q[i*k+d];if(G)for(const g of p.genres[i])v+=G[g*k+d]/Math.sqrt(Math.max(1,p.genres[i].length));return v;};
const lr=isNMF?.028:isIMF?.045:isBPR?.045:.018;
for(let epoch=0;epoch<(isSVDPP?4:isBPR?4:isFM?5:6);epoch++){
for(let a=rows.length-1;a>0;a--){const b=Math.floor(rand()*(a+1)),tmp=rows[a];rows[a]=rows[b];rows[b]=tmp;}
for(const [u,i,r] of rows){
if(isBPR&&r<4)continue;
if(isSVDPP){
const h=p.hist[u],inv=1/Math.sqrt(Math.max(1,h.length)),z=new Float32Array(k);for(const [j] of h)for(let d=0;d<k;d++)z[d]+=Y[j*k+d]*inv;
let pred=3.5+bias[i];for(let d=0;d<k;d++)pred+=(P[u*k+d]+z[d])*Q[i*k+d];const err=Math.max(-3,Math.min(3,r-pred));bias[i]+=lr*(err-.01*bias[i]);
for(let d=0;d<k;d++){const a=u*k+d,b=i*k+d,pu=P[a],qi=Q[b];P[a]+=lr*(err*qi-.045*pu);Q[b]+=lr*(err*(pu+z[d])-.045*qi);const dy=lr*err*qi*inv/Math.max(1,h.length/15);for(const [j] of h)Y[j*k+d]+=(dy-lr*.001*Y[j*k+d]);}continue;}
if(isBPR||isIMF){
if(isIMF&&r<4&&rand()<.7)continue;
let j=Math.floor(rand()*I),tries=0;while(p.rated[u].has(j)&&tries++<15)j=Math.floor(rand()*I);if(j===i)continue;
const z=new Float32Array(k),t=new Float32Array(k);
for(let d=0;d<k;d++){z[d]=filmVec(i,d);t[d]=filmVec(j,d);}
let delta=0;for(let d=0;d<k;d++)delta+=P[u*k+d]*(z[d]-t[d]);const grad=1-sig(delta),eta=lr*(isIMF?.65:1);
for(let d=0;d<k;d++){const a=u*k+d,b=i*k+d,c=j*k+d,old=P[a];P[a]+=eta*(grad*(z[d]-t[d])-.015*old);Q[b]+=eta*(grad*old-.015*Q[b]);Q[c]+=eta*(-grad*old-.015*Q[c]);if(G){for(const g of p.genres[i])G[g*k+d]+=eta*.5*grad*old/Math.sqrt(Math.max(1,p.genres[i].length));for(const g of p.genres[j])G[g*k+d]-=eta*.5*grad*old/Math.sqrt(Math.max(1,p.genres[j].length));}}continue;}
let pred=isNMF?0:3.5+bias[i];const z=new Float32Array(k);
for(let d=0;d<k;d++){z[d]=filmVec(i,d);pred+=P[u*k+d]*z[d];}
const target=isNMF?r/5:r,err=Math.max(-3,Math.min(3,target-pred));
if(!isNMF)bias[i]+=lr*(err-.02*bias[i]);
for(let d=0;d<k;d++){const a=u*k+d,b=i*k+d,old=P[a];P[a]+=lr*(err*z[d]-.03*old);Q[b]+=lr*(err*old-.03*Q[b]);if(isNMF){P[a]=Math.max(0,P[a]);Q[b]=Math.max(0,Q[b]);}if(G)for(const g of p.genres[i])G[g*k+d]+=lr*(err*old/Math.sqrt(Math.max(1,p.genres[i].length))-.03*G[g*k+d]);}
}
}
if(G)for(let i=0;i<I;i++)for(let d=0;d<k;d++)Q[i*k+d]=filmVec(i,d);
return{kind:'factors',k,Q,bias,Y,nonnegative:isNMF,rank:isBPR||isIMF||mode==='lightfm'};
}
function truncatedSVD(p){
const I=p.films.length,U=p.uids.length,k=12,Q=new Float32Array(I*k),P=new Float32Array(U*k),r=rng(6628);
for(let d=0;d<k;d++){
let v=Float64Array.from({length:I},()=>r()-.5),u=new Float64Array(U);
for(let iteration=0;iteration<7;iteration++){
u.fill(0);for(const [uid,i,rate] of p.rows)u[uid]+=(rate-p.mean)*v[i];
let un=Math.hypot(...u.slice(0,Math.min(800,u.length)));if(un<1e-10)un=1;for(let x=0;x<U;x++)u[x]/=un;
v.fill(0);for(const [uid,i,rate] of p.rows)v[i]+=(rate-p.mean)*u[uid];
for(let prev=0;prev<d;prev++){let proj=0;for(let i=0;i<I;i++)proj+=v[i]*Q[i*k+prev];for(let i=0;i<I;i++)v[i]-=proj*Q[i*k+prev];}
let vn=0;for(let i=0;i<I;i++)vn+=v[i]*v[i];vn=Math.sqrt(vn)||1;for(let i=0;i<I;i++)v[i]/=vn;
}
for(let i=0;i<I;i++)Q[i*k+d]=v[i]*4;for(let uid=0;uid<U;uid++)P[uid*k+d]=u[uid];
}
return{kind:'factors',k,Q,bias:new Float32Array(I),rank:false};
}
function pairwiseCounts(p){
const I=p.films.length,counts=new Float32Array(I),pair=new Map();
for(const likes of p.pos){const take=likes.length>130?likes.slice(0,130):likes;for(const i of take)counts[i]++;
for(let a=0;a<take.length;a++)for(let b=a+1;b<take.length;b++){const x=take[a],y=take[b],key=x<y?x*I+y:y*I+x;pair.set(key,(pair.get(key)||0)+1);}}
return{kind:'association',counts,pair,n:p.uids.length};
}
function pairLinear(p,mode){
const top=p.films.map((m,i)=>i).sort((a,b)=>p.films[b].n-p.films[a].n).slice(0,125),n=top.length,where=new Map(top.map((j,i)=>[j,i])),G=new Float64Array(n*n);
for(const likes of p.pos){const a=likes.map(i=>where.get(i)).filter(i=>i!==undefined);for(const i of a)for(const j of a)G[i*n+j]++;}
const B=new Float32Array(n*n);
if(mode==='ease'){
const M=Float64Array.from(G);for(let i=0;i<n;i++)M[i*n+i]+=120;
const inv=new Float64Array(n*n);for(let i=0;i<n;i++)inv[i*n+i]=1;
for(let i=0;i<n;i++){let pivot=i;for(let t=i+1;t<n;t++)if(Math.abs(M[t*n+i])>Math.abs(M[pivot*n+i]))pivot=t;
for(let c=0;c<n;c++){let temp=M[i*n+c];M[i*n+c]=M[pivot*n+c];M[pivot*n+c]=temp;temp=inv[i*n+c];inv[i*n+c]=inv[pivot*n+c];inv[pivot*n+c]=temp;}
const div=M[i*n+i]||1e-8;for(let c=0;c<n;c++){M[i*n+c]/=div;inv[i*n+c]/=div;}
for(let j=0;j<n;j++){if(i===j)continue;const f=M[j*n+i];if(!f)continue;for(let c=0;c<n;c++){M[j*n+c]-=f*M[i*n+c];inv[j*n+c]-=f*inv[i*n+c];}}}
for(let i=0;i<n;i++)for(let j=0;j<n;j++)if(i!==j)B[i*n+j]=-inv[i*n+j]/inv[j*n+j];
}else{
const lambda1=8,lambda2=30;
for(let target=0;target<n;target++){const w=new Float64Array(n);for(let pass=0;pass<8;pass++)for(let j=0;j<n;j++){if(j===target)continue;let rho=G[j*n+target];for(let h=0;h<n;h++)if(h!==j&&h!==target)rho-=G[j*n+h]*w[h];w[j]=Math.max(0,rho-lambda1)/(G[j*n+j]+lambda2);}for(let j=0;j<n;j++)B[j*n+target]=w[j];}
}
return{kind:'linear',top,where,B,n};
}
function topicModel(p){
const dict=new Map(),docs=p.films.map(m=>{const text=m.genres.map(g=>'g:'+g).concat(m.tags.flatMap(t=>t.toLowerCase().split(/[^a-z0-9가-힣]+/).filter(x=>x.length>2).map(x=>'t:'+x))).slice(0,22);return text.map(t=>{if(!dict.has(t))dict.set(t,dict.size);return dict.get(t);});});
const K=8,V=Math.max(1,dict.size),rand=rng(4453),tw=new Int32Array(K*V),tc=new Int32Array(K),dt=new Int32Array(docs.length*K),as=[];
for(let i=0;i<docs.length;i++){const item=[];for(const w of docs[i]){const z=Math.floor(rand()*K);item.push(z);tw[z*V+w]++;tc[z]++;dt[i*K+z]++;}as.push(item);}
for(let epoch=0;epoch<12;epoch++)for(let i=0;i<docs.length;i++)for(let x=0;x<docs[i].length;x++){const w=docs[i][x],old=as[i][x];tw[old*V+w]--;tc[old]--;dt[i*K+old]--;let total=0;const probs=new Float64Array(K);for(let z=0;z<K;z++){total+=probs[z]=(dt[i*K+z]+.2)*(tw[z*V+w]+.08)/(tc[z]+V*.08);}let pick=rand()*total,z=K-1;for(let t=0;t<K;t++){pick-=probs[t];if(pick<=0){z=t;break;}}as[i][x]=z;tw[z*V+w]++;tc[z]++;dt[i*K+z]++;}
const Q=new Float32Array(p.films.length*K);for(let i=0;i<docs.length;i++){let sum=0;for(let d=0;d<K;d++)sum+=dt[i*K+d]+.2;for(let d=0;d<K;d++)Q[i*K+d]=(dt[i*K+d]+.2)/sum;}
return{kind:'contentVec',k:K,Q};
}
function skipgram(p,mode){
const wordMode=mode==='word2vec',dictionary=new Map(),sequences=[];
if(wordMode){for(const m of p.films){const terms=m.genres.map(g=>'g:'+g).concat(m.tags.flatMap(t=>t.toLowerCase().split(/[^a-z0-9가-힣]+/).filter(x=>x.length>2).map(x=>'t:'+x))).slice(0,20);const ids=terms.map(t=>{if(!dictionary.has(t))dictionary.set(t,dictionary.size);return dictionary.get(t);});sequences.push(ids);}}
else{for(const likes of p.pos){const seq=likes.length>100?likes.slice(0,100):likes.slice();if(seq.length>1)sequences.push(seq);}}
const vocab=wordMode?dictionary.size:p.films.length,k=12,rand=rng(wordMode?1111:2222),A=matrix(vocab,k,rand,.12),B=matrix(vocab,k,rand,.12),freq=new Float64Array(vocab),logistic=(x)=>sig(Math.max(-15,Math.min(15,x)));
for(const seq of sequences)for(const w of seq)freq[w]++;
let cumulative=new Float64Array(vocab),total=0;for(let i=0;i<vocab;i++){total+=Math.pow(freq[i]+.01,.75);cumulative[i]=total;}
const sample=()=>{let v=rand()*total,l=0,h=vocab-1;while(l<h){const m=(l+h)>>1;if(cumulative[m]<v)l=m+1;else h=m;}return l;};
function update(a,b,label,rate){let x=dot(A,a,B,b,k),e=(label-logistic(x))*rate;for(let d=0;d<k;d++){const ia=a*k+d,ib=b*k+d,old=A[ia];A[ia]+=e*B[ib];B[ib]+=e*old;}}
for(let epoch=0;epoch<3;epoch++)for(const seq of sequences)for(let t=0;t<seq.length;t++){const i=seq[t];for(let off=-3;off<=3;off++){if(off===0||t+off<0||t+off>=seq.length)continue;update(i,seq[t+off],1,.018);for(let neg=0;neg<2;neg++)update(i,sample(),0,.018);}}
if(!wordMode)return{kind:'contentVec',k,Q:A};
const Q=new Float32Array(p.films.length*k);for(let i=0;i<p.films.length;i++){const m=p.films[i],terms=m.genres.map(g=>'g:'+g).concat(m.tags.flatMap(t=>t.toLowerCase().split(/[^a-z0-9가-힣]+/).filter(x=>x.length>2).map(x=>'t:'+x))).slice(0,20).map(t=>dictionary.get(t)).filter(v=>v!==undefined);for(const t of terms)for(let d=0;d<k;d++)Q[i*k+d]+=A[t*k+d]/Math.max(1,terms.length);}
return{kind:'contentVec',k,Q};
}
function ncf(p){
const rand=rng(707),k=8,h=12,U=p.uids.length,I=p.films.length,P=matrix(U,k,rand,.25),Q=matrix(I,k,rand,.25),W=matrix(h,k*2,rand,.13),b=new Float32Array(h),v=matrix(1,h,rand,.13),rows=p.rows.filter(x=>x[2]>=4);
function forward(user,item){const a=new Float32Array(h),mask=new Uint8Array(h);let out=0;for(let z=0;z<h;z++){let s=b[z];for(let d=0;d<k;d++)s+=W[z*2*k+d]*P[user*k+d]+W[z*2*k+k+d]*Q[item*k+d];a[z]=Math.max(0,s);mask[z]=s>0?1:0;out+=v[z]*a[z];}return{out,a,mask};}
for(let epoch=0;epoch<4;epoch++)for(const [u,i] of rows){let j=Math.floor(rand()*I),tries=0;while(p.rated[u].has(j)&&tries++<10)j=Math.floor(rand()*I);
for(const [item,label] of [[i,1],[j,0]]){const f=forward(u,item),e=label-sig(f.out),gp=new Float32Array(k),gq=new Float32Array(k);for(let z=0;z<h;z++){const gv=e*v[z]*f.mask[z];for(let d=0;d<k;d++){gp[d]+=gv*W[z*2*k+d];gq[d]+=gv*W[z*2*k+k+d];W[z*2*k+d]+=.012*(gv*P[u*k+d]-.001*W[z*2*k+d]);W[z*2*k+k+d]+=.012*(gv*Q[item*k+d]-.001*W[z*2*k+k+d]);}b[z]+=.012*gv;v[z]+=.012*(e*f.a[z]-.001*v[z]);}
for(let d=0;d<k;d++){P[u*k+d]+=.012*(gp[d]-.01*P[u*k+d]);Q[item*k+d]+=.012*(gq[d]-.01*Q[item*k+d]);}}
}
return{kind:'ncf',k,Q,W,b,v,h};
}
function lightGCN(p){
const rand=rng(890),k=8,U=p.uids.length,I=p.films.length,N=U+I,E=matrix(N,k,rand,.25),edges=[];
const degree=new Float32Array(N);
for(let u=0;u<U;u++)for(const i of p.pos[u]){edges.push([u,U+i]);degree[u]++;degree[U+i]++;}
const weighted=edges.map(([a,b])=>[a,b,1/Math.sqrt(Math.max(1,degree[a])*Math.max(1,degree[b]))]);
function propagate(input){const out=new Float32Array(N*k);for(const [a,b,w] of weighted)for(let d=0;d<k;d++){out[a*k+d]+=w*input[b*k+d];out[b*k+d]+=w*input[a*k+d];}return out;}
let mixed=null;
for(let epoch=0;epoch<4;epoch++){const e1=propagate(E),e2=propagate(e1);mixed=new Float32Array(N*k);for(let z=0;z<mixed.length;z++)mixed[z]=(E[z]+e1[z]+e2[z])/3;
const g=new Float32Array(N*k);
for(let u=0;u<U;u++){const likes=p.pos[u];for(let t=0;t<Math.min(60,likes.length);t++){const i=likes[t],a=U+i;let j=Math.floor(rand()*I),tries=0;while(p.rated[u].has(j)&&tries++<12)j=Math.floor(rand()*I);const b=U+j;let s=0;for(let d=0;d<k;d++)s+=mixed[u*k+d]*(mixed[a*k+d]-mixed[b*k+d]);const v=1-sig(s);for(let d=0;d<k;d++){g[u*k+d]+=v*(mixed[a*k+d]-mixed[b*k+d]);g[a*k+d]+=v*mixed[u*k+d];g[b*k+d]-=v*mixed[u*k+d];}}}
const g1=propagate(g),g2=propagate(g1),scale=.06/Math.max(1,edges.length/200);for(let z=0;z<E.length;z++)E[z]+=scale*((g[z]+g1[z]+g2[z])/3-.04*E[z]);}
const e1=propagate(E),e2=propagate(e1),Q=new Float32Array(I*k);for(let i=0;i<I;i++)for(let d=0;d<k;d++)Q[i*k+d]=(E[(U+i)*k+d]+e1[(U+i)*k+d]+e2[(U+i)*k+d])/3;
return{kind:'contentVec',k,Q};
}
function train(mode,model){if(!labels[mode])throw Error('등록되지 않은 고급 알고리즘');const p=prepare(model);let fit;
if(mode==='association')fit=pairwiseCounts(p);
else if(mode==='regression')fit={kind:'regression'};
else if(mode==='svd')fit=truncatedSVD(p);
else if(mode==='ease'||mode==='slim')fit=pairLinear(p,mode);
else if(mode==='lda')fit=topicModel(p);
else if(mode==='word2vec'||mode==='item2vec')fit=skipgram(p,mode);
else if(mode==='ncf')fit=ncf(p);
else if(mode==='lightgcn')fit=lightGCN(p);
else fit=factorModel(p,mode);
return{mode,fit,p};
}
function foldIn(p,fit,profile,rank){
const k=fit.k,Q=fit.Q,A=new Float64Array(k*k),b=new Float64Array(k),count=profile.length;
for(let d=0;d<k;d++)A[d*k+d]=rank?1.8:.6;
for(const [id,r] of profile){const i=p.fi.get(+id);if(i===undefined)continue;const target=rank?(r>=4?1:-.8):(r-3.5);
for(let d=0;d<k;d++){const x=Q[i*k+d];b[d]+=x*target;for(let t=0;t<k;t++)A[d*k+t]+=x*Q[i*k+t];}}
const x=ridgeSolve(A,b,k);if(fit.nonnegative)for(let d=0;d<k;d++)x[d]=Math.max(0,x[d]);if(fit.Y){let count=0;for(const [id] of profile){const j=p.fi.get(+id);if(j===undefined)continue;count++;for(let d=0;d<k;d++)x[d]+=fit.Y[j*k+d]/Math.sqrt(Math.max(1,profile.length));}}
return x;
}
function regScores(p,profile){
const k=p.ng+2,A=new Float64Array(k*k),b=new Float64Array(k),rows=[];
for(const [id,r] of profile){const i=p.fi.get(+id);if(i===undefined)continue;const f=new Float64Array(k);f[0]=1;for(const g of p.genres[i])f[2+g]=1/Math.sqrt(Math.max(1,p.genres[i].length));f[1]=(p.films[i].year||2000-2000)/130;rows.push([f,r-3.5]);}
for(let a=0;a<k;a++)A[a*k+a]=a===0?2:6;
for(const [x,y] of rows)for(let d=0;d<k;d++){b[d]+=x[d]*y;for(let j=0;j<k;j++)A[d*k+j]+=x[d]*x[j];}
const w=ridgeSolve(A,b,k);
return i=>{let z=w[0]+w[1]*((p.films[i].year||2000)-2000)/130;for(const g of p.genres[i])z+=w[2+g]/Math.sqrt(Math.max(1,p.genres[i].length));return z;};
}
function score(trained,model,profileEntries,limit=10){
const {fit,p,mode}=trained,profile=[...profileEntries].filter(([id,r])=>p.fi.has(+id)&&Number.isFinite(+r)),seen=new Set(profile.map(([id])=>+id));
if(!profile.length)return root.MovieRecEngine.recommend(model,profileEntries,'popular',limit);
let fn;
if(fit.kind==='regression')fn=regScores(p,profile);
else if(fit.kind==='association'){const I=p.films.length;fn=i=>{let s=0,n=0;for(const [id,r] of profile){if(r<3.5)continue;const j=p.fi.get(+id),key=i<j?i*I+j:j*I+i,co=fit.pair.get(key)||0;if(co<2)continue;const confidence=co/Math.max(1,fit.counts[j]),lift=confidence/(fit.counts[i]/fit.n+1e-8);s+=Math.log1p(co)*Math.log1p(lift)*confidence;n++;}return n?s/Math.sqrt(n):0;};}
else if(fit.kind==='linear'){fn=i=>{const j=fit.where.get(i);if(j===undefined)return -1;let s=0;for(const [id,r] of profile){const a=fit.where.get(p.fi.get(+id));if(a!==undefined)s+=fit.B[a*fit.n+j]*(r>=4?1:(r-3)/2);}return s;};}
else if(fit.kind==='ncf'){const h=fit.h,k=fit.k,x=foldIn(p,fit,profile,true);fn=i=>{let z=0;for(let t=0;t<h;t++){let a=fit.b[t];for(let d=0;d<k;d++)a+=fit.W[t*2*k+d]*x[d]+fit.W[t*2*k+k+d]*fit.Q[i*k+d];z+=fit.v[t]*Math.max(0,a);}return z;};}
else if(fit.kind==='contentVec'){const k=fit.k,Q=fit.Q,x=new Float64Array(k);let total=0;for(const [id,r] of profile){const i=p.fi.get(+id),w=(r-3)/2;total+=Math.abs(w);for(let d=0;d<k;d++)x[d]+=w*Q[i*k+d];}let nx=Math.hypot(...x);fn=i=>{let z=0,n=0;for(let d=0;d<k;d++){z+=x[d]*Q[i*k+d];n+=Q[i*k+d]*Q[i*k+d];}return z/(Math.max(1e-9,nx*Math.sqrt(n)));};}
else{const k=fit.k,Q=fit.Q,x=foldIn(p,fit,profile,fit.rank),bias=fit.bias;fn=i=>{let s=bias?bias[i]*.2:0;for(let d=0;d<k;d++)s+=x[d]*Q[i*k+d];return s;};}
const ranked=[];for(let i=0;i<p.films.length;i++){const film=p.films[i];if(seen.has(film.id))continue;const v=fn(i);if(!Number.isFinite(v))continue;const adjusted=v+(fit.kind==='linear'?0:.025*(film.pop-model.mean));ranked.push([i,adjusted,v]);}
ranked.sort((a,b)=>b[1]-a[1]||p.films[b[0]].n-p.films[a[0]].n);
const output=ranked.slice(0,limit).map(([i,s,v])=>({movie:model.movieById.get(p.films[i].id),score:s,why:labels[mode]+' · 관측 평점에서 학습한 추천 신호',factors:[['모델 상대 점수',sig(v)]],method:mode}));
if(output.length<limit){const ids=new Set(output.map(x=>x.movie.id));for(const x of root.MovieRecEngine.recommend(model,profileEntries,'popular',limit)){if(output.length>=limit)break;if(!ids.has(x.movie.id)){output.push({...x,why:'고급 모델의 후보 부족 · 인기 기반 보완'});ids.add(x.movie.id);}}}
return output;
}
root.MovieRecAdvanced={labels,descriptions,modes,train,score};
})(typeof self!=='undefined'?self:globalThis);
