'use strict';
const {chromium}=require('playwright'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
  const page=await browser.newPage({viewport:{width:1280,height:850}});
  let failures=0,successes=0;
  await page.route('https://images.metahub.space/**',route=>{
    const url=route.request().url();
    if(url.includes('/medium/')){failures++;return route.fulfill({status:404,contentType:'text/plain',body:'not found'});}
    successes++;return route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="320" height="480"><rect width="320" height="480" fill="#40738d"/></svg>'});
  });
  await page.route('https://image.tmdb.org/**',route=>route.fulfill({status:404,contentType:'text/plain',body:'not found'}));
  await page.setContent('<!doctype html><html><head><style>body{margin:0;background:#090a0c;color:#fff}.showcase{min-height:100vh}.recommend-track{display:flex;width:950px;overflow:auto;gap:12px}.recommend-card{flex:0 0 190px;display:flex;flex-direction:column;border:0;background:none;color:white}.recommend-card-art{display:grid;aspect-ratio:2/3;width:100%;background:#20262a}.recommend-card-art img,.recommend-card-fallback{grid-area:1/1}.recommend-card img{width:100%;height:100%;object-fit:cover}.poster-pending{opacity:0!important}.recommend-card-fallback{z-index:1;align-self:center;justify-self:center}.recommend-card-fallback[hidden]{display:none}</style></head><body><main class="showcase"><div id="host"></div></main></body></html>');
  await page.addScriptTag({path:path.join(__dirname,'..','showcase','art.js')});
  await page.addScriptTag({path:path.join(__dirname,'..','showcase','recommend-rails.js')});
  await page.evaluate(()=>{
    // Simulates a browser where the old scroll observer never calls back.
    window.IntersectionObserver=class{observe(){}disconnect(){}};
    const films=Array.from({length:9},(_,i)=>({id:210+i,title:'영화 '+i,imdb:'01234'+(100+i),tmdb:''}));
    window.MovieRecRails.mount(document.getElementById('host'),window.MovieShowcaseArt,()=>{}).render([{key:'user',label:'비슷한 사용자가 좋아한 영화',recs:films.map(movie=>({movie}))}]);
  });
  await page.waitForFunction(()=>[...document.querySelectorAll('.recommend-card img')].slice(0,5).every(img=>img.complete&&img.naturalWidth>0),null,{timeout:25000});
  await page.locator('.recommend-card[data-rank="8"]').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>{const img=document.querySelector('.recommend-card[data-rank="8"] img');return img.complete&&img.naturalWidth>0&&!img.classList.contains('poster-pending');},null,{timeout:25000});
  const result=await page.evaluate(()=>({total:document.querySelectorAll('.recommend-card').length,ready:[...document.querySelectorAll('.recommend-card img')].filter(i=>i.complete&&i.naturalWidth>0).length,loaded8:document.querySelector('.recommend-card[data-rank="8"] img').src,showing8:document.querySelector('.recommend-card[data-rank="8"] .recommend-card-fallback').hidden}));
  assert.equal(result.total,9);assert.ok(result.ready>=6);assert.ok(result.loaded8.includes('/poster/small/'));assert.equal(result.showing8,true);assert.ok(failures>=6&&successes>=6);
  console.log('REAL CHROMIUM PASS: poster images recover from HTTP 404 even after native loading=lazy; a non-firing IntersectionObserver cannot block ranked cards; '+JSON.stringify({failed:failures,recovered:successes,ready:result.ready}));
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});