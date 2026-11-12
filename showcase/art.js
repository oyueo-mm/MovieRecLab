'use strict';
(function(root){
  const TMDB='https://image.tmdb.org/t/p/';
  const known={
    157336:['/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg','/pbrkL804c8yAv3zBZR4QPEafpAR.jpg'],
    27205:['/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg','/8ZTVqvKDQ8emSGUEMjsS4yHAwrp.jpg'],
    862:['/rhIRbceoE9lR4veEXuwCC2wARtG.jpg',null],
    603:['/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg',null],
    278:['/9cqNxx0GxF0bflZmeSMuL5tnGzr.jpg','/kXfqcdQKsToO0OUXHcrrNCHDBzO.jpg'],
    597:['/9xjZS2rlVxm8SFx8kPC3aIGCOYQ.jpg',null],
    155:['/qJ2tW6WMUDux911r6m7haRef0WH.jpg',null],
    680:['/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg',null],
    19995:['/kyeqWdyUXW608qlYkRqosgbbJyK.jpg',null]
  };
  const cache=new Map(),queue=[];let active=0;
  const safe=url=>{if(typeof url!=='string')return null;try{const x=new URL(url);return x.protocol==='https:'&&['image.tmdb.org','images.metahub.space','static.metahub.space','images.strem.io','img.strem.io','m.media-amazon.com','images-na.ssl-images-amazon.com','static-cdn.jtvnw.net'].includes(x.hostname)?x.href:null;}catch(e){return null;}};
  const src=(path,size)=>path?TMDB+size+path:null;
  const imdbOf=m=>m?.imdb&&/^\d{4,12}$/.test(String(m.imdb))?'tt'+String(m.imdb).padStart(7,'0'):null;
  function runQueue(){while(active<4&&queue.length){const task=queue.shift();active++;task().finally(()=>{active--;runQueue();});}}
  function request(m){return new Promise(resolve=>{queue.push(async()=>{const imdb=imdbOf(m),staticArt=known[Number(m.tmdb)],seed={poster:staticArt?src(staticArt[0],'w500'):null,backdrop:staticArt?src(staticArt[1],'w1280'):null,provider:staticArt?'TMDb':'',imdb};if(!imdb){resolve(seed);return;}const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6500);try{const response=await fetch('https://v3-cinemeta.strem.io/meta/movie/'+imdb+'.json',{signal:controller.signal,mode:'cors',credentials:'omit'});if(!response.ok)throw Error('Metadata HTTP '+response.status);const data=await response.json(),meta=data?.meta||{};const art={poster:seed.poster||safe(meta.poster),backdrop:seed.backdrop||safe(meta.background),provider:seed.provider||'Cinemeta',imdb};resolve(art);}catch(e){resolve(seed);}finally{clearTimeout(timer);}});runQueue();});}
  function get(movie){if(!movie)return Promise.resolve({poster:null,backdrop:null,provider:'',imdb:null});const key=Number(movie.id);if(!cache.has(key))cache.set(key,request(movie));return cache.get(key);}
  function preview(movie){if(!movie)return{poster:null,backdrop:null,imdb:null};const staticArt=known[Number(movie.tmdb)];return {poster:staticArt?src(staticArt[0],'w500'):null,backdrop:staticArt?src(staticArt[1],'w1280'):null,imdb:imdbOf(movie)};}
  root.MovieShowcaseArt={get,preview,imdbOf,known};
})(window);