'use strict';
(function(root){
  function fold(doc,selector,title,outerClass){
    doc.querySelectorAll(selector).forEach(node=>{
      if(node.closest('details.'+outerClass))return;
      const box=doc.createElement('details'),summary=doc.createElement('summary');
      box.className=outerClass;summary.textContent=title;box.append(summary);
      node.replaceWith(box);box.append(node);
    });
  }
  function apply(doc){
    if(!doc||!doc.body)return;
    const ratingSearch=doc.getElementById('onboardingSearch');if(ratingSearch)ratingSearch.placeholder='영화 검색';
    const movieSearch=doc.getElementById('searchQuery');if(movieSearch)movieSearch.placeholder='영화 검색';
    const more=doc.getElementById('onboardingMore');if(more){more.textContent='다른 영화';more.setAttribute('aria-label','다른 영화 보기');}
    for(const section of [...doc.querySelectorAll('#guide .guide-section')]){
      if(!section.parentNode)continue;
      const heading=section.querySelector('h2');if(!heading)continue;
      const box=doc.createElement('details'),summary=doc.createElement('summary');
      box.className='compact-guide';summary.textContent=heading.textContent;box.append(summary);
      for(const node of [...section.childNodes])if(node!==heading)box.append(node);
      section.replaceWith(box);
    }
    fold(doc,'#compare .note','비교 유의사항','compact-note');
    fold(doc,'#evaluate .note','평가 기준·한계','compact-note');
    fold(doc,'#guide .footer-source','출처·데이터 이용 조건','compact-source');
    fold(doc,'#visualize #vizExplanation','시각화 설명','compact-visualization-info');
    refresh(doc);
  }
  function refresh(doc){
    const counter=doc?.getElementById('onboardingCount');if(!counter)return;
    const current=counter.textContent.trim();
    const match=current.match(/^(\d+)편 평가 완료$/);if(!match)return;
    const n=Number(match[1]),short=n<3?n+' / 3':n+'편';
    if(current!==short)counter.textContent=short;
    counter.setAttribute('aria-label',n+'편 평가 완료, 추천에 필요한 최소 3편');
  }
  root.MovieRecMinimalCopy={apply,refresh};
})(window);
