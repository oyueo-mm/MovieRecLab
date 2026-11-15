'use strict';
/* Same-profile evaluation of actual Small primary and browser rails. Input/output
 * JSON-lines only, transient inside CI; no user histories persisted in artifacts. */
const readline=require('node:readline'),fs=require('node:fs');
const E=require('../engine.js');require('../advanced.js');
const A=globalThis.MovieRecAdvanced;globalThis.window=globalThis;
async function main(){
 const src='https://raw.githubusercontent.com/smanihwr/ml-latest-small/ba3cd91761e54faa64483456b619d1a1f4d70971/';
 const files=await Promise.all(['movies.csv','ratings.csv','tags.csv','links.csv'].map(async f=>{let r=await fetch(src+f,{signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error(f+' '+r.status);return [f,await r.text()]}));
 const data=E.parseFiles(Object.fromEntries(files)),model=E.createModel(data.movies,data.ratings),fit=A.train('adaptive',model);
 for(const p of ['ml25m-model','ml25m-recommender','v10-model','v10-recommender','v11-config','v11-recommender','v12-rails'])require('../showcase/'+p+'.js');
 const catalog=model.movies;
 console.log(JSON.stringify({ready:true,smallRatings:data.ratings.length}));
 for await(const line of readline.createInterface({input:process.stdin,crlfDelay:Infinity})){
  try{
   const {profile,allowed,rails}=JSON.parse(line),allow=new Set(allowed||[]),convert=rs=>(rs||[]).filter(x=>!allow.size||allow.has(Number(x.movie.id))).map(x=>Number(x.movie.id));
   const main=A.score(fit,model,profile,100),u=E.recommend(model,profile,'user',100),similar=E.recommend(model,profile,'similarity',100);
   let out={small:convert(main),small_user:convert(u),small_similarity:convert(similar)};
   if(rails){
    const v9=globalThis.MovieRec25M,v10=globalThis.MovieRecV10,v11=globalThis.MovieRecV11;
    const user=v9.recommend('user',profile,catalog,100)||u;
    const sim=v11.recommend('similarity',profile,catalog,100)||v10.recommend('similarity',profile,catalog,100)||v9.recommend('similarity',profile,catalog,100)||similar;
    const existing=[{key:'primary',recs:main.slice(0,12)},{key:'user',recs:user.slice(0,12)},{key:'content',recs:sim.slice(0,12)}];
    const extra=globalThis.MovieRecV12.recommendAll(profile,catalog,existing);
    out.live=[...existing,...extra].map(x=>convert(x.recs).slice(0,12));
   }
   console.log(JSON.stringify(out));
  }catch(e){console.log(JSON.stringify({error:String(e.stack||e)}))}
 }
}
main().catch(e=>{console.error(e);process.exitCode=1});
