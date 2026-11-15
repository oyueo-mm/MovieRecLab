'use strict';
/* Explicit host configuration only. No user ratings transmitted until consent. */
(function(root){
  const cfg=root.MovieRecV14Config;
  let endpoint=null;
  try{const u=new URL(cfg?.endpoint||'');if(cfg?.enabled===true&&u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash)endpoint=u.href.replace(/\/$/,'');}catch(_){}
  let agreed=false,declined=false,key='',answer=null,pending=null,generation=0;
  const KEYS=['primary','user','content','hidden','discovery','genre'];
  function enabled(){return !!endpoint}
  function reset(){generation++;key='';answer=null;pending?.abort();pending=null;}
  function consent(){
    if(agreed)return true;
    if(declined)return false;
    agreed=root.confirm('V14 추천을 사용하려면 선택한 영화 ID와 평점을 추천 서버로 전송해야 합니다. 서버는 추천 계산에만 사용하며 이 기능을 취소하면 기존 추천을 유지합니다. 사용하시겠습니까?');
    declined=!agreed;return agreed;
  }
  function get(rated,catalog,onReady){
    if(!enabled()||!Array.isArray(rated)||rated.length<3||rated.length>300||!agreed)return null;
    const signature=JSON.stringify(rated);
    if(signature===key)return answer;
    reset();key=signature;
    const seq=generation,ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),15000);pending=ctrl;
    fetch(endpoint+'/recommend',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({ratings:rated.map(([id,v])=>[Number(id),Number(v)])}),signal:ctrl.signal,cache:'no-store'}).then(r=>{if(!r.ok)throw Error(String(r.status));return r.json()}).then(data=>{
      if(generation!==seq)return;
      if(data.version!=='v14'||!Number.isInteger(data.bucket)||!KEYS.every(k=>Array.isArray(data.rows?.[k])))throw Error('invalid V14 response');
      const lookup=new Map(catalog.map(m=>[Number(m.id),m])),seen=new Set(rated.map(x=>Number(x[0]))),rows={};
      for(const k of KEYS){
        rows[k]=data.rows[k].map(id=>{
          if(!Number.isInteger(id)||seen.has(id)||!lookup.has(id))throw Error('invalid recommendation id');
          seen.add(id);return {movie:lookup.get(id),rank:0,why:'V14 검증된 추천 조합 · '+data.method.toUpperCase()};
        }).map((r,i)=>({...r,rank:i+1}));
      }
      if(rows.primary.length<10)throw Error('insufficient recommendations');
      answer={...data,rows};onReady?.();
    }).catch(()=>{if(generation===seq){answer=null;onReady?.();}}).finally(()=>{clearTimeout(timer);if(generation===seq)pending=null});
    return null;
  }
  root.MovieRecV14API={enabled,consent,get,reset};
})(window);
