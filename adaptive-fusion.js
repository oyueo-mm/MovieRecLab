/* Shared inference primitive: weighted reciprocal rank fusion, no model training. */
(function(root){
  'use strict';
  function fuse(lists,weights,limit=10,k=20,seen=new Set()){
    if(lists.length!==weights.length||!lists.length||weights.some(w=>!Number.isFinite(w)||w<0)||weights.every(w=>w===0))throw Error('Invalid fusion weights');
    const all=new Map();
    lists.forEach((list,i)=>{
      if(!weights[i])return;
      const unique=new Set();
      list.forEach((r,j)=>{
        const id=typeof r==='number'?r:r.movie.id;
        if(seen.has(id)||unique.has(id))return;
        unique.add(id);
        const v=weights[i]/(k+j+1),cur=all.get(id)||{id,score:0};
        cur.score+=v;all.set(id,cur);
      });
    });
    return [...all.values()].sort((a,b)=>b.score-a.score||a.id-b.id).slice(0,limit).map(x=>x.id);
  }
  const api={fuse};root.MovieRecAdaptiveFusion=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof self!=='undefined'?self:globalThis);
