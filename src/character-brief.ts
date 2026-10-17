export const profileExample = `姓名：姜雾栖
年龄：21 岁
身份：隐世奇门遁甲世家独女、阵法武学传人
职业：阵法宗师、机关术士、江湖破局谋士
身高：167cm
体型：纤秀雅致，体态松弛静谧，看似柔弱，身法步法暗藏玄机
气质：神秘通透、沉静多思、温润藏诡、心思缜密，擅长运筹帷幄`;
export const artStyles = [
  { id: '3d', label: '3D 动漫', keyword: '3D 动漫画风' },
  { id: '2d', label: '2D 动漫', keyword: '2D 动漫画风' },
  { id: 'realistic', label: '真人超写实', keyword: '真人超写实风格' },
] as const;
export const referenceTitle = '影视角色完整设计参考图';
export function buildCharacterBrief(profile: string, style: string) {
  const selected = artStyles.find(s => s.id === style);
  if (!selected) throw Error('请选择画风');
  if (!profile.trim()) throw Error('请简单描述角色');
  const archive = profile.trim();
  return `生成一套古装角色影视参考设计，所有内容精致排版在一张完整参考图内。画风：${selected.keyword}。依据档案确定人物性别、外貌与设计，不改变明确给定的设定。\n角色基础档案：\n${archive}\n\n图片必须包含：\n1. 面部特写头像，占最大画幅。\n2. 全身形象三视图：正面、侧面、背面，人物身份与服饰一致。\n3. 服饰层级拆解，清晰展示内外层、材质纹理、刺绣与结构细节。\n4. 全套配色方案，展示主色、辅色、点缀色及对应色值。\n5. 专属随身道具，贴合身份、职业与气质，呈现结构、材质和用途。\n6. 三套不同场景穿搭，由 Codex 根据人设设计场景、服装及配饰，并在同一张图中展示。\n\n基础档案为自由描述，不要求姓名或任何固定字段；未提供的信息由 Codex 根据人设合理补充。由 Codex 补充完整角色设定、服饰、色彩、道具与三套场景穿搭方案，供图片模型使用。东方美学古风精致排版，分区清楚，中文标注准确，无错别字。人物与道具完整，无缺损、遮挡、覆盖或重叠。追求 8K 超清质感、最佳画质、清晰度与纹理细节，实际像素以所选模型与尺寸设置为准。只生成这一张综合参考图，不将三视图、拆解或三套穿搭拆成额外图片。`;
}
