const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { Stories } = require("../electron/stories.cjs");
async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "stories-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return {
    root,
    store: new Stories(() => root, {
      imageCheck: (b) => {
        if (b.toString() !== "valid image") throw Error("图片无效");
      },
    }),
  };
}
const input = () => ({
  title: "雾中来客",
  description: "故事介绍",
  characterIds: [randomUUID()],
  chapters: [
    {
      id: randomUUID(),
      title: "第一章",
      summary: "起因",
      shots: [
        {
          id: randomUUID(),
          title: "远景",
          description: "山谷对饮",
          images: [],
        },
      ],
    },
  ],
});
test("stories persist introduction, character bindings, chapters and storyboards", async (t) => {
  const { root, store } = await setup(t);
  const draft = input();
  const saved = await store.save(draft);
  assert.equal(saved.revision, 1);
  assert.deepEqual((await new Stories(() => root).list())[0], saved);
  assert.deepEqual(saved.characterIds, draft.characterIds);
  const updated = await store.save({ ...saved, title: "新名字" });
  assert.equal(updated.revision, 2);
  assert.equal(updated.chapters[0].shots[0].description, "山谷对饮");
});
test("concurrent revisions reject stale writes and preserve successful changes", async (t) => {
  const { store } = await setup(t);
  const saved = await store.save(input());
  const results = await Promise.allSettled([
    store.save({ ...saved, description: "A" }),
    store.save({ ...saved, description: "B" }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await store.read(saved.id)).description, "A");
  await assert.rejects(store.save(saved), /已更新/);
});
test("imports scenes and serves only registered safe files", async (t) => {
  const { root, store } = await setup(t);
  const saved = await store.save(input());
  const source = path.join(root, "scene.png");
  await fs.writeFile(source, "valid image");
  const updated = await store.importImages(
    saved.id,
    saved.chapters[0].id,
    saved.chapters[0].shots[0].id,
    [source],
  );
  const img = updated.chapters[0].shots[0].images[0];
  assert.equal(updated.revision, 2);
  assert.equal(
    await fs.readFile(await store.image(saved.id, img.file), "utf8"),
    "valid image",
  );
  await assert.rejects(store.image(saved.id, "../scene.png"));
  await assert.rejects(store.image(saved.id, randomUUID() + ".png"));
  const target = await store.image(saved.id, img.file);
  await fs.unlink(target);
  await fs.symlink(source, target);
  await assert.rejects(store.image(saved.id, img.file), /符号链接/);
});
test("invalid input and image imports leave stored story intact", async (t) => {
  const { root, store } = await setup(t);
  await assert.rejects(store.save({ ...input(), title: "" }));
  await assert.rejects(store.save({ ...input(), id: "../oops" }));
  const draft = input();
  draft.chapters[0].shots[0].images = [
    { id: randomUUID(), file: "../x.png", name: "x" },
  ];
  await assert.rejects(store.save(draft));
  const saved = await store.save(input());
  const invalid = path.join(root, "bad.png");
  await fs.writeFile(invalid, "broken");
  await assert.rejects(
    store.importImages(
      saved.id,
      saved.chapters[0].id,
      saved.chapters[0].shots[0].id,
      [invalid],
    ),
  );
  assert.deepEqual(await store.read(saved.id), saved);
  await assert.rejects(
    store.save({ ...saved, chapters: Array(101).fill(saved.chapters[0]) }),
  );
});
test("delete cancellation retains files and confirmation trashes only the story", async (t) => {
  const { store } = await setup(t);
  const saved = await store.save(input());
  let trashed;
  assert.equal(
    await store.delete(
      saved.id,
      async () => false,
      () => assert.fail(),
    ),
    false,
  );
  assert.equal((await store.list()).length, 1);
  assert.equal(
    await store.delete(
      saved.id,
      async () => true,
      async (dir) => {
        trashed = dir;
        await fs.rm(dir, { recursive: true });
      },
    ),
    true,
  );
  assert.equal(path.basename(trashed), saved.id);
  assert.deepEqual(await store.list(), []);
});
test("unconfigured root and symlinked story directories fail safely", async (t) => {
  const empty = new Stories(() => undefined);
  assert.deepEqual(await empty.list(), []);
  await assert.rejects(empty.save(input()), /选择保存目录/);
  const { root, store } = await setup(t);
  const saved = await store.save(input());
  const dir = path.join(root, "故事", saved.id);
  await fs.rename(dir, path.join(root, "moved"));
  await fs.symlink(path.join(root, "moved"), dir);
  await assert.rejects(store.read(saved.id), /符号链接/);
});
