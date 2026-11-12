'use strict';
(function(root){
  function mount(container,Art,onMovie){
    let generation=0,observer=null;
    const cleanup=()=>{observer?.disconnect();observer=null;};
    function buildFilm(doc,rec,row,rank,token){
      const m=rec.movie,button=doc.createElement('button'),art=doc.createElement('span'),img=doc.createElement('img'),fallback=doc.createElement('span'),caption=doc.createElement('span');
      button.type='button';button.className='recommend-card';button.dataset.movieId=String(m.id);button.dataset.rank=String(rank+1);button.setAttribute('aria-label',(rank+1)+'위 '+m.title+' 상세정보 보기');button.title=m.title;
      art.className='recommend-card-art';img.alt='';img.loading=rank<6?'eager':'lazy';img.decoding='async';img.hidden=true;fallback.className='recommend-card-fallback';fallback.textContent=m.title;caption.className='recommend-card-title';caption.textContent=m.title;art.append(img,fallback);button.append(art,caption);
      button.addEventListener('click',()=>{if(token===generation)onMovie(rec,row);});
      const use=url=>{if(!url||token!==generation||!button.isConnected||img.src===url)return;img.onerror=()=>{img.hidden=true;fallback.hidden=false;};img.onload=()=>{img.hidden=false;fallback.hidden=true;};img.src=url;};
      function load(){const immediate=Art.preview(m);if(immediate.poster)use(immediate.poster);Art.get(m).then(a=>use(a?.poster)).catch(()=>{});}
      button._loadArtwork=load;
      return button;
    }
    function render(rows){
      if(!Array.isArray(rows))return;const token=++generation,doc=container.ownerDocument;
      const previous=new Map([...container.querySelectorAll('.recommend-row')].map(row=>[row.dataset.kind,row.querySelector('.recommend-track')?.scrollLeft||0]));
      cleanup();container.replaceChildren();
      const items=[];
      for(const row of rows){
        const section=doc.createElement('section'),head=doc.createElement('div'),title=doc.createElement('h2'),tag=doc.createElement('span'),actions=doc.createElement('div'),prev=doc.createElement('button'),next=doc.createElement('button'),track=doc.createElement('div');
        section.className='recommend-row';section.dataset.kind=row.key;head.className='recommend-row-head';title.textContent=row.label;tag.className='recommend-row-sub';tag.textContent=row.modeLabel||'';actions.className='recommend-arrows';prev.type='button';prev.textContent='‹';prev.setAttribute('aria-label',row.label+' 이전 포스터');next.type='button';next.textContent='›';next.setAttribute('aria-label',row.label+' 다음 포스터');actions.append(prev,next);head.append(title,tag,actions);
        track.className='recommend-track';track.setAttribute('aria-label',row.label+' 추천 영화 목록');track.setAttribute('role','list');track.tabIndex=0;
        prev.addEventListener('click',()=>track.scrollBy({left:-Math.max(320,track.clientWidth*.74),behavior:'smooth'}));next.addEventListener('click',()=>track.scrollBy({left:Math.max(320,track.clientWidth*.74),behavior:'smooth'}));
        const list=Array.isArray(row.recs)?row.recs:[];
        if(!list.length){const empty=doc.createElement('div');empty.className='recommend-empty';empty.textContent=row.pending?'추천 결과를 계산하고 있어요':row.key==='user'?'유사 사용자 추천 정보가 부족해요':'추천할 영화가 없어요';section.append(head,empty);}else{list.forEach((rec,i)=>{const card=buildFilm(doc,rec,row,i,token);track.append(card);items.push(card);});section.append(head,track);}
        if(row.limited){const info=doc.createElement('span');info.className='recommend-row-note';info.textContent='평가가 적으면 유사 사용자 추천의 정확도가 낮을 수 있어요';section.append(info);}
        container.append(section);
        if(previous.has(row.key)&&list.length)track.scrollLeft=previous.get(row.key);
      }
      if('IntersectionObserver' in root){observer=new root.IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting)continue;entry.target._loadArtwork?.();observer.unobserve(entry.target);}},{rootMargin:'150px 400px'});items.forEach(button=>observer.observe(button));}else items.forEach(card=>card._loadArtwork?.());
    }
    return {render,destroy(){generation++;cleanup();container.replaceChildren();}};
  }
  root.MovieRecRails={mount};
})(window);
