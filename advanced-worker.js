'use strict';
importScripts('./engine.js','./advanced.js');
const E=self.MovieRecEngine,A=self.MovieRecAdvanced;
let model=null,cache=new Map();
self.onmessage=function(event){
const msg=event.data||{};
try{
if(msg.type==='init'){model=E.createModel(msg.movies,msg.ratings);cache.clear();self.postMessage({type:'ready'});return;}
if(msg.type!=='recommend')return;
if(!model)throw Error('평점 데이터를 먼저 불러와야 합니다.');
if(!A.labels[msg.mode])throw Error('알 수 없는 고급 모델: '+msg.mode);
let fit=cache.get(msg.mode);
if(!fit){self.postMessage({type:'training',id:msg.id,mode:msg.mode});fit=A.train(msg.mode,model);cache.set(msg.mode,fit);}
const recs=A.score(fit,model,msg.profile,msg.limit||10);
self.postMessage({type:'result',id:msg.id,recs});
}catch(e){self.postMessage({type:'error',id:msg.id,message:String(e&&e.message||e)});}
};