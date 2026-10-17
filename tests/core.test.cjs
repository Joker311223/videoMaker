const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const {
  inside,
  readSafe,
  parseEvent,
  promptFor,
  Tasks,
  validPNG,
} = require("../electron/core.cjs");
test("目录边界拒绝相邻前缀与父目录", () => {
  assert.equal(inside("/a/b", "/a/b/c"), true);
  assert.equal(inside("/a/b", "/a/bad"), false);
  assert.equal(inside("/a/b", "/a/b/../secret"), false);
});
test("文件读取拒绝符号链接逃逸", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "studio-safe-"));
  try {
    await fs.symlink("/etc/hosts", path.join(dir, "escape"));
    await assert.rejects(readSafe(dir, "escape"), /超出/);
  } finally {
    await fs.rm(dir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 20,
    });
  }
});
test("JSONL事件兼容与无效行", () => {
  assert.equal(
    parseEvent('{"type":"item.completed","item":{"text":"完成"}}'),
    "完成",
  );
  assert.equal(
    parseEvent(
      '{"type":"item.started","item":{"type":"command_execution","command":"ls"}}',
    ),
    "执行：ls",
  );
  assert.equal(parseEvent("stderr message"), "stderr message");
});
test("prompt要求真实工具且全部素材", () => {
  const p = promptFor("少年");
  assert.match(p, /imagegen/);
  assert.match(p, /禁止尝试收费API回退/);
  assert.match(p, /角色设定图.png/);
  assert.match(p, /不要自行追加/);
});
test("PNG签名占位与截断均不能通过", () => {
  assert.equal(
    validPNG(
      Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        Buffer.alloc(100),
      ]),
    ),
    false,
  );
});
function fakeSpawn(record) {
  return (bin, args, opts) => {
    record.bin = bin;
    record.args = args;
    record.opts = opts;
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => {};
    record.child = child;
    return child;
  };
}
test("CLI通过stdin传递描述、非shell执行，缺失产物不能标成功", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-task-"));
  const record = {};
  const done = new Promise((resolve) => {
    const tasks = new Tasks(
      (j) => {
        if (j.status === "failed") resolve(j);
      },
      { spawn: fakeSpawn(record) },
    );
    tasks
      .start(root, "测试 $(touch /tmp/not-executed)", "/test/codex")
      .then((j) => {
        assert.equal(record.opts.shell, false);
        assert.equal(
          record.args.includes("测试 $(touch /tmp/not-executed)"),
          false,
        );
        record.child.emit("close", 0);
      });
  });
  try {
    const j = await done;
    assert.equal(j.status, "failed");
    assert.match(j.logs.at(-1), /生成未完成/);
  } finally {
    await fs.rm(root, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 20,
    });
  }
});
test("拒绝无效输入与取消非活动任务", async () => {
  const t = new Tasks(() => {});
  await assert.rejects(t.start("/tmp", "", "codex"), /请输入/);
  await assert.rejects(t.cancel("unknown"), /未在生成/);
});

for (const cancelDuringValidation of [false, true])
  test(
    cancelDuringValidation
      ? "图片校验期间取消不能覆盖成完成"
      : "完整产物完成任务并从文档读取角色名",
    async () => {
      const zlib = require("node:zlib");
      function crc32(buffer) {
        let n = 0xffffffff;
        for (const byte of buffer) {
          n ^= byte;
          for (let i = 0; i < 8; i++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0);
        }
        return (n ^ 0xffffffff) >>> 0;
      }
      function chunk(type, data) {
        const label = Buffer.from(type),
          length = Buffer.alloc(4),
          crc = Buffer.alloc(4);
        length.writeUInt32BE(data.length);
        crc.writeUInt32BE(crc32(Buffer.concat([label, data])));
        return Buffer.concat([length, label, data, crc]);
      }
      const ihdr = Buffer.alloc(13);
      ihdr.writeUInt32BE(64, 0);
      ihdr.writeUInt32BE(64, 4);
      ihdr[8] = 8;
      ihdr[9] = 6;
      const png = Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk("IHDR", ihdr),
        chunk("IDAT", zlib.deflateSync(Buffer.alloc(64 * (64 * 4 + 1)))),
        chunk("IEND", Buffer.alloc(0)),
      ]);
      assert.equal(validPNG(png), true);
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-success-"));
      const record = {};
      let resolveDone;
      const done = new Promise((r) => (resolveDone = r));
      const tasks = new Tasks(
        (j) => {
          if (j.status === (cancelDuringValidation ? "cancelled" : "completed"))
            resolveDone(j);
        },
        {
          spawn: fakeSpawn(record),
          imageCheck: async () => {
            if (cancelDuringValidation) {
              const job = [...tasks.jobs.values()][0];
              if (job.status === "generating") await tasks.cancel(job.id);
            }
          },
        },
      );
      try {
        const j = await tasks.start(root, "测试人物", "/test/codex");
        const md = [
          "# 角色设定：测试人物",
          "## 基本信息",
          "## 外观描述",
          "### 服装方案",
          "### 表情参考",
          "## 性格描述",
          "一句话人设",
          "## 可演绎的角色与场景",
          "### 适合演绎的角色类型",
          "### 适合演绎的场景",
          "### 演绎注意点",
          "## 配套素材",
        ].join("\n");
        await fs.writeFile(path.join(j.dir, "角色设定.md"), md);
        for (const {file: name} of tasks.jobs.get(j.id).assets)
          await fs.writeFile(path.join(j.dir, name), png);
        record.child.emit("close", 0);
        const finished = await done;
        await tasks.finishes.get(j.id);
        assert.equal(finished.name, "测试人物");
        await tasks.writes.get(j.id);
        assert.equal(
          JSON.parse(
            await fs.readFile(
              path.join(tasks.jobs.get(j.id).dir, "character.json"),
              "utf8",
            ),
          ).status,
          cancelDuringValidation ? "cancelled" : "completed",
        );
      } finally {
        await fs.rm(root, {
          recursive: true,
          force: true,
          maxRetries: 5,
          retryDelay: 20,
        });
      }
    },
  );
test("取消状态落盘且迟到的退出事件不能标记为成功", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-cancel-"));
  const record = {};
  const tasks = new Tasks(() => {}, { spawn: fakeSpawn(record) });
  try {
    const j = await tasks.start(root, "取消测试", "/test/codex");
    await tasks.cancel(j.id);
    record.child.emit("close", 0);
    await tasks.finishes.get(j.id);
    await tasks.writes.get(j.id);
    assert.equal(
      JSON.parse(
        await fs.readFile(
          path.join(tasks.jobs.get(j.id).dir, "character.json"),
          "utf8",
        ),
      ).status,
      "cancelled",
    );
  } finally {
    await fs.rm(root, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 20,
    });
  }
});

test("人物目录名保留中文且过滤路径字符、控制字符、空名与超长名", () => {
  const { safeName } = require("../electron/core.cjs");
  assert.equal(safeName("阳光青年"), "阳光青年");
  assert.equal(safeName("../小明/\\:*?\n"), "小明");
  assert.equal(safeName("..."), "未命名人物");
  assert.equal(safeName("CON"), "未命名人物");
  assert.equal(Array.from(safeName("阳".repeat(500))).length, 36);
});
test("CLI运行中保留初始目录，结束后即使缺图片也按人物名重命名且处理同名冲突", async () => {
  const { validRecord } = require("../electron/core.cjs");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-name-"));
  const record = {};
  const tasks = new Tasks(() => {}, { spawn: fakeSpawn(record) });
  try {
    const initial = await tasks.start(
      root,
      "一个勇敢的阳光少年",
      "/test/codex",
    );
    assert.match(
      path.basename(initial.dir),
      /^一个勇敢的阳光少年-[a-f0-9]{8}$/,
    );
    assert.equal(record.args[record.args.indexOf("-C") + 1], initial.dir);
    const base = "阳光青年-" + initial.id.slice(0, 8);
    await fs.mkdir(path.join(root, base));
    await fs.writeFile(path.join(root, base, "keep.txt"), "保留");
    await fs.writeFile(
      path.join(initial.dir, "角色设定.md"),
      "# 角色设定：阳光青年\n## 基本信息",
    );
    assert.equal(tasks.jobs.get(initial.id).dir, initial.dir);
    record.child.emit("close", 0);
    await tasks.finishes.get(initial.id);
    await tasks.writes.get(initial.id);
    const current = tasks.jobs.get(initial.id);
    assert.equal(current.status, "failed");
    assert.equal(current.id, initial.id);
    assert.equal(path.basename(current.dir), base + "-2");
    assert.equal(current.name, "阳光青年");
    await assert.rejects(fs.access(initial.dir));
    const saved = JSON.parse(
      await fs.readFile(path.join(current.dir, "character.json"), "utf8"),
    );
    assert.equal(validRecord(saved), true);
    assert.equal(saved.dir, current.dir);
    assert.equal(saved.id, initial.id);
    assert.equal(
      await fs.readFile(path.join(root, base, "keep.txt"), "utf8"),
      "保留",
    );
    assert.equal(validRecord({ ...saved, id: "../escape" }), false);
  } finally {
    await fs.rm(root, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 20,
    });
  }
});
test("同描述人物仍有不同目录，已有UUID目录记录保持兼容", async () => {
  const { validRecord } = require("../electron/core.cjs");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-dupe-"));
  const tasks = new Tasks(() => {}, { spawn: fakeSpawn({}) });
  try {
    const a = await tasks.start(root, "阳光青年", "/test/codex"),
      b = await tasks.start(root, "阳光青年", "/test/codex");
    assert.notEqual(a.dir, b.dir);
    assert.equal(validRecord({ ...a, dir: path.join(root, a.id) }), true);
    await tasks.cancel(a.id);
    await tasks.cancel(b.id);
    await Promise.all([...tasks.writes.values()]);
  } finally {
    await fs.rm(root, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 20,
    });
  }
});
