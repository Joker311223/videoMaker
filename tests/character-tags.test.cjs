const {test}=require('node:test');
const assert=require('node:assert/strict');
const ts=require('typescript');
const fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/character-tags.ts'),'utf8');
const output={};
new Function('exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(output);
const {characterTags}=output;
test('从不同参演档案提取年龄并去重，性格关键词保留',()=>{
 const tags=characterTags({performances:[{description:'性别：女\n年龄：21 岁\n气质与性格：沉静多思、心思缜密'},{description:'性别：女\n年龄：28岁\n性格：沉静多思、温柔'}]});
 assert.equal(tags.gender,'女');assert.deepEqual(tags.ages,['21岁','28岁']);assert.deepEqual(tags.personality,['沉静多思','心思缜密','温柔']);
});
test('无档案时显示未注明，不根据姓名猜测性别或年龄',()=>{
 assert.deepEqual(characterTags({description:'姓名：姜雾栖'}),{gender:'未注明',ages:[],personality:[]});
});
test('显式整理的标签优先于文本抽取',()=>{
 assert.deepEqual(characterTags({description:'年龄：21岁',tags:{gender:'女',ages:['22岁'],personality:['沉静']}}),{gender:'女',ages:['22岁'],personality:['沉静']});
});
const {selectCharacters}=output;
const fixtures=[
 {name:'甲',createdAt:'2026-01-01',tags:{gender:'女',ages:['21岁','38岁'],personality:['温柔']}},
 {name:'乙',createdAt:'2026-01-02',tags:{gender:'男',ages:['28岁']}},
 {name:'丙',createdAt:'2026-01-03',tags:{gender:'女',ages:['16-18岁']}},
 {name:'丁',createdAt:'2026-01-04',tags:{gender:'未注明'}},
];
const defaults={query:'',gender:'all',minAge:'',maxAge:'',sort:'latest'};
test('搜索、性别、年龄范围共同筛选，任一参演年龄匹配即可',()=>{
 assert.deepEqual(selectCharacters(fixtures,{...defaults,gender:'女',minAge:'35',maxAge:'40',query:'温柔'}).map(x=>x.name),['甲']);
 assert.deepEqual(selectCharacters(fixtures,{...defaults,minAge:'17',maxAge:'17'}).map(x=>x.name),['丙']);
 assert.deepEqual(selectCharacters(fixtures,{...defaults,minAge:'40',maxAge:'20'}),[]);
});
test('按年龄双向排序，未知年龄始终最后，不改变原数组',()=>{
 assert.deepEqual(selectCharacters(fixtures,{...defaults,sort:'age-asc'}).map(x=>x.name),['丙','甲','乙','丁']);
 assert.deepEqual(selectCharacters(fixtures,{...defaults,sort:'age-desc'}).map(x=>x.name),['乙','甲','丙','丁']);
 assert.deepEqual(fixtures.map(x=>x.name),['甲','乙','丙','丁']);
});
test('按性别分组、筛选未注明及重置默认顺序',()=>{
 assert.deepEqual(selectCharacters(fixtures,{...defaults,sort:'gender'}).map(x=>x.name),['丙','甲','乙','丁']);
 assert.deepEqual(selectCharacters(fixtures,{...defaults,gender:'other'}).map(x=>x.name),['丁']);
 assert.deepEqual(selectCharacters(fixtures,defaults).map(x=>x.name),['丁','丙','乙','甲']);
});
