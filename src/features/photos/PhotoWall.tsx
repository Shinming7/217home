import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { api, errorText } from "../../net/api";
import type { PhotoItem } from "../../net/types";
import { Panel } from "../../ui/Panel";
import { preparePhoto, type PreparedPhoto } from "../../pixel/photo";

const WALL_LIMIT = 30;
const PHOTO_OPTIONS = { maxEdge: 1920, targetBytes: 1_900_000, limitBytes: 2 * 1024 * 1024 };

const urlCache = new Map<string, { url: string; expiresAt: number }>();

async function signedUrl(id: string, kind: "pixel" | "orig"): Promise<string> {
  const key = `${kind}:${id}`;
  const cached = urlCache.get(key);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.url;
  const result = await api.photoUrl(id, kind);
  urlCache.set(key, { url: result.url, expiresAt: Date.now() + result.expiresIn * 1000 });
  return result.url;
}

type PhotoWallProps = {
  isOwner: boolean;
  onClose: () => void;
  onChanged: () => void;
};

function dateLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function PhotoWall({ isOwner, onClose, onChanged }: PhotoWallProps) {
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<PreparedPhoto | null>(null);
  const [caption, setCaption] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [view, setView] = useState<{ photo: PhotoItem; url: string } | null>(null);
  const [viewBusy, setViewBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const fileRef = useRef<HTMLInputElement>(null);
  const confirmTimer = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.photos();
      setPhotos(list);
      setError("");
      const entries = await Promise.all(
        list.map(async (photo) => {
          try {
            return [photo.id, await signedUrl(photo.id, "pixel")] as const;
          } catch {
            return [photo.id, ""] as const;
          }
        }),
      );
      setUrls(Object.fromEntries(entries));
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => () => window.clearTimeout(confirmTimer.current), []);

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    if (photos.length >= WALL_LIMIT) {
      setError("这面墙最多挂 30 张照片，先取下一张吧");
      return;
    }
    setPreparing(true);
    setError("");
    try {
      const prepared = await preparePhoto(file, PHOTO_OPTIONS);
      setPending(prepared);
      setCaption("");
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setPreparing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const upload = async () => {
    if (!pending || uploading) return;
    setUploading(true);
    setError("");
    try {
      await api.uploadPhoto({
        orig: pending.origBase64,
        pixel: pending.pixelBase64,
        caption: caption.trim(),
      });
      setPending(null);
      setCaption("");
      await load();
      onChanged();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setUploading(false);
    }
  };

  const openView = async (photo: PhotoItem) => {
    if (viewBusy) return;
    setViewBusy(true);
    try {
      const url = await signedUrl(photo.id, "orig");
      setView({ photo, url });
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setViewBusy(false);
    }
  };

  const askDelete = (id: string) => {
    if (confirmId === id) {
      setConfirmId(null);
      window.clearTimeout(confirmTimer.current);
      void (async () => {
        try {
          await api.adminDeletePhoto(id);
          setPhotos((current) => current.filter((photo) => photo.id !== id));
          setView((current) => (current?.photo.id === id ? null : current));
          onChanged();
        } catch (caught) {
          setError(errorText(caught));
        }
      })();
      return;
    }
    setConfirmId(id);
    window.clearTimeout(confirmTimer.current);
    confirmTimer.current = window.setTimeout(() => setConfirmId(null), 4000);
  };

  const filled = photos.length >= WALL_LIMIT;

  return (
    <Panel kicker="PHOTO WALL · 217" title="照片墙" wide onClose={onClose}>
      <div className="pw-toolbar">
        <p className="panel-note">
          站在墙上的三幅画前，用第一人称看看大家挂上去的像素小画。点开任意一张，就能看到没打码的原图。
        </p>
        <div className="pw-toolbar-actions">
          <span className={filled ? "pw-count full" : "pw-count"}>
            {photos.length} / {WALL_LIMIT}
          </span>
          <button
            className="pixel-btn primary"
            onClick={() => fileRef.current?.click()}
            disabled={preparing || uploading || filled}
          >
            {preparing ? "正在裁成像素…" : filled ? "墙上已满 30 张" : "挂一张新照片"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            hidden
            onChange={(event) => void pickFile(event.target.files?.[0])}
          />
        </div>
      </div>
      <p className="fineprint pw-limit-note">单张照片上限 2MB，像素原图只有屋里的住户能看到。</p>

      {pending ? (
        <div className="upload-sheet">
          <div className="upload-preview">
            <img src={pending.pixelDataUrl} alt="像素版预览" />
            <img src={pending.origDataUrl} alt="原图预览" />
          </div>
          <div className="upload-fields">
            <label className="field">
              <span>
                配一句话 <em>可不填</em>
              </span>
              <input
                className="text-input"
                value={caption}
                maxLength={80}
                onChange={(event) => setCaption(event.target.value)}
                placeholder="这天发生了什么？"
              />
            </label>
            <div className="upload-actions">
              <button className="pixel-btn primary" onClick={() => void upload()} disabled={uploading}>
                {uploading ? "正在挂上去…" : "挂上墙"}
              </button>
              <button className="pixel-btn" onClick={() => setPending(null)} disabled={uploading}>
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div
        className="pw-scene"
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          const ny = ((event.clientY - rect.top) / rect.height) * 2 - 1;
          setTilt({ x: -ny * 1.5, y: nx * 2.2 });
        }}
        onPointerLeave={() => setTilt({ x: 0, y: 0 })}
      >
        <div className="pw-wall" style={{ transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` }}>
          <div className="pw-board">
            <span className="pw-board-tape" aria-hidden="true" />
            <div className="pw-grid">
              {Array.from({ length: WALL_LIMIT }, (_, index) => {
                const photo = photos[index];
                if (!photo) {
                  return <span key={`empty-${index}`} className="pw-slot empty" aria-hidden="true" />;
                }
                const label = photo.caption || `${photo.author.nickname}的照片`;
                return (
                  <button
                    key={photo.id}
                    className="pw-slot filled"
                    style={{ "--slot-tilt": `${((index * 7) % 5) - 2}deg` } as CSSProperties}
                    onClick={() => void openView(photo)}
                    title={`${label} · 点开看原图`}
                    aria-label={`查看${label}的原图`}
                  >
                    {urls[photo.id] ? <img src={urls[photo.id]} alt={label} loading="lazy" /> : <span className="pw-slot-load">···</span>}
                    <span className="pw-pin" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="pw-vignette" aria-hidden="true" />
        <div className="pw-hud">
          <span>{loading ? "正在走向照片墙…" : "第一人称 · 三幅画前"}</span>
          <span>
            {photos.length} / {WALL_LIMIT} 张
          </span>
        </div>
      </div>

      {!loading && photos.length === 0 ? (
        <p className="pw-empty-note">墙上还是空的，挂上第一张照片，让它变成像素小画。</p>
      ) : null}

      {view ? (
        <div
          className="lightbox"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setView(null);
          }}
        >
          <div className="lightbox-frame">
            <img src={view.url} alt={view.photo.caption || `${view.photo.author.nickname}的照片`} />
            <div className="lightbox-meta">
              <div>
                <p>{view.photo.caption || "没有配文"}</p>
                <span>
                  {view.photo.author.nickname} · {dateLabel(view.photo.createdAt)} · 原图
                </span>
              </div>
              {isOwner ? (
                <button
                  className={confirmId === view.photo.id ? "pixel-btn danger armed" : "pixel-btn"}
                  onClick={() => askDelete(view.photo.id)}
                >
                  {confirmId === view.photo.id ? "再点一次确认取下" : "取下这张"}
                </button>
              ) : null}
            </div>
            <button className="icon-btn lightbox-close" onClick={() => setView(null)} aria-label="关闭大图">
              ×
            </button>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
