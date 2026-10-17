const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const compiled = ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname, '../src/character-brief.ts'), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const result = {exports:{}};
new Function('exports', compiled)(result.exports);
const {buildCharacterBrief, profileExample, artStyles} = result.exports;
test('三种画风互斥替换，完整保留人物档案与六类参考内容', () => {
  for (const style of artStyles) {
    const brief = buildCharacterBrief(profileExample, style.id);
    assert.match(brief, /姜雾栖/); assert.match(brief, /167cm/);
    assert.ok(brief.includes(style.keyword));
    for (const other of artStyles.filter(s => s.id !== style.id)) assert.ok(!brief.includes(other.keyword));
    for (const part of ['面部特写头像', '全身形象三视图', '服饰层级拆解', '全套配色方案', '专属随身道具', '三套不同场景穿搭', '不将三视图']) assert.ok(brief.includes(part));
  }
});
test('支持无姓名的一句描述，不混入案例或要求固定字段', () => {
  assert.throws(() => buildCharacterBrief('   ', '3d'), /描述角色/);
  const brief = buildCharacterBrief('沉默寡言的古代女剑客', '2d');
  assert.match(brief, /沉默寡言的古代女剑客/);
  assert.ok(!brief.includes('姜雾栖')); assert.ok(!brief.includes('167cm'));
  assert.match(brief, /不要求姓名或任何固定字段/);
});
