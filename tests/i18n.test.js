'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const dir=path.resolve(__dirname,'..'),root={};
for(const name of ['ko-titles.js','i18n.js'])vm.runInNewContext(fs.readFileSync(path.join(dir,name),'utf8'),root,{filename:name});
const L=root.MovieRecI18N,map=root.MovieRecKoreanTitles;
assert.ok(Object.keys(map).length>=7100);assert.equal(L.koTitle('Ghost (1990)',587),'사랑과 영혼');assert.equal(L.koTitle('Roman Holiday (1953)',916),'로마의 휴일');assert.equal(L.koTitle('Terminator 2: Judgment Day (1991)',589),'터미네이터 2: 심판의 날');assert.equal(L.koTitle('Unknown movie (2001)',1000000),'');assert.equal(L.displayTitle({id:587,title:'Ghost (1990)',year:1990},'ko'),'사랑과 영혼 (1990)');assert.equal(L.displayTitle({id:587,title:'Ghost (1990)',year:1990},'en'),'Ghost (1990)');assert.equal(L.koTag('atmospheric'),'분위기 있는');
for(const p of ['app.js','onboarding.js'])assert.match(fs.readFileSync(path.join(dir,p),'utf8'),/koTitle\(m\.title,m\.id\)/);console.log('PASS: Korean movie ID maps, Korean tags, original language, legacy priority, UI searches');
