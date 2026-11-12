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
  const allowed=new Set(['image.tmdb.org','images.metahub.space','static.metahub.space','images.strem.io','img.strem.io','m.media-amazon.com','images-na.ssl-images-amazon.com']);
  const cache=new Map(),queue=[],successfulPosters=new Map(),failedUrls=new Set(),posterListeners=new Map();let active=0;
  const safe=url=>{if(typeof url!=='string')return null;try{const x=new URL(url);return x.protocol==='https:'&&allowed.has(x.hostname)?x.href:null;}catch{return null;}};
  const unique=urls=>[...new Set(urls.map(safe).filter(Boolean))];
  const src=(path,size)=>path?TMDB+size+path:null;
  const imdbOf=m=>m?.imdb&&/^\d{4,12}$/.test(String(m.imdb))?'tt'+String(m.imdb).padStart(7,'0'):null;
  const metahub=(type,size,imdb)=>imdb?'https://images.metahub.space/'+type+'/'+size+'/'+imdb+'/img':null;
  function preview(m){if(!m)return{poster:null,backdrop:null,posterCandidates:[],backdropCandidates:[],imdb:null};const art=known[Number(m.tmdb)],imdb=imdbOf(m),mapped=root.MovieRecPosterPaths?.[String(m.id)],verified=typeof mapped==='string'&&/^\/[A-Za-z0-9_-]{15,100}\.(?:jpg|jpeg|png|webp)$/i.test(mapped)?mapped:null,posterCandidates=unique([successfulPosters.get(Number(m.id)),art&&src(art[0],'w500'),metahub('poster','medium',imdb),verified&&src(verified,'w342'),metahub('poster','small',imdb)]).filter(url=>!failedUrls.has(url)),backdropCandidates=unique([art&&src(art[1],'w1280'),metahub('background','medium',imdb)]);return{poster:posterCandidates[0]||null,backdrop:backdropCandidates[0]||null,posterCandidates,backdropCandidates,imdb};}
  function runQueue(){while(active<4&&queue.length){const job=queue.shift();active++;Promise.resolve().then(job).finally(()=>{active--;runQueue();});}}
  async function metadata(imdb){if(!imdb)return null;for(const host of ['v3-cinemeta.strem.io','cinemeta-live.strem.io']){const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),5200);try{const response=await fetch('https://'+host+'/meta/movie/'+imdb+'.json',{signal:controller.signal,mode:'cors',credentials:'omit'});if(!response.ok)throw Error('metadata '+response.status);const payload=await response.json(),m=payload?.meta;if(m&&typeof m==='object')return m;}catch(error){/* Continue to the independent metadata endpoint. */}finally{clearTimeout(timeout);}}return null;}
  function request(movie){return new Promise(resolve=>{queue.push(async()=>{const p=preview(movie),meta=await metadata(p.imdb),fromMeta=unique([meta?.poster,meta?.posterUrl]),fromBackdrop=unique([meta?.background,meta?.backgroundUrl]);const posterCandidates=unique([successfulPosters.get(Number(movie.id)),p.posterCandidates[0],...fromMeta,...p.posterCandidates.slice(1)]),backdropCandidates=unique([...fromBackdrop,...p.backdropCandidates]);resolve({poster:posterCandidates[0]||null,backdrop:backdropCandidates[0]||null,posterCandidates,backdropCandidates,provider:meta?'Cinemeta / TMDb':'Metahub / TMDb',imdb:p.imdb});});runQueue();});}
  function get(movie){if(!movie)return Promise.resolve({poster:null,backdrop:null,posterCandidates:[],backdropCandidates:[],imdb:null});const id=Number(movie.id),existing=cache.get(id);if(existing&&existing.until>Date.now())return existing.promise;const promise=request(movie);cache.set(id,{promise,until:Date.now()+180000});promise.then(result=>{if(result.posterCandidates.length||result.backdropCandidates.length)cache.set(id,{promise,until:Date.now()+3600000});});return promise;}
  function bindPoster(img,movie,fallback){
    if(!img||!movie)return()=>{};
    const id=Number(movie.id);let cancelled=false,urls=preview(movie).posterCandidates.slice(),index=0,visited=new Set(),metadataReceived=false;
    let listeners=posterListeners.get(id);if(!listeners){listeners=new Set();posterListeners.set(id,listeners);}
    const setPoster=url=>{if(cancelled||!url||img.src===url)return;const accepted=safe(url);if(!accepted||failedUrls.has(accepted))return;visited.add(accepted);img.classList.add('poster-pending');img.hidden=false;img.src=accepted;};
    const announce=url=>{successfulPosters.set(id,url);const subscribers=posterListeners.get(id);if(subscribers)for(const notify of subscribers)notify(url);};
    const hear=url=>{if(!cancelled&&url&&img.src!==url)setPoster(url);};
    listeners.add(hear);
    img.hidden=false;img.classList.add('poster-pending');
    const next=()=>{if(cancelled)return;const winner=successfulPosters.get(id);if(winner&&!visited.has(winner)&&!failedUrls.has(winner)){setPoster(winner);return;}while(index<urls.length){const url=urls[index++];if(visited.has(url)||failedUrls.has(url))continue;setPoster(url);return;}if(!metadataReceived){metadataReceived=true;get(movie).then(a=>{if(cancelled)return;urls=unique([...urls,...a.posterCandidates]);next();}).catch(()=>{});}};
    img.onload=()=>{if(cancelled)return;img.hidden=false;img.classList.remove('poster-pending');if(fallback)fallback.hidden=true;const winner=img.currentSrc||img.src;failedUrls.delete(winner);announce(winner);};
    img.onerror=()=>{if(cancelled)return;if(img.src)failedUrls.add(img.src);img.hidden=false;img.classList.add('poster-pending');if(fallback)fallback.hidden=false;next();};
    next();
    return()=>{cancelled=true;img.onload=null;img.onerror=null;const group=posterListeners.get(id);group?.delete(hear);if(group?.size===0)posterListeners.delete(id);};
  }
  root.MovieShowcaseArt={get,preview,imdbOf,known,bindPoster,safe,posterStatus:()=>({successful:successfulPosters.size,failedSources:failedUrls.size,subscribedFilms:posterListeners.size})};
})(window);