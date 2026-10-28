import { useEffect, useRef, useState } from "react";
import { api, errorText } from "../../net/api";
import { loadStoredNickname, saveStoredNickname } from "../../net/session";
import type { JoinResult } from "../../net/types";
import { createRoomCanvas } from "../../game/roomArt";

type JoinScreenProps = {
  notice?: string;
  onJoined: (result: JoinResult) => void;
};

export function JoinScreen({ notice, onJoined }: JoinScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nickname, setNickname] = useState(() => loadStoredNickname());
  const [password, setPassword] = useState("");
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(createRoomCanvas(), 0, 0);
    ctx.fillStyle = "rgba(24,20,37,0.5)";
    ctx.fillRect(0, 0, 384, 256);
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const name = nickname.trim();
    if (!name) {
      setError("先留个名字吧，屋里的门牌要写上去");
      return;
    }
    if ([...name].length > 12) {
      setError("名字最多 12 个字");
      return;
    }
    if ([...password].length < 4) {
      setError("个人密码至少 4 位，下次回来还要靠它");
      return;
    }
    if (!passcode) {
      setError("请输入房间暗号");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api.join(name, passcode, password);
      saveStoredNickname(name);
      onJoined(result);
    } catch (caught) {
      setError(errorText(caught));
      setBusy(false);
    }
  };

  return (
    <div className="gate">
      <div className="gate-art" aria-hidden="true">
        <canvas ref={canvasRef} width={384} height={256} />
        <div className="gate-art-caption">217 号房 · 今晚也亮着灯</div>
      </div>

      <section className="gate-card">
        <div className="gate-brand">
          <span className="brand-badge">217</span>
          <div>
            <h1>217之家</h1>
            <p>A TINY PIXEL ROOM FOR US</p>
          </div>
        </div>
        <p className="gate-lede">
          一间只属于我们的小屋。写下名字和个人密码，下次回来还认得你；再输入房间暗号就能推门进屋。
        </p>

        {notice ? <p className="gate-notice">{notice}</p> : null}

        <form className="gate-form" onSubmit={submit}>
          <label className="field">
            <span>你的名字</span>
            <input
              className="text-input"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="朋友们怎么叫你？"
              maxLength={12}
              autoComplete="nickname"
            />
          </label>
          <label className="field">
            <span>个人密码</span>
            <input
              className="text-input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="至少 4 位，回来时还要用"
              maxLength={64}
              autoComplete="current-password"
            />
          </label>
          <label className="field">
            <span>房间暗号</span>
            <input
              className="text-input"
              type="password"
              value={passcode}
              onChange={(event) => setPasscode(event.target.value)}
              placeholder="屋里的暗号"
              autoComplete="off"
            />
          </label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="pixel-btn primary gate-submit" type="submit" disabled={busy}>
            {busy ? "正在敲门…" : "推门进屋"}
          </button>
        </form>

        <p className="gate-fine">
          个人密码加盐保存在服务器上，只用来认出你；房间暗号只给屋里的人。第一位进屋的人会成为站长。
        </p>
      </section>
    </div>
  );
}
