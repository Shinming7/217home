import { useEffect, useRef, useState } from "react";
import { api, errorText } from "../../net/api";
import type { SelfMember } from "../../net/types";
import { getCharacterSprite } from "../../game/character";
import { randomLook, makeLook } from "../../game/looks";
import { PixelPortrait } from "../../ui/PixelPortrait";
import type { CharacterLook, Dir } from "../../game/types";
import { preparePhoto, type PreparedPhoto } from "../../pixel/photo";

type CreatorProps = {
  self: SelfMember;
  mode: "create" | "edit";
  onSaved: (member: SelfMember) => void;
  onCancel?: () => void;
};

const HAIR_OPTIONS = ["#181425", "#3a4466", "#68386c", "#b55088", "#be4a2f", "#f77622", "#fee761", "#ead4aa", "#8b9bb4", "#2ce8f5"];
const SHIRT_OPTIONS = ["#0099db", "#124e89", "#3e8948", "#265c42", "#f6757a", "#a22633", "#feae34", "#b55088", "#8b9bb4", "#ead4aa"];
const PANTS_OPTIONS = ["#3a4466", "#181425", "#5a6988", "#124e89", "#b86f50", "#68386c", "#8b9bb4", "#193c3e", "#be4a2f", "#c0cbdc"];
const ACCENT_OPTIONS = ["#fee761", "#2ce8f5", "#f6757a", "#63c74d", "#feae34", "#ffffff", "#b55088", "#f77622", "#ead4aa", "#0099db"];
const SKIN_OPTIONS = ["#f2c9a5", "#e8b796", "#d9a066", "#c28569", "#9c6b4f", "#70472f"];

function SpriteRow({ look }: { look: CharacterLook }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 4 * 48, 72);
    const dirs: Dir[] = ["down", "up", "left", "right"];
    dirs.forEach((dir, index) => {
      const sprite = getCharacterSprite(look, dir, "idle");
      ctx.drawImage(sprite, 0, 0, 16, 24, index * 48, 0, 48, 72);
    });
  }, [look]);

  return <canvas ref={ref} width={192} height={72} aria-label="四个方向的角色预览" />;
}

function Swatches({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: string[];
  value: string;
  onPick: (color: string) => void;
}) {
  return (
    <div className="swatch-row">
      <span className="swatch-label">{label}</span>
      <div className="swatch-list">
        {options.map((color) => (
          <button
            key={color}
            type="button"
            className={color.toLowerCase() === value.toLowerCase() ? "swatch on" : "swatch"}
            style={{ background: color }}
            aria-label={`${label} ${color}`}
            aria-pressed={color.toLowerCase() === value.toLowerCase()}
            onClick={() => onPick(color)}
          />
        ))}
      </div>
    </div>
  );
}

export function Creator({ self, mode, onSaved, onCancel }: CreatorProps) {
  const [nickname, setNickname] = useState(self.nickname);
  const [intro, setIntro] = useState(self.intro);
  const [tagsText, setTagsText] = useState(self.tags.join("、"));
  const [look, setLook] = useState<CharacterLook>(self.look ?? randomLook());
  const [pixel, setPixel] = useState<string | null>(self.pixel);
  const [swatches, setSwatches] = useState<string[]>([]);
  const [prepared, setPrepared] = useState<PreparedPhoto | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const patchLook = (key: "hair" | "shirt" | "pants" | "accent" | "skin", color: string) => {
    setLook((current) => {
      const next = { ...current };
      if (key === "hair") {
        next.hair = color;
        next.hairDark = makeLook(color, current.shirt, current.pants, current.accent, current.skin).hairDark;
      } else if (key === "shirt") {
        next.shirt = color;
        next.shirtDark = makeLook(current.hair, color, current.pants, current.accent, current.skin).shirtDark;
      } else if (key === "pants") {
        next.pants = color;
        next.pantsDark = makeLook(current.hair, current.shirt, color, current.accent, current.skin).pantsDark;
      } else if (key === "skin") {
        next.skin = color;
        next.skinDark = makeLook(current.hair, current.shirt, current.pants, current.accent, color).skinDark;
      } else {
        next.accent = color;
      }
      return next;
    });
  };

  const handleFile = async (file: File | null | undefined) => {
    if (!file || photoBusy) return;
    setPhotoBusy(true);
    setError("");
    try {
      const result = await preparePhoto(file);
      setPrepared(result);
      setPixel(result.pixelDataUrl);
      setLook(result.look);
      setSwatches(result.swatches);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setPhotoBusy(false);
    }
  };

  const save = async () => {
    if (busy) return;
    const name = nickname.trim();
    if (!name) {
      setError("名字不能空着");
      return;
    }
    const tags = Array.from(new Set(tagsText.split(/[,，、\s]+/).map((tag) => tag.trim()).filter(Boolean))).slice(0, 3);
    setBusy(true);
    setError("");
    try {
      const result = await api.updateMe({
        nickname: name,
        intro: intro.trim(),
        tags,
        avatar: { look, pixel },
        cosmetics: { hair: look.hair, shirt: look.shirt, pants: look.pants, skin: look.skin, accent: look.accent },
      });
      onSaved(result.member);
    } catch (caught) {
      setError(errorText(caught));
      setBusy(false);
    }
  };

  return (
    <div className="creator-backdrop">
      <section className="creator" role="dialog" aria-modal="true" aria-label={mode === "create" ? "创建你的像素小人" : "编辑你的档案"}>
        <header className="creator-head">
          <div>
            <span className="profile-kicker">{mode === "create" ? "MOVE-IN DAY · 217" : "YOUR FILE · 217"}</span>
            <h2>{mode === "create" ? "挑一张照片，变成小人" : "改改你的样子"}</h2>
          </div>
          {mode === "edit" && onCancel ? (
            <button className="icon-btn" onClick={onCancel} aria-label="关闭">
              ×
            </button>
          ) : null}
        </header>

        <div className="creator-grid">
          <div className="creator-left">
            <div
              className={dragging ? "dropzone dragging" : "dropzone"}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                void handleFile(event.dataTransfer.files?.[0]);
              }}
              onClick={() => fileRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") fileRef.current?.click();
              }}
            >
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                hidden
                onChange={(event) => void handleFile(event.target.files?.[0])}
              />
              <div className="preview-frame">
                {pixel ? (
                  <img src={pixel} alt="像素头像预览" />
                ) : (
                  <PixelPortrait look={look} size={128} label="当前像素头像" />
                )}
              </div>
              <p className="dropzone-title">{photoBusy ? "正在把照片变成像素…" : pixel ? "再换一张照片" : "点这里上传照片"}</p>
              <p className="dropzone-hint">也可以把照片拖进来 · 会裁成正方形</p>
            </div>

            {swatches.length ? (
              <div className="palette-note">
                <span>照片里提取的颜色</span>
                <div className="swatch-list">
                  {swatches.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className="swatch"
                      style={{ background: color }}
                      aria-label={`从照片取色 ${color}`}
                      onClick={() => patchLook("accent", color)}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            <div className="sprite-strip">
              <SpriteRow look={look} />
              <div>
                <button
                  type="button"
                  className="pixel-btn"
                  onClick={() => {
                    setLook(randomLook());
                    setPixel(pixel);
                    setPrepared(null);
                  }}
                >
                  换个随机配色
                </button>
                <p className="fineprint">照片只用于生成立绘，像素小人会跟着你在屋里走动。</p>
              </div>
            </div>
          </div>

          <div className="creator-right">
            <label className="field">
              <span>名字</span>
              <input className="text-input" value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={12} />
            </label>
            <label className="field">
              <span>介绍 <em>最多 120 字</em></span>
              <textarea
                className="text-input textarea"
                value={intro}
                maxLength={120}
                rows={3}
                placeholder="比如：住进 217 的第 3 天，喜欢在窗边发呆。"
                onChange={(event) => setIntro(event.target.value)}
              />
            </label>
            <label className="field">
              <span>标签 <em>最多 3 个，用顿号分开</em></span>
              <input
                className="text-input"
                value={tagsText}
                onChange={(event) => setTagsText(event.target.value)}
                placeholder="夜猫子、咖啡续命、挂照片担当"
              />
            </label>

            <div className="color-sets">
              <Swatches label="头发" options={HAIR_OPTIONS} value={look.hair} onPick={(color) => patchLook("hair", color)} />
              <Swatches label="上衣" options={SHIRT_OPTIONS} value={look.shirt} onPick={(color) => patchLook("shirt", color)} />
              <Swatches label="下装" options={PANTS_OPTIONS} value={look.pants} onPick={(color) => patchLook("pants", color)} />
              <Swatches label="点缀" options={ACCENT_OPTIONS} value={look.accent} onPick={(color) => patchLook("accent", color)} />
              <Swatches label="肤色" options={SKIN_OPTIONS} value={look.skin} onPick={(color) => patchLook("skin", color)} />
            </div>

            {error ? <p className="form-error" role="alert">{error}</p> : null}

            <div className="creator-actions">
              <button className="pixel-btn primary" onClick={() => void save()} disabled={busy || photoBusy}>
                {busy ? "正在安顿…" : mode === "create" ? "保存，住进 217" : "保存修改"}
              </button>
              {mode === "edit" && onCancel ? (
                <button className="pixel-btn" onClick={onCancel} disabled={busy}>
                  返回小屋
                </button>
              ) : null}
            </div>
            <p className="fineprint">
              头像只保存 64×64 的像素版本；照片原图只有在你主动传到照片墙时才会保存，且只对住户可见。
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
