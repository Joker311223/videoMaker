const path = require('node:path');
const legacyAssets = ['角色设定-休闲装三视图.png', '换装1-职场通勤装三视图.png', '换装2-跑步运动装三视图.png', '表情差分表.png'];
function defaultTitle(description = '') {
  if (/四[个种]?视图|四视图|大头.{0,80}正.{0,20}侧.{0,20}背|特写[\s\S]*正面全身[\s\S]*侧面全身[\s\S]*背面全身/.test(description)) return '四视图角色设定图';
  if (/三视图|正[面侧\s/、和]*侧[面\s/、和]*背面/.test(description)) return '三视图角色设定图';
  return '角色设定图';
}
function inferPlan(description = '') {
  const match = description.match(/(?:生成|制作|画|要|需要|共|一共|分别)?\s*([1-9][0-9]*|[一二两三四五六七八九十])\s*张(?:图片|图|角色|设定|素材)?/);
  const numbers = {一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10};
  const count = match ? numbers[match[1]] || Number(match[1]) : 1;
  if (count < 1 || count > 10) throw Error('图片清单最多 10 张，请拆分任务');
  const title = defaultTitle(description);
  return Array.from({length:count}, (_,i) => ({title: count === 1 ? title : `${title}${i+1}（按描述中的第${i+1}张需求）`}));
}
function validAssetFile(file) {
  return typeof file === 'string' && file.length <= 160 && file.length > 4 && !file.startsWith('.') && path.basename(file) === file && !/[\\/<>:"|?*\x00-\x1f\x7f]/.test(file) && /\.png$/i.test(file);
}
function manifestImages(value) {
  const images = value?.images;
  if (!Array.isArray(images) || images.length < 1 || images.length > 10) throw Error('图片清单必须包含 1–10 张图片');
  const seen = new Set();
  return images.map(item => {
    if (!validAssetFile(item?.file) || seen.has(item.file.toLowerCase())) throw Error('图片清单含不安全或重复文件名');
    seen.add(item.file.toLowerCase());
    return { file: item.file };
  });
}
function normalizePlan(input, description = '') {
  if (input === undefined) input = inferPlan(description);
  if (!Array.isArray(input) || !input.length || input.length > 10) throw Error('图片清单必须包含 1–10 张图片');
  const seen = new Set();
  return input.map(item => {
    const title = typeof item === 'string' ? item : item?.title;
    const prompt = typeof item === 'string' ? item : item?.prompt || title;
    if (typeof title !== 'string' || !title.trim() || title.length > 500 || typeof prompt !== 'string' || !prompt.trim() || prompt.length > 2000) throw Error('每张图片请输入标题或需求，最多 500 字');
    const base = Array.from(title.normalize('NFKC').replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g,' ').replace(/\s+/g,' ').replace(/^[.\s]+|[.\s]+$/g,'')).slice(0,60).join('') || '角色设定图';
    let file = `${base}.png`, count = 2;
    while (seen.has(file.toLowerCase())) file = `${base}-${count++}.png`;
    if (!validAssetFile(file)) throw Error('图片名称无效');
    seen.add(file.toLowerCase());
    return { title: title.trim(), prompt: prompt.trim(), file };
  });
}
function recordImages(record) {
  if (record.assets !== undefined) return manifestImages({images:record.assets});
  return legacyAssets.map(file=>({file}));
}
module.exports = { legacyAssets, defaultTitle, inferPlan, validAssetFile, manifestImages, normalizePlan, recordImages };
