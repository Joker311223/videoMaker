import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Plus,
  Trash2,
  Search,
  SlidersHorizontal,
  Users,
  Folder,
  Settings,
  Sparkles,
  ArrowUpRight,
  X,
  RefreshCw,
  Loader,
  ChevronRight,
  Check,
  Terminal,
  Image as ImageIcon,
} from "lucide-react";
import "./style.css";
import "./library-ui.css";
import { characterTags, selectCharacters, type CharacterTags } from "./character-tags";
import { ImagePreview, type PreviewImage } from "./image-preview";
import { profileExample, artStyles, referenceTitle, buildCharacterBrief } from "./character-brief";
type Character = {
  id: string;
  name: string;
  description: string;
  status: string;
  createdAt: string;
  logs: string[];
  dir: string;
  generation?: {label: string; size: string};
  assets?: {file: string}[];
  tags?: Partial<CharacterTags>;
  performances?: {id: string; title: string; description?: string; markdown?: string; assetFiles?: string[]}[];
};
declare global {
  interface Window {
    studio: {
      call: (method: string, ...args: unknown[]) => Promise<any>;
      subscribe: (fn: (j: Character) => void) => () => void;
    };
  }
}
const modelChoices = [["codex", "Codex imagegen"], ["flash", "Doubao Seedream 5.0 Flash"], ["pro", "Doubao Seedream 5.0 Pro"]];
function App() {
  const [preview, setPreview] = useState<PreviewImage | null>(null);
  const [genderFilter, setGenderFilter] = useState("all");
  const [minAge, setMinAge] = useState("");
  const [maxAge, setMaxAge] = useState("");
  const [sortOrder, setSortOrder] = useState("gender");
  const [profile, setProfile] = useState("");
  const [artStyle, setArtStyle] = useState("3d");
  const [modelKey, setModelKey] = useState("codex");
  const [apiKey, setApiKey] = useState("");
  const [items, setItems] = useState<Character[]>([]),
    [settings, setSettings] = useState<any>({}),
    [modal, setModal] = useState(false),
    [config, setConfig] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [diagnostic, setDiagnostic] = useState<any>(),
    [selected, setSelected] = useState<Character | null>(null),
    [detail, setDetail] = useState<any>(),
    [tab, setTab] = useState("images"),
    [query, setQuery] = useState("");
  const execute = async (fn: () => Promise<any>) => {
    setError("");
    try {
      return await fn();
    } catch (e) {
      setError(String(e).replace("Error: ", ""));
    }
  };
  useEffect(() => {
    execute(async () => {
      const s = await window.studio.call("state");
      setItems(s.characters);
      setSettings(s.settings);
      setModelKey(s.settings.defaultModel || "codex");
    });
    return window.studio.subscribe((j) => {
      setItems((old) =>
        [j, ...old.filter((x) => x.id !== j.id)].sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt),
        ),
      );
      setSelected((old) => (old?.id === j.id ? j : old));
    });
  }, []);
  useEffect(() => {
    if (selected)
      execute(async () =>
        setDetail(await window.studio.call("detail", selected.id)),
      );
    else setDetail(null);
  }, [selected?.id, selected?.status]);
  const deleteCharacter = (j: Character) => execute(async () => {
    if (await window.studio.call("delete", j.id)) {
      setItems(old => old.filter(item => item.id !== j.id));
      setSelected(old => old?.id === j.id ? null : old);
    }
  });
  const folder = (openCreate = false) =>
    execute(async () => {
      const s = await window.studio.call("choose-folder");
      setSettings(s.settings);
      setModelKey(s.settings.defaultModel || "codex");
      setItems(s.characters);
      if (openCreate && s.settings.root) setModal(true);
    });
  const create = () =>
    execute(async () => {
      setBusy(true);
      try {
        const description = buildCharacterBrief(profile, artStyle);
        const j = await window.studio.call("create", description, modelKey, [{title: referenceTitle, prompt: "按完整人物描述，将头像、全身三视图、服饰拆解、全套配色、专属道具及三套场景穿搭排版在同一张综合参考图中。"}]);
        setItems((old) => [j, ...old.filter((x) => x.id !== j.id)]);
        setProfile("");
        setModal(false);
      } finally {
        setBusy(false);
      }
    });
  const visibleItems = selectCharacters(items, {query, gender: genderFilter, minAge, maxAge, sort: sortOrder});
  const activeFilterCount = Number(genderFilter !== "all") + Number(minAge !== "" || maxAge !== "") + Number(sortOrder !== "gender");
  const active = items.filter((x) => x.status === "generating").length;
  const status = (s: string) =>
    ({
      completed: "已完成",
      generating: "创作中",
      failed: "生成未完成",
      cancelled: "已取消",
    })[s] || s;
  return (
    <div className="app">
      <aside>
        <div className="brand">
          <div className="brand-mark">
            <Sparkles size={23} />
          </div>
          <span>
            角色工坊<small>CHARACTER STUDIO</small>
          </span>
        </div>
        <div className="workspace-label">工作空间</div>
        <button className="nav active">
          <Users size={18} />
          人物库 <span>{items.length}</span>
        </button>
        <div className="sidebar-note">
          <span className="tiny-dot" />
          本地创作，自在保存<p>把一个灵感，变成有故事的人物。</p>
        </div>
        <div className="sidebar-bottom">
          <button className="nav" onClick={() => setConfig(true)}>
            <Settings size={18} />
            工作室设置
          </button>
          <div className="local-badge">
            <span />
            Codex / 豆包双引擎 <Terminal size={13} />
          </div>
        </div>
      </aside>
      <main>
        <header>
          <div className="breadcrumb">
            工作空间 <ChevronRight size={13} /> 人物库
          </div>
          <button className="folder-link" onClick={() => folder()}>
            <Folder size={15} />
            {settings.root ? settings.root.split("/").pop() : "选择保存文件夹"}
            <ArrowUpRight size={13} />
          </button>
        </header>
        <div className="content">
          <div className="intro">
            <div>
              <div className="eyebrow">YOUR CAST, YOUR STORIES</div>
              <h1>
                每个故事，从人物开始<span>。</span>
              </h1>
              <p>描述你的想象，让灵感拥有自己的模样。</p>
            </div>
            <button
              className="primary"
              onClick={() => (settings.root ? setModal(true) : folder(true))}
            >
              <Plus size={18} />
              新增人物
            </button>
          </div>
          <div className="toolbar">
            <div>
              <strong>全部人物</strong>
              <span className="count">{items.length}</span>
              {active > 0 && (
                <span className="active-count">
                  <Loader size={12} className="spin" />
                  {active} 位正在创作
                </span>
              )}
            </div>
            <label className="library-search"><Search size={16} aria-hidden="true" /><input
              aria-label="搜索人物"
              placeholder="搜索姓名、描述或性格关键词"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            /></label>
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
              <button onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {items.length > 0 && <details className="filter-panel">
            <summary>
              <span className="filter-toggle"><SlidersHorizontal size={15} /><span className="filter-chevron"><ChevronRight size={14} /></span><span className="filter-expand-label">展开筛选与排序</span><span className="filter-collapse-label">收起筛选与排序</span></span>
              {activeFilterCount > 0 && <span className="filter-badge">已启用 {activeFilterCount} 项</span>}
              <span className="filter-count" aria-live="polite">显示 {visibleItems.length} / {items.length} 位</span>
            </summary>
            <div className="library-filters">
            <label>性别<select value={genderFilter} onChange={e => setGenderFilter(e.target.value)}><option value="all">全部性别</option><option value="女">女</option><option value="男">男</option><option value="other">其他 / 未注明</option></select></label>
            <label>年龄范围<div className="age-filter"><input type="number" min="0" max="999" value={minAge} placeholder="最低年龄" aria-label="最低年龄" onChange={e => setMinAge(e.target.value)} /><span>至</span><input type="number" min="0" max="999" value={maxAge} placeholder="最高年龄" aria-label="最高年龄" onChange={e => setMaxAge(e.target.value)} /><span>岁</span></div></label>
            <label>排序<select value={sortOrder} onChange={e => setSortOrder(e.target.value)}><option value="gender">女性优先（默认）</option><option value="latest">最近创建</option><option value="age-asc">年龄从小到大</option><option value="age-desc">年龄从大到小</option></select></label>
            <button className="secondary" onClick={() => {setGenderFilter("all"); setMinAge(""); setMaxAge(""); setSortOrder("gender"); setQuery("");}}>重置</button>
            {(minAge !== "" || maxAge !== "") && <span className="filter-help">任一参演年龄符合即可；年龄未注明的角色不参与范围筛选。</span>}
            {minAge !== "" && maxAge !== "" && Number(minAge) > Number(maxAge) && <span className="filter-help" role="alert">最低年龄不能大于最高年龄。</span>}
            </div>
          </details>}
          {items.length === 0 ? (
            <div className="empty">
              <div className="empty-art">
                <div className="sketch s1" />
                <div className="sketch s2" />
                <div className="sketch main-sketch">
                  <Users size={55} strokeWidth={1} />
                  <span>HELLO, CHARACTER</span>
                </div>
                <Sparkles className="little-star" size={26} />
              </div>
              <h2>下一位主角，正在你的想象里</h2>
              <p>
                从一段描述开始，按你的图片清单生成角色素材。
                <br />
                每位人物都有自己的本地文件夹。
              </p>
              <button
                className="primary"
                onClick={() => (settings.root ? setModal(true) : folder(true))}
              >
                <Plus size={17} />
                {settings.root ? "创建第一位人物" : "选择文件夹，开始创作"}
              </button>
              <div className="empty-meta">
                <span>01 输入人物描述</span>
                <i />
                <span>02 模型创作素材</span>
                <i />
                <span>03 收藏完整角色</span>
              </div>
            </div>
          ) : (
            <div className="grid">
              {visibleItems.length === 0 && <p className="no-results">没有符合条件的角色，请调整筛选或搜索条件。</p>}
              {visibleItems
                .map((j) => {
                  const tags = characterTags(j);
                  return (
                  <div className={`card-wrap ${tags.gender === "女" || tags.gender === "女性" ? "gender-female" : tags.gender === "男" || tags.gender === "男性" ? "gender-male" : "gender-neutral"}`} key={j.id}>
                  <button
                    className="card"
                    onClick={() => {
                      setSelected(j);
                      setTab("images");
                    }}
                  >
                    <div className={"card-image " + j.status}>
                      {j.status === "completed" ? (
                        <img
                          src={`character://${j.id}/${encodeURIComponent(j.assets?.[0]?.file || "角色设定-休闲装三视图.png")}`}
                          alt={j.name}
                          title="点击放大图片"
                          onClick={e => {e.stopPropagation(); setPreview({url: e.currentTarget.src, name: j.name});}}
                        />
                      ) : j.status === "generating" ? (
                        <div className="generating-visual">
                          <div className="orbit" />
                          <Sparkles size={34} />
                          <span>正在构思人物的模样</span>
                        </div>
                      ) : (
                        <div className="failed-visual">
                          <ImageIcon size={35} strokeWidth={1} />
                          <span>{status(j.status)}</span>
                        </div>
                      )}
                      <span className={"status " + j.status}>
                        {j.status === "generating" && (
                          <Loader size={11} className="spin" />
                        )}
                        {j.status === "completed" && <Check size={11} />}{" "}
                        {status(j.status)}
                      </span>
                    </div>
                    <div className="card-body">
                      <h3>
                        {j.name}
                        <ArrowUpRight size={16} />
                      </h3>
                      <div className="character-tags" aria-label="角色主要标签">
                        <span className="basic-tag">性别：{tags.gender}</span>
                        <span className="basic-tag">年龄：{tags.ages.join(" / ") || "未注明"}</span>
                        <div className="personality-tags" aria-label="性格关键词">
                          {tags.personality.length ? tags.personality.map(keyword => <span key={keyword}>{keyword}</span>) : <span>性格待补充</span>}
                        </div>
                      </div>
                      <p className="card-summary">{j.performances?.length ? j.performances.map(performance => performance.title).join(" / ") : j.description}</p>
                      <div className="card-foot">
                        <span>
                          {new Date(j.createdAt).toLocaleDateString("zh-CN")}
                        </span>
                        <span>
                          {j.status === "completed"
                            ? j.performances?.length ? `${j.performances.length} 条参演记录` : `${j.assets?.length || 4} 张素材 · 角色设定`
                            : "查看任务详情"}
                        </span>
                      </div>
                    </div>
                  </button>
                  <button className="card-delete" title={j.status === "generating" ? "请先取消生成任务" : "删除角色"} aria-label={`删除角色 ${j.name}`} disabled={j.status === "generating"} onClick={() => deleteCharacter(j)}><Trash2 size={16} /></button>
                  </div>
                  );
                })}
            </div>
          )}
          <footer>
            <span>
              <span className="tiny-dot" />
              素材保存在你的电脑上
            </span>
            <span>用想象力，为故事选角。</span>
          </footer>
        </div>
      </main>
      {modal && (
        <div className="overlay">
          <section className="dialog">
            <button className="close" onClick={() => setModal(false)}>
              <X />
            </button>
            <div className="dialog-icon">
              <Sparkles />
            </div>
            <div className="eyebrow">CREATE A CHARACTER</div>
            <h2>让你心中的人物登场</h2>
            <p>填写角色基础档案，Codex 自动补充服饰、配色、道具和三套场景穿搭。</p>
            <label>画风<select value={artStyle} onChange={e => setArtStyle(e.target.value)}>{artStyles.map(style => <option key={style.id} value={style.id}>{style.label}</option>)}</select></label>
            <label>角色基础档案
              <textarea autoFocus className="profile-input" maxLength={6000} value={profile} onChange={e => setProfile(e.target.value)} placeholder={`可自由描述，以下仅为案例，无需逐项填写：\n\n${profileExample}`} />
            </label>
            <label>图片模型<select value={modelKey} onChange={e => setModelKey(e.target.value)}>{modelChoices.map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select></label>
            <div className="reference-summary">
              <strong>自动生成一张完整影视参考图</strong>
              <p>最大画幅面部特写 · 全身三视图 · 服饰层级拆解 · 全套配色 · 专属随身道具 · 三套场景穿搭</p>
              <span>东方古风排版，追求 8K 细节质感。实际分辨率以图片模型及尺寸设置为准。</span>
            </div>
            <div className="hint">
              可粘贴档案，也可只写一句人物想法，无需填写固定字段。其余设定由 Codex 合理补充。提示文字仅作建议，不会作为输入提交。
              <br />
              {modelKey === "codex" ? "使用本机 Codex 登录与额度，需可用 imagegen 工具。" : `使用方舟 API，独立消耗豆包额度，尺寸 ${settings.size || "2K"}。角色描述与设计方案仍由 Codex 补充。`}
            </div>
            {error && <div className="error">{error}</div>}
            <div className="dialog-actions">
              <button className="secondary" onClick={() => setModal(false)}>
                先存于想象
              </button>
              <button
                className="primary"
                disabled={!profile.trim() || busy}
                onClick={create}
              >
                {busy ? (
                  <Loader size={17} className="spin" />
                ) : (
                  <Sparkles size={17} />
                )}
                开始创作
              </button>
            </div>
          </section>
        </div>
      )}
      {config && (
        <div className="overlay">
          <section className="dialog">
            <button className="close" onClick={() => setConfig(false)}>
              <X />
            </button>
            <h2>工作室设置</h2>
            <p>选择默认模型和图片尺寸，密钥保存在系统加密存储中。</p>
            <label>默认图片模型<select value={settings.defaultModel || "codex"} onChange={e => setSettings({...settings, defaultModel: e.target.value})}>{modelChoices.map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select></label>
            <label>豆包图片尺寸<select value={settings.size || "2K"} onChange={e => setSettings({...settings, size: e.target.value})}>{["1K", "1.5K", "2K"].map(size => <option key={size}>{size}</option>)}</select></label>
            <label>方舟 API Key<input type="password" autoComplete="off" value={apiKey} placeholder={settings.hasApiKey ? "已加密保存，留空保留" : settings.hasEnvApiKey ? "已检测到 ARK_API_KEY，留空使用" : "输入方舟 API Key"} onChange={e => setApiKey(e.target.value)} /></label>
            <label>Flash 模型 ID / 接入点（可选）<input value={settings.flashModel || ""} placeholder="doubao-seedream-5-0-flash-260915" onChange={e => setSettings({...settings, flashModel: e.target.value})} /></label>
            <label>Pro 模型 ID / 接入点（可选）<input value={settings.proModel || ""} placeholder="doubao-seedream-5-0-pro-260628" onChange={e => setSettings({...settings, proModel: e.target.value})} /></label>
            <div className="row"><button className="primary" disabled={busy} onClick={() => execute(async () => { setBusy(true); try { const next = await window.studio.call("save-settings", {...settings, apiKey}); setSettings(next); setModelKey(next.defaultModel); setApiKey(""); } finally { setBusy(false); } })}>保存模型设置</button><button className="secondary" disabled={!settings.hasApiKey || busy} onClick={() => execute(async () => {setSettings(await window.studio.call("save-settings", {...settings, clearApiKey: true})); setApiKey("");})}>删除已保存密钥</button></div>
            <div className="hint">豆包由方舟独立计费，按图片清单逐张请求。失败不会自动重试，取消会保留已生成素材。重试沿用该任务的模型与尺寸。</div>
            <label>
              角色保存目录
              <div className="path">{settings.root || "尚未选择"}</div>
            </label>
            <button className="secondary" onClick={() => folder()}>
              <Folder size={16} />
              选择文件夹
            </button>
            <label>
              Codex 可执行文件
              <div className="path">
                {settings.codexPath || "自动查找 PATH / Homebrew / nvm / Volta"}
              </div>
            </label>
            <div className="row">
              <button
                className="secondary"
                onClick={() =>
                  execute(async () =>
                    setSettings(await window.studio.call("choose-codex")),
                  )
                }
              >
                选择 Codex
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  execute(async () => {
                    setBusy(true);
                    try {
                      setDiagnostic(await window.studio.call("diagnose"));
                    } finally {
                      setBusy(false);
                    }
                  })
                }
              >
                {busy ? (
                  <Loader size={15} className="spin" />
                ) : (
                  <Terminal size={15} />
                )}
                检查连接
              </button>
            </div>
            {diagnostic && (
              <pre className="diagnostic">
                {diagnostic.path}
                {"\n"}
                {diagnostic.version}
                {"\n"}
                {diagnostic.login}
                {"\n\n"}
                {diagnostic.note}
              </pre>
            )}
            {error && <div className="error">{error}</div>}
          </section>
        </div>
      )}
      {selected && (
        <div className="overlay detail-overlay">
          <section className="detail">
            <div className="detail-head">
              <div>
                <div className="eyebrow">CHARACTER FILE</div>
                <h2>{selected.name}</h2>
                <p>{selected.generation?.label || "Codex imagegen"}{selected.generation?.size && ` · ${selected.generation.size}`}</p>
              </div>
              <div className="row">
                <button className="secondary" disabled={selected.status === "generating"} onClick={() => deleteCharacter(selected)}><Trash2 size={15} />删除角色</button>
                <button
                  className="secondary"
                  onClick={() =>
                    execute(() =>
                      window.studio.call("open-folder", selected.id),
                    )
                  }
                >
                  <Folder size={15} />
                  打开文件夹
                </button>
                <button
                  className="close-inline"
                  onClick={() => setSelected(null)}
                >
                  <X />
                </button>
              </div>
            </div>
            <div className="tabs">
              {[
                ["images", "角色素材"],
                ["markdown", "角色设定"],
                ["performances", "参演记录"],
                ["logs", "创作日志"],
              ].map(([id, label]) => (
                <button
                  className={tab === id ? "selected" : ""}
                  onClick={() => setTab(id)}
                  key={id}
                >
                  {label}
                </button>
              ))}
              <span className="detail-status">{status(selected.status)}</span>
            </div>
            <div className="detail-scroll">
              {tab === "images" &&
                (detail?.images.length ? (
                  <div className="image-list">
                    {detail.images.map((im: any) => (
                      <figure key={im.name}>
                        <button className="image-preview-trigger" aria-label={`放大 ${im.name}`} onClick={() => setPreview({url: im.url, name: im.name})}><img src={im.url} alt={im.name} /></button>
                        <figcaption>{im.name}</figcaption>
                      </figure>
                    ))}
                  </div>
                ) : (
                  <div className="detail-empty">
                    {selected.status === "generating" ? (
                      <Loader className="spin" size={30} />
                    ) : (
                      <ImageIcon size={30} />
                    )}
                    <h3>
                      {selected.status === "generating"
                        ? "模型正在创作"
                        : "还没有生成图片"}
                    </h3>
                    <p>可在创作日志中查看真实执行进展。</p>
                  </div>
                ))}
              {tab === "markdown" &&
                (detail?.markdown ? (
                  <article>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        a: ({ children }) => <span>{children}</span>,
                        img: () => null,
                      }}
                    >
                      {detail.markdown}
                    </ReactMarkdown>
                  </article>
                ) : (
                  <div className="detail-empty">角色设定尚未生成</div>
                ))}
              {tab === "performances" && (
                detail?.performances?.length ? (
                  <div>
                    {detail.performances.map((performance: any) => (
                      <section key={performance.id}>
                        <article>
                          <h3>{performance.title}</h3>
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ children }) => <span>{children}</span>, img: () => null }}>
                            {performance.markdown || performance.description || "暂无独立设定"}
                          </ReactMarkdown>
                        </article>
                        <div className="image-list">
                          {performance.images.map((im: any) => (
                            <figure key={im.name}>
                              <button className="image-preview-trigger" aria-label={`放大 ${performance.title}`} onClick={() => setPreview({url: im.url, name: `${performance.title} · ${im.name}`})}><img src={im.url} alt={performance.title} /></button>
                              <figcaption>{im.name}</figcaption>
                            </figure>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : <div className="detail-empty">暂无参演记录</div>
              )}
              {tab === "logs" && (
                <pre className="logs">
                  {selected.logs.join("\n\n") || "正在启动生成任务…"}
                </pre>
              )}
            </div>
            <div className="detail-bottom">
              <span>{selected.dir}</span>
              {selected.status === "generating" ? (
                <button
                  className="secondary"
                  onClick={() =>
                    execute(() => window.studio.call("cancel", selected.id))
                  }
                >
                  取消生成
                </button>
              ) : (
                selected.status !== "completed" && (
                  <button
                    className="primary"
                    onClick={() =>
                      execute(async () => {
                        const j = await window.studio.call(
                          "retry",
                          selected.id,
                        );
                        setItems((old) => [
                          j,
                          ...old.filter((x) => x.id !== j.id),
                        ]);
                        setSelected(j);
                      })
                    }
                  >
                    <RefreshCw size={15} />
                    新建副本重试
                  </button>
                )
              )}
            </div>
            {error && <div className="error">{error}</div>}
          </section>
        </div>
      )}
      {preview && <ImagePreview key={preview.url} image={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
