const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FILE = /^[0-9a-f-]{36}\.(png|jpg|jpeg|webp)$/;
function id(value) {
  if (typeof value !== "string" || !UUID.test(value))
    throw Error("故事标识无效");
  return value;
}
function text(value, limit = 20000) {
  if (typeof value !== "string" || value.length > limit)
    throw Error("故事文字格式无效");
  return value;
}
function array(value, limit) {
  if (!Array.isArray(value) || value.length > limit)
    throw Error("故事内容数量超出限制");
  return value;
}
function validate(input) {
  if (!input || typeof input !== "object") throw Error("故事格式无效");
  const title = text(input.title, 200).trim();
  if (!title) throw Error("请输入故事名称");
  const seen = new Set();
  const unique = (value) => {
    id(value);
    if (seen.has(value)) throw Error("故事内容标识重复");
    seen.add(value);
    return value;
  };
  return {
    title,
    description: text(input.description ?? ""),
    characterIds: [...new Set(array(input.characterIds ?? [], 1000).map(id))],
    chapters: array(input.chapters ?? [], 100).map((chapter) => ({
      id: unique(chapter.id),
      title: text(chapter.title, 200),
      summary: text(chapter.summary ?? ""),
      shots: array(chapter.shots ?? [], 100).map((shot) => ({
        id: unique(shot.id),
        title: text(shot.title, 200),
        description: text(shot.description ?? ""),
        images: array(shot.images ?? [], 20).map((image) => {
          if (!FILE.test(image.file)) throw Error("场景图片路径无效");
          return {
            id: unique(image.id),
            file: image.file,
            name: text(image.name, 500),
          };
        }),
      })),
    })),
  };
}
function images(story) {
  return story.chapters.flatMap((c) => c.shots.flatMap((s) => s.images));
}
class Stories {
  constructor(root, options = {}) {
    this.root = root;
    this.options = options;
    this.queues = new Map();
  }
  async base() {
    const root = this.root();
    if (!root) throw Error("请先选择保存目录，再管理故事");
    const real = await fs.realpath(root);
    const base = path.join(real, "故事");
    await fs.mkdir(base, { recursive: true });
    if ((await fs.realpath(base)) !== base)
      throw Error("故事目录不可使用符号链接");
    return base;
  }
  async dir(storyId, create = false) {
    const dir = path.join(await this.base(), id(storyId));
    if (create) await fs.mkdir(dir);
    if ((await fs.realpath(dir)) !== dir)
      throw Error("故事目录不可使用符号链接");
    return dir;
  }
  queue(storyId, work) {
    const previous = this.queues.get(storyId) || Promise.resolve();
    const next = previous.catch(() => {}).then(work);
    this.queues.set(storyId, next);
    next
      .finally(() => {
        if (this.queues.get(storyId) === next) this.queues.delete(storyId);
      })
      .catch(() => {});
    return next;
  }
  async read(storyId) {
    const dir = await this.dir(storyId);
    const file = path.join(dir, "story.json");
    if ((await fs.realpath(file)) !== file)
      throw Error("故事文件不可使用符号链接");
    const record = JSON.parse(await fs.readFile(file, "utf8"));
    if (
      record.id !== storyId ||
      !Number.isSafeInteger(record.revision) ||
      record.revision < 1
    )
      throw Error("故事记录无效");
    return {
      ...validate(record),
      id: record.id,
      createdAt: text(record.createdAt, 100),
      updatedAt: text(record.updatedAt, 100),
      revision: record.revision,
    };
  }
  async list() {
    if (!this.root()) return [];
    const base = await this.base();
    const result = [];
    for (const entry of await fs.readdir(base, { withFileTypes: true }))
      if (entry.isDirectory() && UUID.test(entry.name)) {
        try {
          result.push(await this.read(entry.name));
        } catch {}
      }
    return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async write(dir, record) {
    const temp = path.join(dir, `.story-${randomUUID()}.tmp`);
    try {
      await fs.writeFile(temp, JSON.stringify(record, null, 2), { flag: "wx" });
      await fs.rename(temp, path.join(dir, "story.json"));
    } finally {
      await fs.unlink(temp).catch(() => {});
    }
    return record;
  }
  async save(input) {
    const content = validate(input);
    const storyId = input.id === undefined ? randomUUID() : id(input.id);
    return this.queue(storyId, async () => {
      const old = input.id ? await this.read(storyId) : null;
      if (old && input.revision !== old.revision)
        throw Error("故事已更新，请重新打开后再保存");
      const allowed = new Set(
        old ? images(old).map((i) => JSON.stringify(i)) : [],
      );
      if (images(content).some((i) => !allowed.has(JSON.stringify(i))))
        throw Error("请通过导入添加场景图片");
      const now = new Date().toISOString();
      return this.write(await this.dir(storyId, !old), {
        ...content,
        id: storyId,
        createdAt: old?.createdAt || now,
        updatedAt: now,
        revision: (old?.revision || 0) + 1,
      });
    });
  }
  async image(storyId, file) {
    if (!FILE.test(file)) throw Error("图片路径无效");
    const story = await this.read(id(storyId));
    if (!images(story).some((i) => i.file === file)) throw Error("图片未登记");
    const target = path.join(await this.dir(storyId), file);
    if ((await fs.realpath(target)) !== target)
      throw Error("图片不可使用符号链接");
    return target;
  }
  async importImages(storyId, chapterId, shotId, files) {
    id(storyId);
    id(chapterId);
    id(shotId);
    return this.queue(storyId, async () => {
      const story = await this.read(storyId);
      const shot = story.chapters
        .find((c) => c.id === chapterId)
        ?.shots.find((s) => s.id === shotId);
      if (!shot) throw Error("分镜不存在");
      if (!files.length) return story;
      if (shot.images.length + files.length > 20)
        throw Error("每个分镜最多 20 张图片");
      const dir = await this.dir(storyId);
      const copied = [];
      try {
        for (const source of files) {
          const ext = path.extname(source).toLowerCase();
          if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext))
            throw Error("仅支持 PNG、JPG、WebP 图片");
          const handle = await fs.open(source, "r");
          let buffer;
          try {
            const stat = await handle.stat();
            if (!stat.isFile() || stat.size > 25 * 1024 * 1024)
              throw Error("图片须小于 25 MB");
            buffer = await handle.readFile();
            if (buffer.length > 25 * 1024 * 1024)
              throw Error("图片须小于 25 MB");
          } finally {
            await handle.close();
          }
          if (!this.options.imageCheck) throw Error("图片校验不可用");
          this.options.imageCheck(buffer);
          const imageId = randomUUID();
          const file = imageId + ext;
          await fs.writeFile(path.join(dir, file), buffer, { flag: "wx" });
          copied.push(file);
          shot.images.push({ id: imageId, file, name: path.basename(source) });
        }
        story.revision++;
        story.updatedAt = new Date().toISOString();
        await this.write(dir, story);
        return story;
      } catch (error) {
        await Promise.all(
          copied.map((file) => fs.unlink(path.join(dir, file)).catch(() => {})),
        );
        throw error;
      }
    });
  }
  async delete(storyId, confirm, trash) {
    id(storyId);
    return this.queue(storyId, async () => {
      const story = await this.read(storyId);
      if (!(await confirm(story))) return false;
      await trash(await this.dir(storyId));
      return true;
    });
  }
}
module.exports = { Stories, validate };
