'use strict';
/* Reuse the existing browser-ready, validation-gated V11 schedule.
 * V10 for rejected bins, and the original Small adaptive recommendation for
 * profiles without enough usable 25M anchors. No new raw data or training. */
(function(root){
  let memoKey=null,memo=null;
  function ready(){return root.MovieRecV11?.ready?.()===true&&root.MovieRecV10?.ready?.()===true;}
  function recommend(rated,catalog,limit=10){
    if(!ready()||!Array.isArray(rated)||rated.length<3||!catalog?.length)return null;
    const key=JSON.stringify([rated,limit,catalog.length]);
    if(key===memoKey)return memo;
    let result=null;
    try{
      const accepted=root.MovieRecV11.recommend('similarity',rated,catalog,limit,{experimental:false});
      const raw=accepted||root.MovieRecV10.recommend('similarity',rated,catalog,limit,{experimental:true});
      if(Array.isArray(raw)&&raw.length>=Math.min(limit,6)){
        const seen=new Set(rated.map(x=>Number(x[0]))),valid=new Set(catalog.map(x=>Number(x.id))),recs=[];
        for(const r of raw){const id=Number(r?.movie?.id);if(!valid.has(id)||seen.has(id))continue;seen.add(id);recs.push({...r,rank:recs.length+1});if(recs.length===limit)break;}
        if(recs.length>=Math.min(limit,6))result={recs,source:accepted?'V11':'V10'};
      }
    }catch(e){console.warn('V11 기본 추천 폴백',e);}
    memoKey=key;memo=result;return result;
  }
  function reset(){memoKey=null;memo=null;}
  root.MovieRecV11Primary={ready,recommend,reset};
})(window);
