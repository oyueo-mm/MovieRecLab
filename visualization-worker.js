'use strict';
importScripts('./engine.js','./advanced.js','./visualization-engine.js');
const E=self.MovieRecEngine,A=self.MovieRecAdvanced,V=self.MovieRecVisualEngine;
let model=null,cache=new Map();
self.onmessage=function(ev){const m=ev.data||{};try{if(m.type==='init'){model=E.createModel(m.movies,m.ratings);cache.clear();self.postMessage({type:'ready'});return;}if(m.type!=='render')return;if(!model)throw Error('MovieLens 데이터가 아직 준비되지 않았습니다.');const mode=m.view==='network'?'association':'item2vec';let trained=cache.get(mode);if(!trained){self.postMessage({type:'training',requestId:m.requestId,view:m.view});trained=A.train(mode,model);cache.set(mode,trained);}const result=m.view==='network'?V.graph(trained,m.profile,m.recs):V.map(trained,m.profile,m.recs);self.postMessage({type:'result',requestId:m.requestId,view:m.view,data:result});}catch(e){self.postMessage({type:'error',requestId:m.requestId,message:String(e&&e.message||e)});}};
