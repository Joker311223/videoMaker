const MODELS = {
  codex: { label: 'Codex imagegen', provider: 'codex', model: 'imagegen' },
  flash: { label: 'Doubao Seedream 5.0 Flash', provider: 'doubao', model: 'doubao-seedream-5-0-flash-260915' },
  pro: { label: 'Doubao Seedream 5.0 Pro', provider: 'doubao', model: 'doubao-seedream-5-0-pro-260628' },
};
function generationOptions(input = {}) {
  const key = input.modelKey || 'codex';
  if (!MODELS[key]) throw Error('请选择有效的图片模型');
  const size = input.size || '2K';
  if (!['1K', '1.5K', '2K'].includes(size)) throw Error('请选择有效尺寸');
  const model = input.model || MODELS[key].model;
  if (typeof model !== 'string' || !/^[a-zA-Z0-9._-]{1,160}$/.test(model)) throw Error('模型 ID 格式无效');
  return { modelKey: key, ...MODELS[key], model, size };
}
module.exports = { MODELS, generationOptions };
