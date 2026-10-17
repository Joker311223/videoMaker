const {test} = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const exportsObject = {};
new Function('exports', ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname, '../src/pinch-zoom.ts'), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022}}).outputText)(exportsObject);
const {bindPinchZoom, clampImageScale} = exportsObject;
function wheel(properties) {
 const event = new Event('wheel', {cancelable:true});
 Object.assign(event, {ctrlKey:false, deltaY:0, deltaMode:0, clientX:100, clientY:200}, properties);
 return event;
}
test('双指捏合拦截页面缩放并传递位置、正确缩放方向', () => {
 const viewport = new EventTarget(), calls=[];
 const cleanup = bindPinchZoom(viewport, (...args) => calls.push(args));
 const enlarge=wheel({ctrlKey:true,deltaY:-10}); viewport.dispatchEvent(enlarge);
 assert.equal(enlarge.defaultPrevented,true); assert.ok(calls[0][0]>1); assert.deepEqual(calls[0][1],{x:100,y:200});
 const shrink=wheel({ctrlKey:true,deltaY:10}); viewport.dispatchEvent(shrink);
 assert.ok(calls[1][0]<1);
 cleanup(); viewport.dispatchEvent(wheel({ctrlKey:true,deltaY:-10})); assert.equal(calls.length,2);
});
test('普通双指滑动保持原生滚动，不触发缩放', () => {
 const viewport = new EventTarget();
 bindPinchZoom(viewport, () => assert.fail('普通滚动不缩放'));
 const event=wheel({deltaY:20}); viewport.dispatchEvent(event); assert.equal(event.defaultPrevented,false);
});
test('比例限制为5%至500%，兼容按行滚动增量', () => {
 assert.equal(clampImageScale(0),0.05); assert.equal(clampImageScale(8),5);
 const viewport=new EventTarget(), calls=[];
 bindPinchZoom(viewport, factor=>calls.push(factor));
 viewport.dispatchEvent(wheel({ctrlKey:true,deltaY:1,deltaMode:1}));
 assert.equal(calls[0],Math.exp(-0.16));
});
