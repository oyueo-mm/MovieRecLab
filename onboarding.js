(function(root){
'use strict';
const $=id=>document.getElementById(id);
const STAR_SCORES=[1,2,3,4,5];
const titles=[
'Matrix, The (1999)','Toy Story (1995)','Titanic (1997)','Inception (2010)',
'Shawshank Redemption, The (1994)','Forrest Gump (1994)','Dark Knight, The (2008)',
'Spirited Away (2001)','Finding Nemo (2003)','Notebook, The (2004)',
'Lion King, The (1994)','Jurassic Park (1993)','Home Alone (1990)',
'Iron Man (2008)','Avengers, The (2012)','Up (2009)','Frozen (2013)',
'WALL·E (2008)','Back to the Future (1985)','Inside Out (2015)',
'The Grand Budapest Hotel (2014)','La La Land (2016)','Coco (2017)',
'Harry Potter and the Sorcerer\'s Stone (a.k.a. Harry Potter and the Philosopher\'s Stone) (2001)',
'Shrek (2001)','Eternal Sunshine of the Spotless Mind (2004)',
'The Devil Wears Prada (2006)','Get Out (2017)','The Truman Show (1998)',
'Jumanji (1995)','Star Wars: Episode IV - A New Hope (1977)',
'Love Actually (2003)','Zootopia (2016)','Whiplash (2014)',
'500 Days of Summer (2009)','Howl\'s Moving Castle (Hauru no ugoku shiro) (2004)',
'Pirates of the Caribbean: The Curse of the Black Pearl (2003)',
'Batman Begins (2005)','Gladiator (2000)','The Sixth Sense (1999)',
'Interstellar (2014)','The Social Network (2010)','The Hangover (2009)',
'Slumdog Millionaire (2008)','Little Miss Sunshine (2006)',
'The Silence of the Lambs (1991)','Pulp Fiction (1994)',
'American Beauty (1999)','The Lord of the Rings: The Fellowship of the Ring (2001)'
];
const S={initialized:false,active:false,finished:false,page:0,pool:[],skipped:new Set(),search:'',manual:false};
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const movieName=m=>window.MovieRecI18N.displayTitle(m,state.language);
const genreName=m=>window.MovieRecI18N.displayGenres(m.genres.slice(0,2),state.language).join(' · ')||'장르 미기재';
function buildPool(){const byTitle=new Map(state.model.movies.map(m=>[m.title.toLowerCase(),m]));const chosen=[],used=new Set();for(const t of titles){let m=byTitle.get(t.toLowerCase());if(!m)continue;if(used.has(m.id))continue;used.add(m.id);chosen.push(m);}const all=state.model.movies.filter(m=>m.n>=20&&!used.has(m.id)).sort((a,b)=>b.n-a.n||a.id-b.id);const buckets=new Map();for(const m of all){let g=m.genres.find(g=>!['(no genres listed)','IMAX'].includes(g))||'기타';if(!buckets.has(g))buckets.set(g,[]);buckets.get(g).push(m);}for(let j=0;j<5;j++){for(const entries of buckets.values()){const m=entries[j];if(m&&!used.has(m.id)){chosen.push(m);used.add(m.id);}}}for(const m of all){if(!used.has(m.id)){chosen.push(m);used.add(m.id);}}return chosen;}
function cards(){if(!S.active)return;const query=S.search.trim().toLowerCase();let arr;if(query){arr=state.model.movies.filter(m=>!S.skipped.has(m.id)&&[m.title,window.MovieRecI18N.koTitle(m.title),...m.genres,...m.genres.map(g=>window.MovieRecI18N.genres[g]||g)].some(t=>String(t).toLowerCase().includes(query))).sort((a,b)=>b.n-a.n||b.pop-a.pop).slice(0,12);}else{const available=S.pool.filter(m=>!S.skipped.has(m.id));if(S.page*12>=available.length)S.page=0;arr=available.slice(S.page*12,(S.page+1)*12);}const n=state.rated.size;$('onboardingCount').textContent=n+'편 평가 완료';$('onboardingProgress').style.width=(Math.min(5,n)/5*100)+'%';$('onboardingProgress').setAttribute('aria-valuenow',String(Math.min(n,5)));$('onboardingHint').textContent=n<3?`추천받으려면 ${3-n}편 더 평가해 주세요.`:n<5?'지금 추천받을 수 있어요. 5편을 평가하면 자동으로 추천해 드려요.':'평가가 완료됐어요.';const button=$('onboardingSubmit');button.disabled=n<3;button.textContent=n<3?'영화 3편 이상 평가하면 추천받을 수 있어요':'내 취향 영화 추천받기';$('onboardingCards').innerHTML=arr.length?arr.map(m=>{const rating=state.rated.get(m.id)||0,original=movieName(m)!==m.title?m.title:'';return `<article class="onboard-card"><div class="onboard-card-head"><h3>${safe(movieName(m))}</h3>${rating?'<span class="onboard-checked">평가 완료</span>':''}</div>${original?`<p class="onboard-original">${safe(original)}</p>`:''}<p class="onboard-genre">${safe(genreName(m))}${m.year?' · '+m.year:''}</p><div class="onboard-stars" aria-label="${safe(movieName(m))} 별점">${STAR_SCORES.map(v=>`<button type="button" class="onboard-star ${v<=rating?'filled':''}" data-onboard-rate="${m.id}" data-value="${v}" aria-label="${safe(movieName(m))} ${v}점" aria-pressed="${rating===v}">★</button>`).join('')}</div><div class="onboard-card-foot"><span>${rating?`내 평점 ${rating.toFixed(1)}점`:'본 영화만 평가해 주세요'}</span><button type="button" class="onboard-skip" data-onboard-skip="${m.id}">안 봤어요</button></div></article>`;}).join(''):`<p class="onboard-empty">일치하는 영화를 찾지 못했어요. 다른 제목으로 검색하거나 다른 영화 목록을 이용해 주세요.</p>`;}
function show(){S.active=true;S.finished=false;$('onboardingGate').hidden=false;$('recommendWorkspace').hidden=true;document.body.classList.add('onboarding-mode');$('pageTitle').textContent='영화 취향 알아보기';$('pageDesc').textContent='본 영화에 별점을 남기면 취향에 맞는 영화를 추천해 드릴게요.';cards();}
function finish({scroll=true}={}){if(state.rated.size<3)return;S.active=false;S.finished=true;$('onboardingGate').hidden=true;$('recommendWorkspace').hidden=false;document.body.classList.remove('onboarding-mode');$('pageTitle').textContent=titlesForPage();$('pageDesc').textContent='영화를 평가하고 추천 방식별 결과를 살펴보세요.';if(state.mode!=='hybrid'){state.mode='hybrid';document.querySelectorAll('[data-algo]').forEach(b=>b.classList.toggle('is-active',b.dataset.algo==='hybrid'));$('algoDescription').textContent=descriptions.hybrid;}recommendNow();if(scroll)requestAnimationFrame(()=>$('recResults').closest('.pane').scrollIntoView({behavior:'smooth',block:'start'}));}
function titlesForPage(){return '내 취향 영화 추천';}
function onDataLoaded(){S.initialized=true;S.pool=buildPool();S.page=0;S.skipped.clear();S.search='';$('onboardingSearch').value='';show();}
function onLanguageChange(){if(S.initialized&&S.active)cards();}
function onTabOpen(name){if(S.initialized&&S.active&&name==='recommend'){$('pageTitle').textContent='영화 취향 알아보기';$('pageDesc').textContent='본 영화에 별점을 남기면 취향에 맞는 영화를 추천해 드릴게요.';}}
function onReset(){if(!S.initialized)return;S.page=0;S.skipped.clear();S.search='';$('onboardingSearch').value='';show();window.scrollTo({top:0,behavior:'smooth'});}
$('onboardingSubmit').addEventListener('click',()=>finish());
$('onboardingMore').addEventListener('click',()=>{S.search='';$('onboardingSearch').value='';S.page++;cards();});
$('onboardingSearch').addEventListener('input',e=>{S.search=e.target.value;S.page=0;cards();});
$('onboardingCards').addEventListener('click',e=>{const rate=e.target.closest('[data-onboard-rate]');if(rate){const id=Number(rate.dataset.onboardRate),value=Number(rate.dataset.value);state.rated.set(id,value);persist();renderRated();renderSearch();if(state.rated.size>=5)finish();else cards();return;}const skip=e.target.closest('[data-onboard-skip]');if(skip){S.skipped.add(Number(skip.dataset.onboardSkip));cards();}});
root.MovieRecOnboarding={onDataLoaded,onLanguageChange,onTabOpen,onReset,diagnostics:()=>({active:S.active,poolSize:S.pool.length,visible:S.active?$('onboardingCards').querySelectorAll('.onboard-card').length:0,rated:state.rated.size})};
})(window);
