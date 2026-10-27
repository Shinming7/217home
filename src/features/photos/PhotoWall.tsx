import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorText } from "../../net/api";
import type { PhotoItem } from "../../net/types";
import { Panel } from "../../ui/Panel";
import { preparePhoto, type PreparedPhoto } from "../../pixel/photo";

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
    setPreparing(true);
    setError("");
    try {
      const prepared = await preparePhoto(file);
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

  return (
    <Panel kicker="PHOTO WALL · 217" title="照片墙" wide onClose={onClose}>
      <div className="panel-toolbar">
        <div>
          <p className="panel-note">原图只有屋里的住户能看到，像素版会挂在软木板上。</p>
        </div>
        <button className="pixel-btn primary" onClick={() => fileRef.current?.click()} disabled={preparing || uploading}>
          {preparing ? "正在裁成像素…" : "挂一张新照片"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          hidden
          onChange={(event) => void pickFile(event.target.files?.[0])}
        />
      </div>

      {pending ? (
        <div className="upload-sheet">
          <div className="upload-preview">
            <img src={pending.pixelDataUrl} alt="像素版预览" />
            <img src={pending.origDataUrl} alt="原图预览" />
          </div>
          <div className="upload-fields">
            <label className="field">
              <span>配一句话 <em>可不填</em></span>
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

      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {loading ? <p className="panel-note">正在翻照片……</p> : null}

      {!loading && photos.length === 0 ? (
        <div className="empty-state">
          <p>墙上还是空的。</p>
          <p className="fineprint">上传第一张照片，把它变成像素小画挂在这里。</p>
        </div>
      ) : (
        <div className="photo-grid">
          {photos.map((photo) => (
            <figure key={photo.id} className="photo-card">
              <button className="photo-thumb" onClick={() => void openView(photo)} aria-label={`查看${photo.caption || "照片"}原图`}>
                {urls[photo.id] ? (
                  <img src={urls[photo.id]} alt={photo.caption || `${photo.author.nickname}的照片`} loading="lazy" />
                ) : (
                  <span className="photo-placeholder">载入中</span>
                )}
              </button>
              <figcaption>
                <span className="photo-caption">{photo.caption || "没有配文"}</span>
                <span className="photo-meta">
                  {photo.author.nickname} · {dateLabel(photo.createdAt)}
                </span>
              </figcaption>
              {isOwner ? (
                <button
                  className={confirmId === photo.id ? "card-delete armed" : "card-delete"}
                  onClick={() => askDelete(photo.id)}
                  aria-label="删除照片"
                >
                  {confirmId === photo.id ? "再点一次" : "×"}
                </button>
              ) : null}
            </figure>
          ))}
        </div>
      )}

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
              <p>{view.photo.caption || "没有配文"}</p>
              <span>
                {view.photo.author.nickname} · {dateLabel(view.photo.createdAt)}
              </span>
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
