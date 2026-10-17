export type CharacterTags = { gender: string; ages: string[]; personality: string[] };
type TagSource = { description?: string; markdown?: string; tags?: Partial<CharacterTags>; performances?: {description?: string; markdown?: string}[] };
export function characterTags(character: TagSource): CharacterTags {
  const sources = [character.description || '', ...(character.performances || []).map(p => p.description || p.markdown || '')];
  const text = sources.join('\n');
  const genders = [...text.matchAll(/(?:性别|生理性别)\s*[：:]\s*(男(?:性)?|女(?:性)?|非二元|其他)/g)].map(m => m[1].replace(/性$/, ''));
  const ageValues = [...text.matchAll(/(?:年龄|年齡)\s*[：:]\s*(\d{1,3}(?:\s*[-–至~]\s*\d{1,3})?)\s*岁?/g)].map(m => `${m[1].replace(/\s/g, '')}岁`);
  const personality = [...text.matchAll(/(?:性格(?:与气质)?|气质(?:与性格)?|性格关键词)\s*[：:]\s*([^\n]+)/g)]
    .flatMap(m => m[1].split(/[、，,；;。/]/)).map(v => v.trim()).filter(v => v.length >= 2 && v.length <= 12);
  return {
    gender: character.tags?.gender || [...new Set(genders)].join(' / ') || '未注明',
    ages: character.tags?.ages?.length ? character.tags.ages : [...new Set(ageValues)],
    personality: (character.tags?.personality?.length ? character.tags.personality : [...new Set(personality)]).slice(0, 5),
  };
}

export type LibraryFilters = { query: string; gender: string; minAge: string; maxAge: string; sort: string };
function ageRanges(ages: string[]) {
  return ages.flatMap(age => {
    const numbers = age.match(/\d+/g)?.map(Number) || [];
    return numbers.length ? [{min: Math.min(...numbers), max: Math.max(...numbers)}] : [];
  });
}
export function selectCharacters<T extends TagSource & {name: string; createdAt: string}>(items: T[], filters: LibraryFilters): T[] {
  const lower = filters.minAge === '' ? -Infinity : Number(filters.minAge);
  const upper = filters.maxAge === '' ? Infinity : Number(filters.maxAge);
  if (lower > upper) return [];
  const enriched = items.map(item => {
    const tags = characterTags(item);
    const ranges = ageRanges(tags.ages);
    const gender = tags.gender.replace(/性/g, '');
    return {item, tags, ranges, gender, age: ranges.length ? Math.min(...ranges.map(a => a.min)) : null};
  }).filter(({item, tags, ranges, gender}) => {
    const text = [item.name, item.description || '', ...tags.personality].join(' ').toLowerCase();
    return text.includes(filters.query.trim().toLowerCase())
      && (filters.gender === 'all' || (filters.gender === 'other' ? !['男', '女'].includes(gender) : gender === filters.gender))
      && ((filters.minAge === '' && filters.maxAge === '') || ranges.some(age => age.max >= lower && age.min <= upper));
  });
  enriched.sort((a,b) => {
    if (filters.sort === 'age-asc' || filters.sort === 'age-desc') {
      if (a.age === null && b.age !== null) return 1;
      if (b.age === null && a.age !== null) return -1;
      if (a.age !== null && b.age !== null && a.age !== b.age) return filters.sort === 'age-asc' ? a.age - b.age : b.age - a.age;
    }
    if (filters.sort === 'gender') {
      const rank = (gender: string) => gender === '女' ? 0 : gender === '男' ? 1 : 2;
      const difference = rank(a.gender) - rank(b.gender);
      if (difference) return difference;
    }
    return b.item.createdAt.localeCompare(a.item.createdAt) || a.item.name.localeCompare(b.item.name, 'zh-CN');
  });
  return enriched.map(({item}) => item);
}
