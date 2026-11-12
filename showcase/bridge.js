'use strict';
(function(){
  /* Loaded as a regular classic script inside the SAME-ORIGIN original MovieRecLab iframe.
     Global lexical bindings below come from its existing app.js; none are modified or exported globally by the original site. */
  const $=id=>document.getElementById(id);
  const getMovie=m=>({id:m.id,title:window.MovieRecI18N.displayTitle(m,state.language),original:m.title,year:m.year,genres:m.genres,imdb:m.imdb,tmdb:m.tmdb,n:m.n||0,avg:m.avg||0});
  let rowMemoKey='',rowMemo=[];
  window.MovieRecShowcaseBridge={
    ready:()=>Boolean(state.loaded&&state.model?.movies?.length),
    catalog:()=>state.loaded?state.model.movies.map(getMovie):[],
    snapshot:()=>({ready:Boolean(state.loaded),mode:state.mode,language:state.language,rated:[...state.rated.entries()],recommended:!$('recommendWorkspace').hidden,recs:state.recs.map((r,i)=>({rank:i+1,movie:getMovie(r.movie),why:r.why||''})),error:$('loadStatus').classList.contains('error')?$('loadStatus').textContent:''}),
    comparison:()=>Array.isArray(state.lastCompare)?state.lastCompare.map(set=>({mode:set.mode,recs:set.recs.map((r,i)=>({rank:i+1,movie:getMovie(r.movie),why:r.why||''}))})):[],
    rows:()=>{if(!state.loaded||state.rated.size<3)return [];const profile=currentProfile(),key=JSON.stringify(profile);if(key===rowMemoKey)return rowMemo;rowMemoKey=key;rowMemo=['user','similarity'].map(mode=>{const raw=E.recommend(state.model,profile,mode,12);const real=mode==='user'?raw.filter(r=>r.method==='user'&&!r.why.includes('인기 기반 보완')):raw.filter(r=>r.method==='similarity');return{mode,label:mode==='similarity'?'콘텐츠·아이템 유사도':modes[mode],limited:mode==='user'&&profile.length<5,recs:real.map((r,i)=>({rank:i+1,movie:getMovie(r.movie),why:r.why||''}))};});return rowMemo;},
    openMovie:(id)=>{const movie=state.model?.movieById.get(Number(id));if(!movie)throw Error('영화 정보를 찾을 수 없습니다.');showDetail(movie.id,null);return true;},
    modes:()=>Object.entries(modes).map(([id,name])=>({id,name})),
    presets:()=>window.MovieRecPresets.presets.map(p=>({id:p.id,name:p.name})),
    rate:(movieId,value)=>{const id=Number(movieId),rating=Number(value);if(!state.loaded||!state.model.movieById.has(id)||!Number.isFinite(rating)||rating<.5||rating>5||rating*2%1!==0)throw Error('유효하지 않은 영화 평점입니다.');state.rated.set(id,rating);persist();renderRated();renderSearch(true);window.MovieRecOnboarding?.onLanguageChange();if(!$('recommendWorkspace').hidden)recommendNow();return state.rated.size;},
    unrate:(movieId)=>{state.rated.delete(Number(movieId));persist();renderRated();renderSearch(true);window.MovieRecOnboarding?.onLanguageChange();if(!$('recommendWorkspace').hidden)recommendNow();return state.rated.size;},
    start:()=>{if(state.rated.size<3)throw Error('최소 3편을 평가하세요.');if(!$('onboardingGate').hidden)$('onboardingSubmit').click();else if(!$('recommendWorkspace').hidden)recommendNow();return true;},
    setMode:id=>{const button=[...document.querySelectorAll('[data-algo]')].find(x=>x.dataset.algo===id);if(!button)throw Error('지원하지 않는 추천 모델입니다.');state.recs=[];button.click();return true;},
    preset:id=>{const element=$('onboardPreset');const option=[...element.options].find(x=>x.value===id);if(!option)throw Error('프리셋을 찾을 수 없습니다.');if($('onboardingGate').hidden){$('clearRatings').click();}element.value=id;element.dispatchEvent(new Event('change',{bubbles:true}));return state.rated.size;},
    reset:()=>{$('clearRatings').click();return true;},
    tab:id=>{const el=[...document.querySelectorAll('[data-tab]')].find(x=>x.dataset.tab===id);if(!el)throw Error('존재하지 않는 화면입니다.');el.click();return true;},
    language:code=>{if(!['ko','en'].includes(code))return;saveLanguage(code);return true;}
  };
  window.dispatchEvent(new Event('showcase-bridge-ready'));
})();