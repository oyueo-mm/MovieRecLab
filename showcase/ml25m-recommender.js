'use strict';
/* MovieRecLab 25M V9: browser-only inference from aggregated offline model coefficients.
   No original MovieLens-25M ratings, IDs of training users, or raw Tag Genome rows. */
(function(root){
  const source=root.MovieRec25MData;
  const good=source&&source.version==='25m-2026-v9'&&Array.isArray(source.films)&&source.films.length>=3000;
  let movieById=null,center=null,cohorts=null;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function norm(a){let length=0;for(const x of a)length+=x*x;length=Math.sqrt(length);return length>1e-12?a.map(x=>x/length):a.map(()=>0);}
  function dot(a,b){let n=0;for(let i=0;i<a.length;i++)n+=a[i]*b[i];return n;}
  function init(){
    if(!good)return false;
    if(movieById)return true;
    movieById=new Map();
    for(const item of source.films){
      if(!Array.isArray(item)||item.length<4||!Number.isSafeInteger(item[0]))continue;
      movieById.set(item[0],{id:item[0],collab:norm(item[1]),semantic:norm(item[2]),popular:item[3]});
    }
    center=source.centers.map(x=>norm(x));
    cohorts=source.cohorts||[];
    return movieById.size>=3000&&center.length>=10;
  }
  function recommend(mode,profile,catalog,limit=12){
    if(!init()||!['user','similarity'].includes(mode)||source.quality?.[mode]===false||!Array.isArray(profile)||!Array.isArray(catalog))return null;
    const original=new Map(catalog.map(m=>[Number(m.id),m]));
    const rated=new Set(profile.map(x=>Number(x[0])));
    const matched=profile.map(([id,r])=>({item:movieById.get(Number(id)),r:Number(r)})).filter(x=>x.item&&Number.isFinite(x.r));
    if(matched.length<3)return null;
    const dims=source.dims||24,collab=new Array(dims).fill(0),semantic=new Array(dims).fill(0);
    let tagAnchors=0;
    for(const {item,r} of matched){
      const weight=clamp((r-3)/2,-1,1);
      for(let i=0;i<dims;i++){collab[i]+=weight*(item.collab[i]||0);semantic[i]+=weight*(item.semantic[i]||0);}
      if(item.semantic.some(v=>v))tagAnchors++;
    }
    const cf=norm(collab),sg=norm(semantic);
    const noTag=tagAnchors<1;
    if(!cf.some(Boolean)||mode==='similarity'&&noTag)return null;
    const cohortAffinity=new Map();
    if(mode==='user'){
      const nearest=center.map((value,index)=>({index,score:dot(cf,value)})).sort((a,b)=>b.score-a.score).slice(0,5);
      let z=0;
      for(const g of nearest){
        const weight=Math.pow(Math.max(0,g.score),3);
        if(weight<1e-6)continue;
        z+=weight;
        const group=cohorts[g.index]||[];
        group.forEach(([id,rel],rank)=>{
          const mid=Number(id);
          if(!original.has(mid)||rated.has(mid))return;
          cohortAffinity.set(mid,(cohortAffinity.get(mid)||0)+weight*Number(rel)/10000/(1+.025*rank));
        });
      }
      if(z>1e-9){
        let max=0;
        for(const [id,v] of cohortAffinity){const normalized=v/z;cohortAffinity.set(id,normalized);max=Math.max(max,normalized);}
        if(max>0)for(const [id,v] of cohortAffinity)cohortAffinity.set(id,v/max);
      }
    }
    const scored=[];
    for(const movie of catalog){
      const id=Number(movie.id),entry=movieById.get(id);
      if(!entry||rated.has(id)||movie.n<2)continue;
      const collaborative=dot(entry.collab,cf),tag=noTag?0:dot(entry.semantic,sg);
      const popularity=clamp(Number(entry.popular)/1000,0,1);
      const bonus=cohortAffinity.get(id)||0;
      const u=source.weights?.user||[.50,.50,.03],t=source.weights?.similarity||[.57,.43,.065];const value=mode==='user'?u[0]*collaborative+u[1]*bonus+u[2]*popularity:(noTag?t[1]*collaborative:t[0]*tag+t[1]*collaborative)+t[2]*popularity;
      if(!Number.isFinite(value))continue;
      scored.push({movie,score:value,why:mode==='user'?'MovieLens 25M에서 학습한 유사 취향 사용자 그룹이 선호한 영화':'Tag Genome 영화 특성과 MovieLens 25M 공동 평가 패턴이 비슷한 영화',method:mode,source:'MovieLens 25M + Tag Genome'});
    }
    scored.sort((a,b)=>b.score-a.score||b.movie.n-a.movie.n);
    const top=scored.slice(0,limit);
    return top.length>=Math.min(6,limit)?top:null;
  }
  root.MovieRec25M={ready:()=>Boolean(init()),recommend,info:()=>good?{version:source.version,films:source.films.length,test:source.evaluation,counts:{ratings:source.ratingsTrained}}:null};
})(window);
