const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  protocol,
  net,
  nativeImage,
  safeStorage,
} = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const { recordImages } = require("./asset-plan.cjs");
const { generationOptions } = require("./models.cjs");
const { Tasks, inside, readSafe } = require("./core.cjs");
protocol.registerSchemesAsPrivileged([
  {
    scheme: "character",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
if (process.env.CHARACTER_STUDIO_USER_DATA_DIR)
  app.setPath("userData", process.env.CHARACTER_STUDIO_USER_DATA_DIR);
let win,
  settings = {},
  tasks;
const known = new Map();
function configFile() {
  return path.join(app.getPath("userData"), "settings.json");
}
function publicSettings() {
  const { encryptedArkKey, ...rest } = settings;
  return { ...rest, defaultModel: settings.defaultModel || "codex", size: settings.size || "2K", hasApiKey: Boolean(encryptedArkKey), hasEnvApiKey: Boolean(process.env.ARK_API_KEY), canStoreKey: safeStorage.isEncryptionAvailable() && (process.platform !== "linux" || safeStorage.getSelectedStorageBackend() !== "basic_text") };
}
function arkKey() {
  if (settings.encryptedArkKey) {
    try { return safeStorage.decryptString(Buffer.from(settings.encryptedArkKey, "base64")); }
    catch { throw Error("已保存的密钥无法解密，请重新设置方舟 API Key"); }
  }
  return process.env.ARK_API_KEY;
}
function selectedGeneration(key) {
  key = key || settings.defaultModel || "codex";
  return generationOptions({ modelKey: key || settings.defaultModel || "codex", size: settings.size, model: key === "flash" ? settings.flashModel : key === "pro" ? settings.proModel : undefined });
}
async function startTask(description, generation, plan) {
  return tasks.start(await fs.realpath(settings.root), description, await executable(), generation, generation.provider === "doubao" ? arkKey() : undefined, plan);
}
async function executable() {
  const dirs = (process.env.PATH || "")
    .split(path.delimiter)
    .concat([
      "/opt/homebrew/bin",
      "/usr/local/bin",
      path.join(os.homedir(), ".local/bin"),
      path.join(os.homedir(), ".volta/bin"),
    ]);
  try {
    for (const v of await fs.readdir(
      path.join(os.homedir(), ".nvm/versions/node"),
    ))
      dirs.push(path.join(os.homedir(), ".nvm/versions/node", v, "bin"));
  } catch {}
  if (settings.codexPath) dirs.unshift(path.dirname(settings.codexPath));
  process.env.PATH = [...new Set(dirs)].join(path.delimiter);
  if (settings.codexPath) {
    if (!path.isAbsolute(settings.codexPath))
      throw Error("Codex 路径必须为绝对路径");
    await fs.access(settings.codexPath, fs.constants.X_OK);
    return settings.codexPath;
  }
  for (const d of dirs) {
    try {
      const p = path.join(d, "codex");
      await fs.access(p, fs.constants.X_OK);
      return p;
    } catch {}
  }
  throw Error("未找到 Codex，请在设置中选择可执行文件");
}
function command(bin, args) {
  return new Promise((resolve) => {
    let text = "";
    const p = spawn(bin, args, { shell: false, env: process.env });
    const timer = setTimeout(() => p.kill(), 10000);
    p.stdout.on("data", (d) => (text += d));
    p.stderr.on("data", (d) => (text += d));
    p.on("error", (e) => {
      clearTimeout(timer);
      resolve(e.message);
    });
    p.on("close", () => {
      clearTimeout(timer);
      resolve(text.trim().slice(0, 6000));
    });
  });
}
async function list() {
  if (!settings.root) return [];
  const result = [];
  for (const entry of await fs.readdir(settings.root, {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    try {
      const dir = path.join(settings.root, entry.name);
      const j = JSON.parse((await readSafe(dir, "character.json")).toString());
      if (
        !require("./core.cjs").validRecord(j) ||
        result.some((item) => item.id === j.id)
      )
        continue;
      const live = tasks.jobs.get(j.id);
      const item = live
        ? tasks.public(live)
        : {
            ...j,
            dir,
            status: j.status === "generating" ? "failed" : j.status,
          };
      if (!live && j.status === "generating") {
        item.logs = [
          ...(j.logs || []),
          "上次应用退出时任务中断，请重新生成副本。",
        ];
        await fs.writeFile(
          path.join(dir, "character.json"),
          JSON.stringify(item, null, 2),
        );
      }
      item.assets = recordImages(item);
      known.set(item.id, item.dir);
      result.push(item);
    } catch {}
  }
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
function dirFor(id) {
  if (typeof id !== "string" || !known.has(id)) throw Error("未知角色");
  return known.get(id);
}
function handle(name, fn) {
  ipcMain.handle(name, async (event, ...args) => {
    if (event.sender !== win.webContents) throw Error("无权访问");
    return fn(...args);
  });
}
app.whenReady().then(async () => {
  try {
    settings = JSON.parse(await fs.readFile(configFile(), "utf8"));
  } catch {}
  tasks = new Tasks(
    (j) => {
      known.set(j.id, j.dir);
      win?.webContents.send("task:update", j);
    },
    {
      imageCheck: (buffer) => {
        if (nativeImage.createFromBuffer(buffer).isEmpty())
          throw Error("PNG 图片无法解码");
      },
    },
  );
  protocol.handle("character", async (request) => {
    try {
      const u = new URL(request.url);
      const dir = dirFor(u.hostname);
      const file = decodeURIComponent(u.pathname.slice(1));
      const record = JSON.parse((await readSafe(dir, "character.json")).toString());
      if (!(await require("./core.cjs").loadManifest(dir, record)).some(item => item.file === file))
        return new Response("Forbidden", { status: 403 });
      await readSafe(dir, file);
      return net.fetch(pathToFileURL(path.join(dir, file)).href);
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
  handle("state", async () => ({ settings: publicSettings(), characters: await list() }));
  handle("choose-folder", async () => {
    if ([...tasks.jobs.values()].some((j) => j.status === "generating"))
      throw Error("请等待或取消当前生成后再切换目录");
    const r = await dialog.showOpenDialog(win, {
      properties: ["openDirectory", "createDirectory"],
    });
    if (!r.canceled) {
      settings.root = await fs.realpath(r.filePaths[0]);
      known.clear();
      await fs.writeFile(configFile(), JSON.stringify(settings));
    }
    return { settings: publicSettings(), characters: await list() };
  });
  handle("choose-codex", async () => {
    const r = await dialog.showOpenDialog(win, { properties: ["openFile"] });
    if (!r.canceled) {
      settings.codexPath = r.filePaths[0];
      await fs.writeFile(configFile(), JSON.stringify(settings));
    }
    return publicSettings();
  });
  handle("diagnose", async () => {
    const bin = await executable();
    return {
      path: bin,
      version: await command(bin, ["--version"]),
      login: await command(bin, ["login", "status"]),
      note: "imagegen 可用性取决于本机 Codex 的工具配置；生成任务会校验真实 PNG 文件。",
    };
  });
  handle("save-settings", async (input) => {
    if (!input || typeof input !== "object") throw Error("设置格式无效");
    generationOptions({ modelKey: input.defaultModel, size: input.size });
    generationOptions({ modelKey: "flash", model: input.flashModel || undefined });
    generationOptions({ modelKey: "pro", model: input.proModel || undefined });
    const next = { ...settings, defaultModel: input.defaultModel || "codex", size: input.size || "2K", flashModel: input.flashModel || "", proModel: input.proModel || "" };
    if (input.clearApiKey) delete next.encryptedArkKey;
    else if (input.apiKey) {
      if (typeof input.apiKey !== "string" || input.apiKey.length > 4096 || /\s/.test(input.apiKey)) throw Error("API Key 格式无效");
      if (!publicSettings().canStoreKey) throw Error("系统安全存储不可用；请使用 ARK_API_KEY 环境变量");
      next.encryptedArkKey = safeStorage.encryptString(input.apiKey).toString("base64");
    }
    await fs.writeFile(configFile(), JSON.stringify(next));
    settings = next;
    return publicSettings();
  });
  handle("create", async (description, modelKey, plan) => {
    if (!settings.root) throw Error("请先选择角色保存目录");
    const j = await startTask(description, selectedGeneration(modelKey), plan);
    known.set(j.id, j.dir);
    return j;
  });
  handle("delete", async (id) => {
    dirFor(id);
    if (tasks.jobs.get(id)?.status === "generating") throw Error("请先取消生成任务，再删除角色");
    const answer = await dialog.showMessageBox(win, {
      type: "warning", buttons: ["取消", "移到废纸篓"], defaultId: 0, cancelId: 0,
      message: "删除这个角色？", detail: "角色卡及其图片、角色设定文档将一起移到系统废纸篓。",
    });
    if (answer.response !== 1) return false;
    await tasks.finishes.get(id);
    await tasks.writes.get(id);
    const dir = await fs.realpath(dirFor(id));
    const root = await fs.realpath(settings.root);
    if (dir === root || !inside(root, dir) || path.dirname(dir) !== root)
      throw Error("角色目录不在当前保存目录内");
    const record = JSON.parse((await readSafe(dir, "character.json")).toString());
    if (record.id !== id) throw Error("角色记录不匹配");
    await shell.trashItem(dir);
    known.delete(id);
    tasks.jobs.delete(id);
    tasks.finishes.delete(id);
    tasks.writes.delete(id);
    return true;
  });
  handle("cancel", (id) => tasks.cancel(id));
  handle("retry", async (id) => {
    const old = JSON.parse((await readSafe(dirFor(id), "character.json")).toString());
    const generation = generationOptions(old.generation || {});
    const j = await startTask(old.description, generation, old.plan);
    known.set(j.id, j.dir);
    return j;
  });
  handle("detail", async (id) => {
    const dir = dirFor(id);
    let markdown = "";
    try {
      markdown = (await readSafe(dir, "角色设定.md")).toString("utf8");
    } catch {}
    const images = [];
    const record = JSON.parse((await readSafe(dir, "character.json")).toString());
    for (const {file} of await require("./core.cjs").loadManifest(dir, record)) {
      try {
        await readSafe(dir, file);
        images.push({
          name: file,
          url: `character://${id}/${encodeURIComponent(file)}`,
        });
      } catch {}
    }
    const performances = Array.isArray(record.performances) ? record.performances.map(performance => ({
      ...performance,
      images: images.filter(image => Array.isArray(performance.assetFiles) && performance.assetFiles.includes(image.name)),
    })) : [];
    return { markdown, images, performances };
  });
  handle("open-folder", async (id) => {
    const target = id ? dirFor(id) : settings.root;
    if (!target) throw Error("尚未设置目录");
    const error = await shell.openPath(target);
    if (error) throw Error(error);
  });
  win = new BrowserWindow({
    width: 1380,
    height: 920,
    minWidth: 1000,
    minHeight: 700,
    title: "角色工坊",
    backgroundColor: "#f6f5f0",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  await win.loadFile(path.join(__dirname, "../dist/index.html"));
});
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
  for (const j of tasks?.jobs.values() || [])
    if (j.status === "generating") tasks.cancel(j.id).catch(() => {});
});
