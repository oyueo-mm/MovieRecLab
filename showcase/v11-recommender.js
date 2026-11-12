'use strict';
/* V11: independent-validation-selected cold-start schedule; no raw user factors or network calls. */
(function(root){
  const cfg=root.MovieRecV11Config,expected=[3,5,10,20,50,100],valid=cfg&&cfg.version==='v11-2026'&&expected.every(n=>cfg.bins?.[n]&&Number.isFinite(cfg.bins[n].gamma)&&Number.isFinite(cfg.bins[n].negativeScale));
  const byId=new Map((root.MovieRec25MData?.films||[]).map(row=>[Number(row[0]),Math.max(0,Math.min(1,Number(row[3])/1000))]));
  const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
  function bucket(count){const n=Math.max(3,Number(count)||0);let chosen=expected[0];for(const p of expected)if(n>=p)chosen=p;return chosen;}
  function recommend(mode,rated,catalog,limit=12,options={}){
    if(!valid||mode!=='similarity'||!Array.isArray(rated)||!Array.isArray(catalog)||!root.MovieRecV10?.ready?.())return null;
    if(rated.length<3)return null;
    const level=bucket(rated.length),setting=cfg.bins[level];
    if(!setting?.accepted&&!options.experimental)return null;
    const gamma=clamp(setting.gamma,0,1),negativeScale=clamp(setting.negativeScale,0,1);
    const adjusted=rated.map(([id,r])=>[id,Number(r)<3?3+(Number(r)-3)*negativeScale:Number(r)]);
    const ranked=root.MovieRecV10.recommend('similarity',adjusted,catalog,catalog.length,{experimental:true});
    if(!ranked||ranked.length<Math.min(6,limit))return null;
    const originalRated=new Set(rated.map(row=>Number(row[0])));
    const scored=[];
    for(const result of ranked){
      const id=Number(result.movie.id);
      if(originalRated.has(id))continue;
      const popularity=byId.get(id)??0;
      const value=gamma*result.score+(1-gamma)*popularity;
      if(!Number.isFinite(value))continue;
      scored.push({...result,score:value,source:'MovieLens 25M V11',why:'평가 영화 수에 맞춰 인기도와 Tag Genome·Item KNN 유사도의 비율을 조정한 추천'});
    }
    scored.sort((a,b)=>b.score-a.score||Number(b.movie.n||0)-Number(a.movie.n||0));
    return scored.length>=Math.min(6,limit)?scored.slice(0,limit):null;
  }
  root.MovieRecV11={ready:()=>Boolean(valid&&root.MovieRecV10?.ready?.()),recommend,info:()=>({version:cfg?.version||null,buckets:cfg?.bins||{},profiles:cfg?.profiles||[]}),bucket};
})(window);
