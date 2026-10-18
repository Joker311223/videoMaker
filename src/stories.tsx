import { useEffect, useRef, useState } from "react";
import {
  Plus,
  Search,
  ArrowLeft,
  Save,
  Trash2,
  ImagePlus,
  BookOpen,
  Users,
  X,
} from "lucide-react";
import { ImagePreview, type PreviewImage } from "./image-preview";
import type { Story, StoryChapter, StoryShot } from "./story-types";
import "./stories.css";
type Props = {
  characters: { id: string; name: string; assets?: { file: string }[] }[];
  root?: string;
  onChooseFolder: () => void;
  onCountChange: (count: number) => void;
  onDirtyChange?: (dirty: boolean) => void;
};
const imageUrl = (story: Story, file: string) =>
  `story://${story.id}/${file.split("/").map(encodeURIComponent).join("/")}`;
export function StoryWorkspace({
  characters,
  root,
  onChooseFolder,
  onCountChange,
  onDirtyChange,
}: Props) {
  const [items, setItems] = useState<Story[]>([]),
    [draft, setDraft] = useState<Story | null>(null),
    [baseline, setBaseline] = useState(""),
    [query, setQuery] = useState(""),
    [chapterId, setChapterId] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [preview, setPreview] = useState<PreviewImage | null>(null),
    [confirmBack, setConfirmBack] = useState(false);
  const mountedRoot = useRef(root);
  const dirty = !!draft && JSON.stringify(draft) !== baseline;
  useEffect(() => {
    onDirtyChange?.(dirty);
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    let active = true;
    mountedRoot.current = root;
    setDraft(null);
    setBaseline("");
    setError("");
    setItems([]);
    onCountChange(0);
    if (root) {
      setBusy(true);
      window.studio
        .call("story-list")
        .then((stories: Story[]) => {
          if (active) {
            setItems(stories);
            onCountChange(stories.length);
          }
        })
        .catch((e) => {
          if (active) setError(String(e.message || e));
        })
        .finally(() => {
          if (active) setBusy(false);
        });
    }
    return () => {
      active = false;
    };
  }, [root]);
  function update(next: Story) {
    setDraft(next);
    setError("");
  }
  function upsert(story: Story) {
    const next = items.some((s) => s.id === story.id)
      ? items.map((s) => (s.id === story.id ? story : s))
      : [story, ...items];
    setItems(next);
    onCountChange(next.length);
  }
  async function saveCurrent() {
    if (!draft || !draft.title.trim()) throw new Error("请先填写故事名称");
    const saved: Story = await window.studio.call(
      "story-save",
      draft.id
        ? draft
        : {
            title: draft.title,
            description: draft.description,
            characterIds: draft.characterIds,
            chapters: draft.chapters,
          },
    );
    if (mountedRoot.current !== root)
      throw new Error("素材目录已改变，请重新打开故事");
    setDraft(saved);
    setBaseline(JSON.stringify(saved));
    upsert(saved);
    return saved;
  }
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  function open(story: Story) {
    setDraft(structuredClone(story));
    setBaseline(JSON.stringify(story));
    setChapterId(story.chapters[0]?.id || "");
    setError("");
  }
  function create() {
    const now = new Date().toISOString();
    setDraft({
      id: "",
      title: "",
      description: "",
      characterIds: [],
      chapters: [],
      createdAt: now,
      updatedAt: now,
      revision: 0,
    });
    setBaseline("");
    setChapterId("");
    setError("");
  }
  function back() {
    if (dirty) setConfirmBack(true);
    else setDraft(null);
  }
  function patchChapter(id: string, patch: Partial<StoryChapter>) {
    if (draft)
      update({
        ...draft,
        chapters: draft.chapters.map((c) =>
          c.id === id ? { ...c, ...patch } : c,
        ),
      });
  }
  function patchShot(
    chapter: StoryChapter,
    id: string,
    patch: Partial<StoryShot>,
  ) {
    patchChapter(chapter.id, {
      shots: chapter.shots.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  }
  const chapter = draft?.chapters.find((c) => c.id === chapterId);
  return (
    <section className="stories-workspace" aria-label="故事工作区">
      {!root ? (
        <div className="story-empty">
          <BookOpen size={36} />
          <h2>让故事开始</h2>
          <p>选择素材文件夹，故事与角色会保存在同一个素材库中。</p>
          <button className="primary" onClick={onChooseFolder}>
            选择素材文件夹
          </button>
        </div>
      ) : (
        <>
          {error && (
            <div className="story-error" role="alert">
              {error}
              <button
                aria-label="关闭故事错误提示"
                onClick={() => setError("")}
              >
                <X size={15} />
              </button>
            </div>
          )}
          {!draft ? (
            <>
              <div className="story-heading">
                <div>
                  <span className="story-eyebrow">STORY LIBRARY</span>
                  <h1>故事</h1>
                  <p>从一个想法，到每一帧画面。</p>
                </div>
                <button className="primary" disabled={busy} onClick={create}>
                  <Plus size={17} />
                  新建故事
                </button>
              </div>
              <div className="story-search">
                <Search size={17} />
                <input
                  aria-label="搜索故事"
                  placeholder="搜索故事名称或介绍…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <span>{items.length} 个故事</span>
              </div>
              {!items.length ? (
                <div className="story-empty">
                  <BookOpen size={34} />
                  <h2>{busy ? "正在读取故事…" : "还没有故事"}</h2>
                  <p>新建故事，整理介绍、章节、分镜和出演角色。</p>
                  {!busy && (
                    <button onClick={create}>
                      <Plus size={16} />
                      创建第一个故事
                    </button>
                  )}
                </div>
              ) : (
                <div className="story-grid">
                  {items
                    .filter((s) =>
                      `${s.title} ${s.description}`
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                    )
                    .map((s) => (
                      <button
                        className="story-card"
                        key={s.id}
                        onClick={() => open(s)}
                        disabled={busy}
                      >
                        <div className="story-card-icon">
                          <BookOpen size={25} />
                        </div>
                        <h2>{s.title}</h2>
                        <p>{s.description || "尚未添加故事介绍"}</p>
                        <footer>
                          <span>{s.chapters.length} 个章节</span>
                          <span>{s.characterIds.length} 位角色</span>
                        </footer>
                      </button>
                    ))}
                  {query &&
                    !items.some((s) =>
                      `${s.title} ${s.description}`
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                    ) && <p>没有找到匹配的故事。</p>}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="story-editor-bar">
                <button disabled={busy} onClick={back}>
                  <ArrowLeft size={16} />
                  全部故事
                </button>
                <span className={dirty ? "story-unsaved" : ""}>
                  {busy
                    ? "正在处理…"
                    : dirty
                      ? "有未保存的修改"
                      : "已保存到本地"}
                </span>
                <button
                  className="story-danger"
                  disabled={busy}
                  aria-label="删除故事"
                  onClick={() =>
                    run(async () => {
                      if (!draft.id) {
                        setConfirmBack(true);
                        return;
                      }
                      if (await window.studio.call("story-delete", draft.id)) {
                        const next = items.filter((s) => s.id !== draft.id);
                        setItems(next);
                        onCountChange(next.length);
                        setDraft(null);
                      }
                    })
                  }
                >
                  <Trash2 size={16} />
                </button>
                <button
                  className="primary"
                  disabled={busy || !draft.title.trim()}
                  onClick={() =>
                    run(async () => {
                      await saveCurrent();
                    })
                  }
                >
                  <Save size={16} />
                  保存故事
                </button>
              </div>
              <fieldset disabled={busy} className="story-editor-fields">
                <div className="story-overview">
                  <div className="story-intro">
                    <label>
                      故事名称
                      <input
                        className="story-title-input"
                        aria-label="故事名称"
                        maxLength={200}
                        placeholder="为这个故事起个名字"
                        value={draft.title}
                        onChange={(e) =>
                          update({ ...draft, title: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      故事介绍
                      <textarea
                        aria-label="故事介绍"
                        maxLength={20000}
                        placeholder="故事发生在哪里？主角想要什么，又会遇见怎样的变化？"
                        rows={4}
                        value={draft.description}
                        onChange={(e) =>
                          update({ ...draft, description: e.target.value })
                        }
                      />
                    </label>
                  </div>
                  <div className="story-cast">
                    <h3>
                      <Users size={17} />
                      出演角色 <span>{draft.characterIds.length}</span>
                    </h3>
                    <div className="story-cast-list">
                      {characters.map((c) => (
                        <label
                          key={c.id}
                          className={
                            draft.characterIds.includes(c.id)
                              ? "is-selected"
                              : ""
                          }
                        >
                          <input
                            type="checkbox"
                            aria-label={`绑定角色 ${c.name}`}
                            checked={draft.characterIds.includes(c.id)}
                            onChange={(e) =>
                              update({
                                ...draft,
                                characterIds: e.target.checked
                                  ? [...draft.characterIds, c.id]
                                  : draft.characterIds.filter(
                                      (id) => id !== c.id,
                                    ),
                              })
                            }
                          />
                          {c.assets?.[0] && (
                            <img
                              src={`character://${c.id}/${encodeURIComponent(c.assets[0].file)}`}
                              alt=""
                            />
                          )}
                          <span>{c.name}</span>
                        </label>
                      ))}
                      {!characters.length && <p>角色库中还没有角色。</p>}
                      {draft.characterIds
                        .filter((id) => !characters.some((c) => c.id === id))
                        .map((id) => (
                          <label key={id}>
                            <input
                              type="checkbox"
                              checked
                              aria-label="移除已不在角色库的角色"
                              onChange={() =>
                                update({
                                  ...draft,
                                  characterIds: draft.characterIds.filter(
                                    (c) => c !== id,
                                  ),
                                })
                              }
                            />
                            <span>角色已不在当前角色库</span>
                          </label>
                        ))}
                    </div>
                  </div>
                </div>
                <div className="story-chapters">
                  <aside>
                    <div className="story-section-heading">
                      <h3>故事章节</h3>
                      <button
                        aria-label="新增章节"
                        onClick={() => {
                          const c = {
                            id: crypto.randomUUID(),
                            title: `第 ${draft.chapters.length + 1} 章`,
                            summary: "",
                            shots: [],
                          };
                          update({
                            ...draft,
                            chapters: [...draft.chapters, c],
                          });
                          setChapterId(c.id);
                        }}
                      >
                        <Plus size={17} />
                      </button>
                    </div>
                    {draft.chapters.map((c, i) => (
                      <button
                        className={`story-chapter-tab ${chapterId === c.id ? "active" : ""}`}
                        key={c.id}
                        onClick={() => setChapterId(c.id)}
                      >
                        <span>{String(i + 1).padStart(2, "0")}</span>
                        <div>
                          {c.title || "未命名章节"}
                          <small>{c.shots.length} 个分镜</small>
                        </div>
                      </button>
                    ))}
                    {!draft.chapters.length && (
                      <p className="story-muted">添加章节，展开你的故事。</p>
                    )}
                  </aside>
                  <div className="story-chapter-content">
                    {!chapter ? (
                      <div className="story-empty">
                        <BookOpen size={28} />
                        <p>点击「＋」添加第一个章节</p>
                      </div>
                    ) : (
                      <>
                        <div className="story-section-heading">
                          <h3>章节内容</h3>
                          <button
                            className="story-danger"
                            aria-label="删除当前章节"
                            onClick={() => {
                              if (
                                !window.confirm(
                                  `删除「${chapter.title || "未命名章节"}」及其分镜？保存故事后生效。`,
                                )
                              )
                                return;
                              const rest = draft.chapters.filter(
                                (c) => c.id !== chapter.id,
                              );
                              update({ ...draft, chapters: rest });
                              setChapterId(rest[0]?.id || "");
                            }}
                          >
                            <Trash2 size={15} />
                            删除章节
                          </button>
                        </div>
                        <label>
                          章节名称
                          <input
                            aria-label="章节名称"
                            maxLength={200}
                            value={chapter.title}
                            onChange={(e) =>
                              patchChapter(chapter.id, {
                                title: e.target.value,
                              })
                            }
                            placeholder="章节名称"
                          />
                        </label>
                        <label>
                          章节内容
                          <textarea
                            rows={4}
                            aria-label="章节内容"
                            maxLength={20000}
                            value={chapter.summary}
                            onChange={(e) =>
                              patchChapter(chapter.id, {
                                summary: e.target.value,
                              })
                            }
                            placeholder="记录这一章的情节、对话或剧情梗概…"
                          />
                        </label>
                        <div className="story-section-heading story-shots-heading">
                          <h3>分镜与场景图</h3>
                          <button
                            onClick={() =>
                              patchChapter(chapter.id, {
                                shots: [
                                  ...chapter.shots,
                                  {
                                    id: crypto.randomUUID(),
                                    title: `分镜 ${chapter.shots.length + 1}`,
                                    description: "",
                                    images: [],
                                  },
                                ],
                              })
                            }
                          >
                            <Plus size={16} />
                            添加分镜
                          </button>
                        </div>
                        {!chapter.shots.length && (
                          <p className="story-muted">
                            添加分镜，记录镜头说明并放入场景参考图。
                          </p>
                        )}
                        {chapter.shots.map((shot, i) => (
                          <article className="story-shot" key={shot.id}>
                            <div className="story-shot-header">
                              <span>{String(i + 1).padStart(2, "0")}</span>
                              <input
                                aria-label={`分镜 ${i + 1} 名称`}
                                maxLength={200}
                                value={shot.title}
                                placeholder="分镜名称"
                                onChange={(e) =>
                                  patchShot(chapter, shot.id, {
                                    title: e.target.value,
                                  })
                                }
                              />
                              <button
                                className="story-danger"
                                aria-label={`删除分镜 ${i + 1}`}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      "删除这个分镜及其场景图？保存故事后生效。",
                                    )
                                  )
                                    patchChapter(chapter.id, {
                                      shots: chapter.shots.filter(
                                        (s) => s.id !== shot.id,
                                      ),
                                    });
                                }}
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                            <textarea
                              rows={3}
                              aria-label={`分镜 ${i + 1} 说明`}
                              placeholder="景别、机位、角色动作、对白、光线与场景说明…"
                              value={shot.description}
                              onChange={(e) =>
                                patchShot(chapter, shot.id, {
                                  description: e.target.value,
                                })
                              }
                            />
                            <div className="story-shot-images">
                              {shot.images.map((img) => (
                                <div className="story-scene" key={img.id}>
                                  <button
                                    className="story-scene-preview"
                                    aria-label={`放大场景图 ${img.name}`}
                                    onClick={() =>
                                      setPreview({
                                        url: imageUrl(draft, img.file),
                                        name: img.name,
                                      })
                                    }
                                  >
                                    <img
                                      src={imageUrl(draft, img.file)}
                                      alt={img.name}
                                    />
                                  </button>
                                  <button
                                    className="story-scene-delete"
                                    aria-label={`移除场景图 ${img.name}`}
                                    onClick={() =>
                                      patchShot(chapter, shot.id, {
                                        images: shot.images.filter(
                                          (x) => x.id !== img.id,
                                        ),
                                      })
                                    }
                                  >
                                    <X size={14} />
                                  </button>
                                  <span>{img.name}</span>
                                </div>
                              ))}
                              <button
                                className="story-image-add"
                                onClick={() =>
                                  run(async () => {
                                    const saved = await saveCurrent();
                                    const next: Story =
                                      await window.studio.call(
                                        "story-import-images",
                                        saved.id,
                                        chapter.id,
                                        shot.id,
                                      );
                                    if (next) {
                                      setDraft(next);
                                      setBaseline(JSON.stringify(next));
                                      upsert(next);
                                    }
                                  })
                                }
                              >
                                <ImagePlus size={23} />
                                <span>添加场景图</span>
                                <small>支持多选 · 自动保存</small>
                              </button>
                            </div>
                          </article>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              </fieldset>
            </>
          )}
        </>
      )}
      {confirmBack && (
        <div className="story-confirm-backdrop">
          <div
            className="story-confirm"
            role="dialog"
            aria-modal="true"
            aria-label="保存故事修改"
          >
            <h3>离开前保存修改？</h3>
            <p>当前故事还有未保存的内容。</p>
            <div>
              <button disabled={busy} onClick={() => setConfirmBack(false)}>
                继续编辑
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  setConfirmBack(false);
                  setDraft(null);
                }}
              >
                放弃修改
              </button>
              <button
                className="primary"
                disabled={busy || !draft?.title.trim()}
                onClick={() =>
                  run(async () => {
                    await saveCurrent();
                    setConfirmBack(false);
                    setDraft(null);
                  })
                }
              >
                保存并返回
              </button>
            </div>
            {error && <p role="alert">{error}</p>}
          </div>
        </div>
      )}
      {preview && (
        <ImagePreview image={preview} onClose={() => setPreview(null)} />
      )}
    </section>
  );
}
