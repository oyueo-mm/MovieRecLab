'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dir=path.resolve(__dirname,'..'),benchmark=path.join(dir,'showcase/v11-benchmark.json'),config=path.join(dir,'showcase/v11-config.js');
assert.ok(fs.existsSync(benchmark),'real 25M 3-100 cold-start benchmark must be generated');
assert.ok(fs.existsSync(config),'evidence-gated V11 scoring weights required');
const report=JSON.parse(fs.readFileSync(benchmark,'utf8'));
assert.equal(report.version,'v11-2026');assert.ok(report.ratings>24000000&&report.films>8000);
assert.ok(report.validationUsers>=100&&report.testUsers>=100,'unseen test and validation users must be distinct and sufficient');
const nums=[3,5,10,20,50,100];assert.deepEqual(report.profiles,nums);
for(const p of nums){
 const key=String(p),sel=report.selection[key],a=report.test[key],v=report.validation[key];
 assert.ok(sel&&a&&v);
 for(const baseline of ['popular','v10','v9-tag'])assert.ok(a[baseline]?.n>=20,'frozen '+baseline+' valid for '+key);
 assert.ok(v[sel.candidate]?.n>=20&&a[sel.candidate]?.n>=20,'selected model present in both phases');
 for(const name of ['ndcg','recall','hit'])assert.ok(a.v10[name]>=0&&a.v10[name]<=1&&Number.isFinite(a[sel.candidate][name]));
 const expected=a[sel.candidate].ndcg>a.v10.ndcg+0.000001&&a[sel.candidate].recall>=a.v10.recall-.002;
 assert.equal(Boolean(sel.accepted),expected,'validation selection, independent test gate must match');
 assert.equal(sel.testNdcg,a[sel.candidate].ndcg);
 assert.equal(sel.v10TestNdcg,a.v10.ndcg);
}
const code=fs.readFileSync(config,'utf8'),context={window:{}};new vm.Script(code).runInNewContext(context);
const cfg=context.window.MovieRecV11Config;assert.equal(cfg.version,'v11-2026');assert.deepEqual(Array.from(cfg.profiles),nums);
for(const p of nums){const b=cfg.bins[p];assert.ok(b&&b.gamma>=0&&b.gamma<=1&&b.negativeScale>=0&&b.negativeScale<=1);assert.equal(Boolean(b.accepted),report.selection[p].accepted);}
assert.ok(Buffer.byteLength(code)<20000,'the web needs only a small configuration, no raw dataset');
assert.doesNotMatch(code,/ratings\.csv|genome-scores\.csv|perUser|userRatings/);
console.log('V11 true MovieLens 25M six-profile independent scoring, baseline comparisons, release gates, and tiny bundle passed.');