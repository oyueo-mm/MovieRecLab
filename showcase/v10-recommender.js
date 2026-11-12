'use strict';
/* V10 visitor inference from derived 25M model coefficients. No raw ratings, user IDs or network calls. */
(function(root){
  const pack=root.MovieRecV10Data,old=root.MovieRec25MData,valid=pack?.version==='v10-2026'&&pack?.model?.rows?.length>=8000;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  let representation=null,baseline=null;
  function norm(arr){const x=arr.map(Number),n=Math.sqrt(x.reduce((s,a)=>s+a*a,0));return n>1e-8?x.map(v=>v/n):x.map(()=>0);}
  function dot(a,b){let n=0;for(let i=0;i<a.length;i++)n+=a[i]*b[i];return n;}
  function load(){if(!valid)return false;if(representation)return true;representation=new Map(pack.model.rows.map(([id,v])=>[id,pack.model.type==='itemknn'?v:norm(v)]));if(old?.films){baseline=new Map(old.films.map(([id,cf,tag,pop])=>[id,{cf:norm(cf),tag:norm(tag),pop:clamp(pop/1000,0,1)}]));}return representation.size>=8000;}
  function score(anchors,weights,features){
    const first=features.get(anchors[0]);
    if(!first)return null;
    const profile=Array.from({length:first.length},()=>0);
    anchors.forEach((id,j)=>{const vector=features.get(id);if(!vector)return;for(let k=0;k<profile.length;k++)profile[k]+=weights[j]*vector[k];});
    const vec=norm(profile);if(!vec.some(v=>v))return null;
    return id=>{const item=features.get(id);return item?dot(vec,item):-1e8;};
  }
  function baselineScores(anchors,weights){
    if(!baseline)return null;
    const cf=score(anchors,weights,new Map([...baseline].map(([id,x])=>[id,x.cf])));
    const sem=score(anchors,weights,new Map([...baseline].map(([id,x])=>[id,x.tag])));
    if(!cf||!sem)return null;
    return id=>{const movie=baseline.get(id);return movie?.pop===undefined?-1e8:.2*cf(id)+.2*sem(id)+.6*movie.pop;};
  }
  function recommend(mode,rated,catalog,limit=12,options={}){
    if(mode!=='similarity'||!load()||(!pack.quality?.similarity&&!options.experimental))return null;
    if(!Array.isArray(rated)||!Array.isArray(catalog))return null;
    const usable=rated.map(([id,r])=>[Number(id),Number(r)]).filter(([id,r])=>Number.isFinite(id)&&Number.isFinite(r)&&r!==3&&representation.has(id));
    if(usable.length<3)return null;
    const anchors=usable.map(x=>x[0]),weights=usable.map(x=>clamp((x[1]-3)/2,-1,1)),ratedIds=new Set(rated.map(x=>Number(x[0])));
    let learned=null;
    if(pack.model.type==='itemknn'){
      const total=Math.max(1e-8,weights.reduce((a,b)=>a+Math.abs(b),0)),map=new Map();
      anchors.forEach((id,i)=>{for(const [other,value] of representation.get(id)||[])map.set(other,(map.get(other)||0)+(weights[i]*value/10000)/total);});
      learned=id=>map.get(id)||0;
    }else learned=score(anchors,weights,representation);
    if(!learned)return null;
    const oldBlend=pack.champion?.startsWith('tag+'),tag=oldBlend?baselineScores(anchors,weights):null;
    if(oldBlend&&!tag)return null;
    const items=[];
    for(const movie of catalog){
      const id=Number(movie.id);
      if(ratedIds.has(id)||!representation.has(id))continue;
      const raw=learned(id);
      const value=oldBlend?pack.blend[0]*tag(id)+pack.blend[1]*raw:raw;
      if(!Number.isFinite(value))continue;
      items.push({movie,score:value,method:'similarity',source:'MovieLens 25M V10',why:oldBlend?'25M 영화 관계와 Tag Genome 특성을 함께 반영한 추천':'MovieLens 25M에서 학습한 영화 간 유사도로 추천'});
    }
    items.sort((a,b)=>b.score-a.score||Number(b.movie.n||0)-Number(a.movie.n||0));
    const result=items.slice(0,limit);
    return result.length>=Math.min(limit,6)?result:null;
  }
  root.MovieRecV10={ready:()=>load(),recommend,info:()=>({ready:valid,champion:pack?.champion||null,quality:pack?.quality||{},filmCount:pack?.model?.rows?.length||0})};
})(window);
