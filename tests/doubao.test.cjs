const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { Tasks: BaseTasks } = require('../electron/core.cjs');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const documentPrompts = [];
function documentSpawn(executable, args) {
  const child = new EventEmitter();
  child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.stdin = new Writable({write(data, _encoding, done) {
    documentPrompts.push(data.toString());
    fs.writeFile(path.join(args[args.indexOf('-C') + 1], '角色设定.md'), '# 角色设定：将军\n## 基本信息\nCodex 补充设定\n## 外观描述\n遵循原描述\n## 配套素材\n按清单')
      .then(() => { done(); setImmediate(() => child.emit('close', 0)); }, done);
  }});
  return child;
}
class Tasks extends BaseTasks {
  constructor(emit, options = {}) { super(emit, {spawn: documentSpawn, ...options}); }
}

const { normalizePlan, defaultTitle, manifestImages, recordImages } = require('../electron/asset-plan.cjs');
const { generationOptions } = require('../electron/models.cjs');
// Structurally valid fixture; decoder checks are injected separately.
function chunk(type, data) { const length = Buffer.alloc(4); length.writeUInt32BE(data.length); return Buffer.concat([length, Buffer.from(type), data, Buffer.alloc(4)]); }
const header = Buffer.alloc(13); header.writeUInt32BE(64); header.writeUInt32BE(64, 4); header[8] = 8; header[9] = 6;
const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(Buffer.alloc(64 * 257))), chunk('IEND', Buffer.alloc(0))]);
const success = () => ({ ok: true, json: async () => ({ data: [{ b64_json: png.toString('base64') }] }) });
async function temporary(fn) { const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-doubao-')); try { await fn(root); } finally { await fs.rm(root, {recursive: true, force: true, maxRetries: 5, retryDelay: 20}); } }
test('模型选项拒绝非法模型与尺寸，旧任务默认Codex', () => {
  assert.equal(generationOptions().provider, 'codex');
  assert.throws(() => generationOptions({modelKey:'invalid'}));
  assert.throws(() => generationOptions({modelKey:'flash',size:'8K'}));
  assert.throws(() => generationOptions({modelKey:'flash',model:'../secret'}));
});
test('无凭证提前失败，未创建任务或请求', async () => temporary(async root => {
  const t = new Tasks(() => {}, {fetch: () => assert.fail('不应请求')});
  await assert.rejects(t.start(root,'人物',null,{modelKey:'flash'}), /API Key/);
  assert.deepEqual(await fs.readdir(root), []);
}));
test('豆包按两张清单顺序请求、参考首图、快照落盘且无密钥', async () => temporary(async root => {
  const requests = [];
  const input = {modelKey:'pro',size:'1.5K',model:'ep-test'};
  const t = new Tasks(() => {}, {fetch: async (url, options) => {requests.push({url,options,body:JSON.parse(options.body)}); return success();}, imageCheck: () => {}});
  const j = await t.start(root,'古风将军',null,input,'test-secret',[{title:'原始设定图'}, {title:'战损服装设定图'}]); input.size='2K';
  await t.finishes.get(j.id); await t.writes.get(j.id);
  const live = t.jobs.get(j.id);
  assert.equal(live.status,'completed'); assert.equal(requests.length,2);
  assert.equal(requests[0].body.image,undefined);
  assert.match(requests[0].body.prompt, /Codex 补充设定/);
  assert.match(documentPrompts.at(-1), /不生成图片/);
  assert.match(documentPrompts.at(-1), /战损服装设定图/);
  for (const {body} of requests) { assert.equal(body.size,'1.5K'); assert.equal(body.model,'ep-test'); assert.equal(body.stream,undefined); assert.equal(body.sequential_image_generation,undefined); }
  assert.equal(requests[1].body.image,'data:image/png;base64,'+png.toString('base64'));
  const record = await fs.readFile(path.join(live.dir,'character.json'),'utf8'); assert.equal(record.includes('test-secret'),false);
  for (const {file} of live.assets) assert.deepEqual(await fs.readFile(path.join(live.dir,file)),png);
}));
test('HTTP错误无自动重试且不记录服务端敏感错误', async () => temporary(async root => {
  let calls=0;
  const t = new Tasks(() => {}, {fetch: async () => {calls++; return {ok:false,status:401,json:async()=>({error:{message:'test-secret'}})};}});
  const j=await t.start(root,'人物',null,{modelKey:'flash'},'test-secret'); await t.finishes.get(j.id); await t.writes.get(j.id);
  assert.equal(calls,1); assert.equal(t.jobs.get(j.id).status,'failed'); assert.equal(JSON.stringify(t.public(t.jobs.get(j.id))).includes('test-secret'),false);
}));
test('取消迟到响应不写图片也不继续请求', async () => temporary(async root => {
  let resolveFetch; let calls=0;
  const t = new Tasks(() => {}, {fetch: async () => {calls++; return new Promise(r=>resolveFetch=r);}});
  const j=await t.start(root,'人物',null,{modelKey:'flash'},'test-secret');
  while (!resolveFetch) await new Promise(r=>setImmediate(r));
  await t.cancel(j.id); resolveFetch(success()); await t.finishes.get(j.id); await t.writes.get(j.id);
  assert.equal(calls,1); assert.equal(t.jobs.get(j.id).status,'cancelled');
  await assert.rejects(fs.access(path.join(t.jobs.get(j.id).dir,t.jobs.get(j.id).assets[0].file)));
}));
test('JSON响应读取超时触发abort且不继续生成', async () => temporary(async root => {
  const t = new Tasks(() => {}, {requestTimeout:10, fetch: async (_url,{signal}) => ({ok:true,json:()=>new Promise((_r,reject)=> signal.addEventListener('abort',()=>reject(Error('private transport error test-secret')),{once:true}))})});
  const j=await t.start(root,'人物',null,{modelKey:'flash'},'test-secret'); await t.finishes.get(j.id); await t.writes.get(j.id);
  assert.equal(t.jobs.get(j.id).status,'failed'); assert.match(t.jobs.get(j.id).logs.join(' '), /超时/); assert.equal(JSON.stringify(t.public(t.jobs.get(j.id))).includes('test-secret'),false);
}));
test('拒绝有效base64但不是PNG的响应', async () => temporary(async root => {
  const t = new Tasks(() => {}, {fetch:async()=>({ok:true,json:async()=>({data:[{b64_json:Buffer.from('not png').toString('base64')}]})})});
  const j=await t.start(root,'人物',null,{modelKey:'flash'},'test-secret'); await t.finishes.get(j.id); await t.writes.get(j.id);
  assert.equal(t.jobs.get(j.id).status,'failed'); assert.match(t.jobs.get(j.id).logs.join(' '), /PNG/);
}));

test('四视图或三视图是单张，明确两张才生成两项', () => {
  const description = '左侧大头特写，右侧正面全身、标准侧面全身和背面全身，四个视图';
  assert.equal(defaultTitle(description), '四视图角色设定图');
  assert.equal(normalizePlan(undefined, description).length, 1);
  assert.equal(normalizePlan(undefined, '三视图角色设定').length, 1);
  assert.equal(normalizePlan(undefined, '请生成两张图，第一张正面，第二张背面').length, 2);
  assert.equal(normalizePlan(undefined, '生成3张角色图').length, 3);
  assert.throws(() => normalizePlan(undefined, '生成11张图'), /最多 10/);
});
test('默认四视图单次请求，不擅自追加换装表情背景', async () => temporary(async root => {
  const requests=[];
  const t = new Tasks(() => {}, {fetch: async (_url, options) => {requests.push(JSON.parse(options.body)); return success();}});
  const description='古风将军，四个视图合在一张图，红色背景';
  const j=await t.start(root,description,null,{modelKey:'flash'},'secret'); await t.finishes.get(j.id); await t.writes.get(j.id);
  assert.equal(requests.length,1); assert.equal(t.jobs.get(j.id).assets.length,1);
  assert.match(requests[0].prompt,/红色背景/); assert.doesNotMatch(requests[0].prompt,/纯白背景|日常通勤|训练运动|九种/);
  const md=await fs.readFile(path.join(t.jobs.get(j.id).dir,'角色设定.md'),'utf8'); assert.doesNotMatch(md,/平静、微笑|日常、行动/);
}));
test('清单安全与数量限制，重复标题去重', () => {
  for (const file of ['../escape.png','a/b.png','a\\b.png','evil.svg','.hidden.png','x.png\0']) assert.throws(()=>manifestImages({images:[{file}]}));
  assert.throws(()=>manifestImages({images:[{file:'x.png'},{file:'X.png'}]}));
  assert.throws(()=>normalizePlan([])); assert.throws(()=>normalizePlan(Array(11).fill('人物')));
  assert.deepEqual(normalizePlan(['角色','角色']).map(i=>i.file), ['角色.png','角色-2.png']);
});
test('校验拒绝清单被增改与符号链接逃逸', async () => temporary(async root => {
  const {loadManifest,validate}=require('../electron/core.cjs');
  const t=new Tasks(()=>{}, {spawn:()=>{throw Error('测试不启动')}});
  const j=await t.start(root,'人物','unused'); await t.writes.get(j.id);
  const dir=t.jobs.get(j.id).dir;
  await fs.writeFile(path.join(dir,'assets.json'),JSON.stringify({images:[{file:'extra.png'}]}));
  await assert.rejects(loadManifest(dir,t.jobs.get(j.id)),/不一致/);
  await fs.writeFile(path.join(dir,'assets.json'),JSON.stringify({images:j.assets}));
  await fs.writeFile(path.join(dir,'角色设定.md'),'# 角色设定：人物\n## 基本信息\n## 外观描述\n## 配套素材');
  await fs.symlink('/etc/hosts',path.join(dir,j.assets[0].file));
  await assert.rejects(validate(dir,t.jobs.get(j.id)),/超出/);
}));
test('旧人物没有manifest仍能校验与读取原四文件', async () => temporary(async root => {
  const {loadManifest,validate}=require('../electron/core.cjs');
  const old={description:'人物'};
  assert.equal(recordImages(old).length,4);
  await fs.writeFile(path.join(root,'角色设定.md'),'# 角色设定：人物\n## 基本信息\n## 外观描述\n## 配套素材');
  for (const {file} of recordImages(old)) await fs.writeFile(path.join(root,file),png);
  assert.equal((await loadManifest(root,old)).length,4); await validate(root,old);
}));

test('Codex 文档失败时不调用豆包且任务失败', async () => temporary(async root => {
  const t = new Tasks(() => {}, {spawn: () => { throw Error('Codex unavailable'); }, fetch: () => assert.fail('不应调用图片 API')});
  const j = await t.start(root, '人物', '/test/codex', {modelKey:'flash'}, 'secret');
  await t.finishes.get(j.id); await t.writes.get(j.id);
  assert.equal(t.jobs.get(j.id).status, 'failed');
}));
