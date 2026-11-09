(function(root){
'use strict';
const $=id=>document.getElementById(id),A=root.MovieRecAdvanced,L=root.MovieRecI18N;
const state={model:null,movies:null,ratings:null,language:'ko',openMovie:null,profile:[],recs:[],view:'map',metric:'ndcg',worker:null,request:0,benchmark:null,benchmarkPromise:null};
const clean=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const name=id=>{const m=state.model?.movieById.get(+id);return m?L.displayTitle(m,state.language):'영화 '+id;};
const active=()=>$('visualize')?.classList.contains('active');
const message=s=>{$('vizMessage').textContent=s||'';};
function heading(title,subtitle){$('vizTitle').textContent=title;$('vizSubtitle').textContent=subtitle;$('vizMetricWrap').hidden=state.view!=='performance';}
function legend(parts){$('vizLegend').innerHTML=parts.map(([color,label])=>'<span><i class="viz-dot" style="background:'+color+'"></i>'+clean(label)+'</span>').join('');}
const info=s=>{$('vizExplanation').innerHTML=s;};
function baseSvg(content){return '<svg viewBox="0 0 900 500" role="img" aria-label="'+clean(state.view==='map'?'영화의 Item2Vec 이차원 위치':'영화의 공동 고평가 관계 네트워크')+'" xmlns="http://www.w3.org/2000/svg"><rect width="900" height="500" fill="#fff" />'+content+'</svg>';}
function grid(){let out='';for(let i=1;i<9;i++)out+='<line class="viz-grid" x1="'+(i*100)+'" y1="25" x2="'+(i*100)+'" y2="475" />';for(let i=1;i<5;i++)out+='<line class="viz-grid" x1="35" y1="'+(i*100)+'" x2="865" y2="'+(i*100)+'" />';return out;}
function mapSvg(data){
const cx=p=>64+772*p.x,cy=p=>45+410*p.y,colors={other:'#bbc6d7',recommended:'#f59a43',liked:'#366cd7',disliked:'#db7281'},rank={other:0,recommended:1,disliked:2,liked:3};
const points=data.points.slice().sort((a,b)=>rank[a.kind]-rank[b.kind]);
const circles=points.map(p=>{const rad=p.kind==='other'?2.6:p.kind==='recommended'?7:8,opacity=p.kind==='other'?.55:1;return '<circle class="viz-point" data-viz-id="'+p.id+'" tabindex="0" role="button" aria-label="'+clean(name(p.id))+'" cx="'+cx(p).toFixed(2)+'" cy="'+cy(p).toFixed(2)+'" r="'+rad+'" fill="'+colors[p.kind]+'" opacity="'+opacity+'"><title>'+clean(name(p.id))+' · '+p.n+'건 평가'+(p.kind==='recommended'?' · 추천':p.kind==='liked'?' · 좋아한 영화':p.kind==='disliked'?' · 낮게 평가한 영화':'')+'</title></circle>';}).join('');
$('vizPlot').innerHTML=baseSvg(grid()+circles);legend([['#366cd7','좋아한 영화 (4점 이상)'],['#db7281','낮게 평가한 영화'],['#f59a43','현재 추천 영화'],['#bbc6d7','그 외 영화']]);
info('실제 MovieLens 사용자 평가에서 학습한 <strong>Item2Vec 영화 벡터</strong>를 PCA로 2차원에 투영한 지도입니다. 인기 영화 약 500편과 내가 평가한 영화·현재 추천 영화가 표시됩니다. 거리가 가까운 영화는 이 임베딩에서 비슷한 문맥을 가진다는 뜻이지만, 실제 취향의 인과적 유사성이나 현재 선택된 추천 모델의 내부 구조를 그대로 나타내지는 않습니다. 점을 누르면 영화 상세정보가 열립니다.');
message('영화 '+data.points.length.toLocaleString('ko-KR')+'편 표시 · 전체 학습 후보 '+data.total.toLocaleString('ko-KR')+'편');
}
function networkSvg(data){
const at=i=>data.nodes[i],px=p=>65+p.x*770,py=p=>32+p.y*430;
const lines=data.edges.slice().sort((a,b)=>a.weight-b.weight).map(e=>{const a=at(e.a),b=at(e.b);const thick=(1.2+Math.min(4,e.weight*7)).toFixed(2);return '<line class="viz-edge" x1="'+px(a).toFixed(1)+'" y1="'+py(a).toFixed(1)+'" x2="'+px(b).toFixed(1)+'" y2="'+py(b).toFixed(1)+'" stroke-width="'+thick+'" opacity="'+Math.min(.7,.2+e.weight).toFixed(3)+'"><title>'+clean(name(a.id))+' ↔ '+clean(name(b.id))+' · '+e.count+'명 공동 고평가</title></line>';}).join('');
const colors={seed:'#386ed8',recommended:'#ef9b4b',other:'#92a6bd'};
const nodes=data.nodes.map(n=>{const r=n.kind==='seed'?12:n.kind==='recommended'?9:7;const x=px(n),y=py(n),label=n.kind==='seed'?name(n.id).replace(/\s*\(\d{4}\)$/,'').slice(0,19):'';return '<circle class="viz-point" data-viz-id="'+n.id+'" tabindex="0" role="button" aria-label="'+clean(name(n.id))+'" cx="'+x.toFixed(2)+'" cy="'+y.toFixed(2)+'" r="'+r+'" fill="'+colors[n.kind]+'"><title>'+clean(name(n.id))+' · '+n.positive+'명 4점 이상 평가</title></circle>'+(label?'<text class="viz-label" x="'+(x+15).toFixed(2)+'" y="'+(y+4).toFixed(2)+'">'+clean(label)+'</text>':'');}).join('');
$('vizPlot').innerHTML=baseSvg(lines+nodes);
legend([['#386ed8','기준 영화 (내가 좋아한 영화 우선)'],['#ef9b4b','현재 추천 영화'],['#92a6bd','함께 좋아한 다른 영화']]);
info('MovieLens에서 <strong>4점 이상으로 함께 평가한 사용자</strong>의 수를 이용한 관계망입니다. 파란색 기준 영화에서 관계가 강한 영화부터 최대 26개를 표시합니다. 선은 최소 3명 이상이 두 영화를 모두 좋아한 경우에만 연결되며 선 굵기는 공동 선호 강도를 나타냅니다. 영화가 연결되었다고 해서 장르나 줄거리가 유사하다는 의미는 아닙니다. 영화와 선에 마우스를 올려 상세 수치를 확인할 수 있습니다.');
message(data.nodes.length+'편의 영화 · '+data.edges.length+'개 연결 · 기준 영화 '+data.seedCount+'편');
}
const labels={popular:'인기 기반',content:'콘텐츠 기반',user:'사용자 KNN',item:'아이템 KNN',hybrid:'하이브리드','hybrid-previous':'이전 하이브리드',...A.labels};
const metricNames={ndcg:'NDCG@10',recall:'Recall@10',hit:'Hit Rate@10',coverage:'Coverage'};
function performance(data){
const k=state.metric,sorted=data.results.slice().sort((a,b)=>b[k]-a[k]),max=Math.max(.0000001,...sorted.map(x=>x[k]));
const fmt=v=>k==='coverage'?v.toLocaleString('ko-KR')+'편':(100*v).toFixed(2)+'%';
$('vizPlot').innerHTML='<div class="viz-perf-list" role="img" aria-label="실제 MovieLens 오프라인 성능 비교 · '+metricNames[k]+'">'+sorted.map((x,i)=>'<div class="viz-perf-row'+(!i?' best':'')+'"><span class="viz-model">'+(i+1)+'. '+clean(labels[x.mode]||x.mode)+'</span><div class="viz-perf-bar" title="'+clean(labels[x.mode]||x.mode)+' · '+fmt(x[k])+'"><span style="width:'+(x[k]/max*100).toFixed(2)+'%"></span></div><span class="viz-perf-value">'+fmt(x[k])+'</span></div>').join('')+'</div>';
legend([['#2e63d3',metricNames[k]+' 1위'],['#7ea4ed','다른 모델']]);
info('<strong>실제 MovieLens Small 고정 실험 결과</strong>입니다. 학습에서 '+data.heldoutUsers+'명을 제외하고 그중 평가 가능한 '+data.evaluatedUsers+'명의 최초 '+data.profileCount+'개 평점을 입력해 마지막 20%의 고평점 영화를 예측했습니다. 2026년 11월 9일 기준 실험 기록이며, 지금 브라우저에서 다시 학습해 측정한 수치는 아닙니다. EASE·SLIM은 평가 수 상위 125편만 학습했습니다. 단일 표본이므로 통계적 유의성이나 보편적인 우수성을 보장하지 않습니다. <a href="'+clean(data.runUrl)+'" rel="noopener noreferrer" target="_blank">GitHub Actions 실제 실행 기록 ↗</a>');
message(sorted.length+'개 모델 · '+data.evaluatedUsers+'명 평가 · 지표: '+metricNames[k]);
}
function ensureWorker(){
if(state.worker)return;state.worker=new Worker('./visualization-worker.js');
state.worker.onmessage=event=>{const m=event.data;if(m.type==='ready')return;if(m.requestId!==state.request||!active()||m.view!==state.view)return;if(m.type==='training'){message('실제 MovieLens 데이터를 사용해 '+(m.view==='map'?'Item2Vec 임베딩':'영화 공동 선호 관계')+' 학습 중…');return;}if(m.type==='error'){message('시각화 계산 실패: '+m.message);return;}if(m.type==='result'){if(m.view==='map')mapSvg(m.data);else networkSvg(m.data);}};
state.worker.onerror=()=>{message('시각화 Worker 실행에 실패했습니다. 새로고침 후 다시 시도해 주세요.');state.worker.terminate();state.worker=null;};
state.worker.postMessage({type:'init',movies:state.movies,ratings:state.ratings});
}
function showPerformance(){
if(state.benchmark){performance(state.benchmark);return;}
message('MovieLens 실제 성능 평가 결과를 불러오는 중…');$('vizPlot').innerHTML='';
if(!state.benchmarkPromise)state.benchmarkPromise=fetch('./benchmark-results.json').then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json();}).then(data=>{if(!Array.isArray(data.results)||data.results.length<22||!data.runUrl)throw Error('평가 결과 데이터 형식이 올바르지 않습니다.');state.benchmark=data;return data;});
state.benchmarkPromise.then(data=>{if(state.view==='performance'&&active())performance(data);}).catch(e=>{if(state.view==='performance')message('성능 데이터 불러오기 실패: '+e.message);state.benchmarkPromise=null;});
}
function render(){
if(!active())return;if(state.view==='performance'){heading('알고리즘 성능 비교','실제 MovieLens 고정 홀드아웃 실험 · NDCG·Recall·Hit Rate·Coverage');showPerformance();return;}
heading(state.view==='map'?'영화 취향 맵':'영화 연관 관계 네트워크',state.view==='map'?'Item2Vec 임베딩을 PCA 2D로 투영 · 현재 추천과 내 평점 강조':'4점 이상 공동 평가한 실제 영화 쌍으로 관계 계산');
if(!state.model){message('MovieLens 데이터가 아직 준비되지 않았습니다.');return;}
message('시각화 계산을 준비하는 중…');$('vizPlot').innerHTML='';$('vizLegend').innerHTML='';$('vizExplanation').textContent='';
ensureWorker();const requestId=++state.request;
state.worker.postMessage({type:'render',requestId,view:state.view,profile:state.profile,recs:state.recs.map(x=>x.movie.id)});
}
function mount(model,movies,ratings,language,openMovie){state.model=model;state.movies=movies;state.ratings=ratings;state.language=language;state.openMovie=openMovie;if(state.worker){state.worker.terminate();state.worker=null;}if(active())render();}
function setProfile(profile,recs){state.profile=profile;state.recs=recs||[];if(active()&&state.view!=='performance')render();}
function onTabOpen(tab){if(tab==='visualize')render();}
function setLanguage(language){state.language=language;if(active())render();}
document.querySelectorAll('[data-viz-tab]').forEach(b=>b.addEventListener('click',()=>{state.view=b.dataset.vizTab;for(const button of document.querySelectorAll('[data-viz-tab]')){const selected=button===b;button.classList.toggle('is-active',selected);button.setAttribute('aria-pressed',String(selected));}render();}));
$('vizMetric').addEventListener('change',e=>{state.metric=e.target.value;if(active()&&state.benchmark)performance(state.benchmark);});
function detailEvent(e){if(e.type==='keydown'&&!['Enter',' '].includes(e.key))return;const hit=e.target.closest('[data-viz-id]');if(!hit||!state.openMovie)return;if(e.type==='keydown')e.preventDefault();state.openMovie(+hit.dataset.vizId);}
$('vizPlot').addEventListener('click',detailEvent);$('vizPlot').addEventListener('keydown',detailEvent);
root.MovieRecVisualization={mount,setProfile,onTabOpen,setLanguage};
})(window);
