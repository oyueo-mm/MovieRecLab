(function(root){
'use strict';
const presets=[
{id:'scifi',name:'SF · 판타지',description:'SF와 우주·시간 여행을 좋아하는 취향',ratings:[['Matrix, The (1999)',5],['Inception (2010)',5],['Interstellar (2014)',5],['Star Wars: Episode IV - A New Hope (1977)',4.5],['Back to the Future (1985)',4.5],['Toy Story (1995)',3],['Notebook, The (2004)',1.5],['Love Actually (2003)',2]]},
{id:'action',name:'액션 · 히어로',description:'액션과 히어로 영화 중심',ratings:[['Dark Knight, The (2008)',5],['Batman Begins (2005)',5],['Iron Man (2008)',4.5],['Avengers, The (2012)',4.5],['Gladiator (2000)',5],['Titanic (1997)',2],['Frozen (2013)',2],['Notebook, The (2004)',1.5]]},
{id:'animation',name:'애니메이션 · 가족',description:'애니메이션과 가족 영화 중심',ratings:[['Toy Story (1995)',5],['Finding Nemo (2003)',5],['Lion King, The (1994)',5],['Shrek (2001)',4.5],['Up (2009)',4.5],['Zootopia (2016)',5],['Pulp Fiction (1994)',1.5],['Silence of the Lambs, The (1991)',2]]},
{id:'romance',name:'로맨스 · 감성',description:'로맨스와 감성적인 영화 중심',ratings:[['Notebook, The (2004)',5],['La La Land (2016)',5],['Titanic (1997)',5],['Love Actually (2003)',4.5],['(500) Days of Summer (2009)',4.5],['Eternal Sunshine of the Spotless Mind (2004)',5],['Dark Knight, The (2008)',2],['Hangover, The (2009)',2]]},
{id:'drama',name:'드라마 · 명작',description:'인물과 서사에 집중하는 취향',ratings:[['Shawshank Redemption, The (1994)',5],['Forrest Gump (1994)',5],['Whiplash (2014)',5],['Truman Show, The (1998)',4.5],['Social Network, The (2010)',4.5],['Grand Budapest Hotel, The (2014)',4.5],['Avengers, The (2012)',2],['Frozen (2013)',2]]},
{id:'thriller',name:'스릴러 · 미스터리',description:'긴장감 있는 미스터리와 범죄 영화 중심',ratings:[['Get Out (2017)',5],['Sixth Sense, The (1999)',5],['Silence of the Lambs, The (1991)',5],['Pulp Fiction (1994)',4.5],['Dark Knight, The (2008)',4.5],['Notebook, The (2004)',1.5],['Zootopia (2016)',2],['Toy Story (1995)',2.5]]}
];
function resolve(preset,model){if(!preset||!model||!Array.isArray(model.movies))return new Map();const titles=new Map(model.movies.map(movie=>[movie.title,movie.id])),result=new Map();for(const [title,rating] of preset.ratings){const id=titles.get(title);if(id!==undefined&&Number.isFinite(rating)&&rating>=.5&&rating<=5)result.set(id,rating);}return result;}
root.MovieRecPresets={presets,resolve};
})(typeof self!=='undefined'?self:globalThis);
