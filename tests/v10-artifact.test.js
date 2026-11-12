'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),benchFile=path.join(root,'showcase/v10-benchmark.json'),artifact=path.join(root,'showcase/v10-model.js');
assert.ok(fs.existsSync(benchFile)&&fs.existsSync(artifact),'true 25M offline evaluation artifacts must exist');
const results=JSON.parse(fs.readFileSync(benchFile,'utf8'));assert.ok(results.ratings>=24000000&&results.movieCount>=8000);
for(const key of ['validation_5','validation_10','test_5','test_10'])assert.ok(results.counts[key]>=100);
for(const name of ['popular','v9-tag','svd','item-knn','user-knn','ease-top1200','als','bpr','item2vec','tag+als','tag+item-knn','tag+item2vec'])assert.ok(results.models.includes(name),'must actually evaluate '+name);
for(const stage of ['validation','test'])for(const count of ['5','10'])for(const name of results.models){
  const rec=results[stage][count][name];assert.ok(rec,'missing trial '+stage+count+name);
  for(const metric of ['ndcg','recall','hit'])assert.ok(Number.isFinite(rec[metric])&&rec[metric]>=0&&rec[metric]<=1);
  assert.ok(rec.coverage>=0&&rec.coverage<=results.movieCount);
}
const champion=results.selection.similarity,quality=results.selection.quality;
assert.ok(results.models.includes(champion));
const win=results.validation;
assert.ok(['5','10'].every(p=>results.test[p][champion]&&results.test[p]['v9-tag']),'true head-to-head benchmark');
const expectedGate=['5','10'].every(p=>results.test[p][champion].ndcg>results.test[p]['v9-tag'].ndcg);
assert.equal(quality.similarity,expectedGate,'acceptance rule must be checked after selection');
const file=fs.readFileSync(artifact,'utf8');
assert.ok(Buffer.byteLength(file)<10*1024*1024,'no oversized model bundle');
const context={window:{}};vm.runInNewContext(file,context);
const data=context.window.MovieRecV10Data;
assert.equal(data.version,'v10-2026');assert.equal(data.champion,champion);assert.equal(data.quality.similarity,expectedGate);
if(expectedGate){assert.ok(['itemknn','als','bpr','item2vec','svd'].includes(data.model?.type));assert.equal(data.model.rows.length,results.movieCount);assert.equal(new Set(Array.from(data.model.rows,x=>x[0])).size,results.movieCount);}
else assert.equal(data.model,null,'failed model cannot publish default production weights');
assert.doesNotMatch(file,/userRatings|rawGenome|ratings\.csv|genome-scores\.csv/,'do not publish raw training interactions');
console.log('V10 true offline 25M benchmark, 12 baseline and candidate models, user-level holdout, release gates, and derived data limits verified:',JSON.stringify(results.selection));