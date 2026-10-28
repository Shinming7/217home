import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorText } from "../../net/api";
import type { AdminOverview, MessageItem, PhotoItem, SelfMember, WeatherKind } from "../../net/types";
import { Panel } from "../../ui/Panel";

const CITIES = [
  { name: "上海", lat: 31.2304, lon: 121.4737 },
  { name: "北京", lat: 39.9042, lon: 116.4074 },
  { name: "广州", lat: 23.1291, lon: 113.2644 },
  { name: "深圳", lat: 22.5431, lon: 114.0579 },
  { name: "杭州", lat: 30.2741, lon: 120.1551 },
  { name: "成都", lat: 30.5728, lon: 104.0668 },
  { name: "哈尔滨", lat: 45.8038, lon: 126.5354 },
  { name: "昆明", lat: 25.0389, lon: 102.7183 },
  { name: "乌鲁木齐", lat: 43.8256, lon: 87.6168 },
  { name: "三亚", lat: 18.2528, lon: 109.5120 },
];

const WEATHER_OPTIONS: { value: WeatherKind | ""; label: string }[] = [
  { value: "", label: "跟随真实天气" },
  { value: "clear", label: "晴" },
  { value: "cloudy", label: "多云" },
  { value: "rain", label: "雨" },
  { value: "snow", label: "雪" },
  { value: "storm", label: "雷暴" },
  { value: "fog", label: "雾" },
];

type Tab = "members" | "content" | "settings";

type AdminPanelProps = {
  onClose: () => void;
  onChanged: () => void;
  onLogout: () => void;
  onAbdicated: (member: SelfMember) => void;
};

export function AdminPanel({ onClose, onChanged, onLogout, onAbdicated }: AdminPanelProps) {
  const [tab, setTab] = useState<Tab>("members");
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [cityName, setCityName] = useState("上海");
  const [weather, setWeather] = useState<WeatherKind | "">("");
  const [passcode, setPasscode] = useState("");
  const [passcodeAgain, setPasscodeAgain] = useState("");
  const [ownerKey, setOwnerKey] = useState("");
  const [ownerKeyAgain, setOwnerKeyAgain] = useState("");
  const [quitArmed, setQuitArmed] = useState(false);
  const timer = useRef(0);

  const load = useCallback(async () => {
    try {
      const [data, messageList, photoList] = await Promise.all([api.adminOverview(), api.messages(), api.photos()]);
      setOverview(data);
      setMessages(messageList);
      setPhotos(photoList);
      setCityName(data.city.name);
      setWeather(data.weatherOverride ?? "");
      setError("");
    } catch (caught) {
      setError(errorText(caught));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const flash = (text: string) => {
    setNote(text);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setNote(""), 3000);
  };

  const arm = (key: string, action: () => Promise<void>) => {
    if (confirm === key) {
      setConfirm(null);
      setBusy(true);
      void action().finally(() => setBusy(false));
      return;
    }
    setConfirm(key);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setConfirm(null), 4000);
  };

  const removeMember = (id: string, name: string) =>
    arm(`member:${id}`, async () => {
      try {
        await api.adminDeleteMember(id);
        setOverview((current) => (current ? { ...current, members: current.members.filter((m) => m.id !== id) } : current));
        flash(`${name} 已经搬出 217。`);
        onChanged();
      } catch (caught) {
        setError(errorText(caught));
      }
    });

  const removeMessage = (id: string) =>
    arm(`message:${id}`, async () => {
      try {
        await api.adminDeleteMessage(id);
        setMessages((current) => current.filter((message) => message.id !== id));
        setOverview((current) => (current ? { ...current, messageCount: Math.max(0, current.messageCount - 1) } : current));
        flash("留言已删除。");
        onChanged();
      } catch (caught) {
        setError(errorText(caught));
      }
    });

  const removePhoto = (id: string) =>
    arm(`photo:${id}`, async () => {
      try {
        await api.adminDeletePhoto(id);
        setPhotos((current) => current.filter((photo) => photo.id !== id));
        setOverview((current) => (current ? { ...current, photoCount: Math.max(0, current.photoCount - 1) } : current));
        flash("照片已删除。");
        onChanged();
      } catch (caught) {
        setError(errorText(caught));
      }
    });

  const changeCity = async (name: string) => {
    const city = CITIES.find((entry) => entry.name === name);
    if (!city) return;
    setCityName(name);
    setBusy(true);
    try {
      await api.adminSettings({ city });
      setOverview((current) => (current ? { ...current, city } : current));
      flash(`天气城市改为 ${name}。`);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };

  const changeWeather = async (value: WeatherKind | "") => {
    setWeather(value);
    setBusy(true);
    try {
      await api.adminSettings({ weatherOverride: value === "" ? null : value });
      setOverview((current) => (current ? { ...current, weatherOverride: value === "" ? null : value } : current));
      flash(value === "" ? "天气恢复跟随真实天气。" : "天气已手动覆盖。");
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };

  const rotatePasscode = async () => {
    if ([...passcode].length < 4) {
      setError("新暗号至少 4 个字符");
      return;
    }
    if (passcode !== passcodeAgain) {
      setError("两次输入的暗号不一样");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.adminSettings({ newPasscode: passcode });
      setPasscode("");
      setPasscodeAgain("");
      setOverview((current) => (current ? { ...current, passcodeIsDefault: false } : current));
      flash("暗号已更新，旧暗号立刻失效。");
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };

  const rotateOwnerKey = async () => {
    if (!/^\d{4}$/.test(ownerKey)) {
      setError("站长密匙需要 4 位数字");
      return;
    }
    if (ownerKey !== ownerKeyAgain) {
      setError("两次输入的站长密匙不一样");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.adminSettings({ newOwnerKey: ownerKey });
      setOwnerKey("");
      setOwnerKeyAgain("");
      setOverview((current) => (current ? { ...current, ownerKeyIsDefault: false } : current));
      flash("站长密匙已更新，退位后请把新密匙告诉下一位站长。");
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };

  const abdicate = () =>
    arm("abdicate", async () => {
      try {
        const { member } = await api.abdicateOwner();
        onAbdicated(member);
      } catch (caught) {
        setError(errorText(caught));
      }
    });

  return (
    <Panel kicker="OWNER PANEL · 217" title="站长管理" wide onClose={onClose}>
      <div className="tabs" role="tablist" aria-label="管理分类">
        {([
          ["members", "成员"],
          ["content", "内容"],
          ["settings", "房间设置"],
        ] as [Tab, string][]).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            className={tab === value ? "tab active" : "tab"}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {overview?.passcodeIsDefault ? (
        <p className="admin-banner">
          当前还是初始暗号 <strong>217217</strong>，建议在「房间设置」里改成只有朋友知道的暗号。
        </p>
      ) : null}
      {overview?.ownerKeyIsDefault ? (
        <p className="admin-banner">
          当前还是初始站长密匙 <strong>0217</strong>，建议在「房间设置」里改掉。
        </p>
      ) : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {note ? <p className="admin-note" role="status">{note}</p> : null}
      {!overview ? <p className="panel-note">正在打开站长的抽屉……</p> : null}

      {overview && tab === "members" ? (
        <div className="admin-section">
          <p className="panel-note">共 {overview.members.length} 位住户。移出后，对方会立刻退出登录。</p>
          <ul className="admin-list">
            {overview.members.map((member) => (
              <li key={member.id} className="admin-row">
                <span className={member.online ? "online-dot on" : "online-dot"} aria-hidden="true" />
                <span className="admin-name">
                  {member.nickname}
                  {member.role === "owner" ? <em className="owner-pill">站长</em> : null}
                </span>
                <span className="admin-sub">{member.online ? "在屋里" : "不在线"}</span>
                {member.role === "owner" ? (
                  <span className="admin-sub">不能移出站长</span>
                ) : (
                  <button
                    className={confirm === `member:${member.id}` ? "danger-btn armed" : "danger-btn"}
                    onClick={() => removeMember(member.id, member.nickname)}
                    disabled={busy}
                  >
                    {confirm === `member:${member.id}` ? "再点一次确认移出" : "移出房间"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {overview && tab === "content" ? (
        <div className="admin-section">
          <p className="panel-note">删除不可恢复。照片会连同原图一起删掉。</p>
          <h3 className="admin-subtitle">留言 · {messages.length}</h3>
          <ul className="admin-list compact">
            {messages.map((message) => (
              <li key={message.id} className="admin-row">
                <span className="admin-name">{message.author.nickname}</span>
                <span className="admin-body-text">{message.body}</span>
                <button
                  className={confirm === `message:${message.id}` ? "danger-btn armed" : "danger-btn"}
                  onClick={() => removeMessage(message.id)}
                  disabled={busy}
                >
                  {confirm === `message:${message.id}` ? "再点一次" : "删除"}
                </button>
              </li>
            ))}
            {!messages.length ? <li className="admin-empty">还没有留言。</li> : null}
          </ul>

          <h3 className="admin-subtitle">照片 · {photos.length}</h3>
          <ul className="admin-list compact">
            {photos.map((photo) => (
              <li key={photo.id} className="admin-row">
                <span className="admin-name">{photo.author.nickname}</span>
                <span className="admin-body-text">{photo.caption || "没有配文"}</span>
                <button
                  className={confirm === `photo:${photo.id}` ? "danger-btn armed" : "danger-btn"}
                  onClick={() => removePhoto(photo.id)}
                  disabled={busy}
                >
                  {confirm === `photo:${photo.id}` ? "再点一次" : "删除"}
                </button>
              </li>
            ))}
            {!photos.length ? <li className="admin-empty">还没有照片。</li> : null}
          </ul>
        </div>
      ) : null}

      {overview && tab === "settings" ? (
        <div className="admin-section">
          <div className="admin-form">
            <h3 className="admin-subtitle">窗外天气</h3>
            <label className="field">
              <span>城市</span>
              <select className="text-input" value={cityName} onChange={(event) => void changeCity(event.target.value)} disabled={busy}>
                {CITIES.map((city) => (
                  <option key={city.name} value={city.name}>
                    {city.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>天气覆盖</span>
              <select
                className="text-input"
                value={weather}
                onChange={(event) => void changeWeather(event.target.value as WeatherKind | "")}
                disabled={busy}
              >
                {WEATHER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <h3 className="admin-subtitle">房间暗号</h3>
            <p className="fineprint">改完立即生效，所有旧暗号都会失效；已经在屋里的住户不受影响。</p>
            <label className="field">
              <span>新暗号</span>
              <input
                className="text-input"
                type="password"
                value={passcode}
                onChange={(event) => setPasscode(event.target.value)}
                autoComplete="new-password"
              />
            </label>
            <label className="field">
              <span>再输一次</span>
              <input
                className="text-input"
                type="password"
                value={passcodeAgain}
                onChange={(event) => setPasscodeAgain(event.target.value)}
                autoComplete="new-password"
              />
            </label>
            <button className="pixel-btn primary" onClick={() => void rotatePasscode()} disabled={busy}>
              {busy ? "正在换锁…" : "更新暗号"}
            </button>

            <h3 className="admin-subtitle">站长密匙</h3>
            <p className="fineprint">4 位数字。退位后，下一位站长需要用新密匙上任；不要和房间暗号写成一样。</p>
            <label className="field">
              <span>新站长密匙</span>
              <input
                className="text-input"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={ownerKey}
                onChange={(event) => setOwnerKey(event.target.value.replace(/\D/g, "").slice(0, 4))}
                autoComplete="new-password"
              />
            </label>
            <label className="field">
              <span>再输一次</span>
              <input
                className="text-input"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={ownerKeyAgain}
                onChange={(event) => setOwnerKeyAgain(event.target.value.replace(/\D/g, "").slice(0, 4))}
                autoComplete="new-password"
              />
            </label>
            <button className="pixel-btn primary" onClick={() => void rotateOwnerKey()} disabled={busy}>
              {busy ? "正在换密匙…" : "更新站长密匙"}
            </button>

            <h3 className="admin-subtitle">站长身份</h3>
            <p className="fineprint">退位后你会变回普通住户，其他知道密匙的人可以接任；同一时间只有一位站长。</p>
            <button className={confirm === "abdicate" ? "danger-btn armed" : "danger-btn"} onClick={abdicate} disabled={busy}>
              {confirm === "abdicate" ? "再点一次确认退位" : "退位"}
            </button>

            <h3 className="admin-subtitle">离开</h3>
            <button
              className={quitArmed ? "danger-btn armed" : "danger-btn"}
              onClick={() => {
                if (quitArmed) {
                  onLogout();
                  return;
                }
                setQuitArmed(true);
                window.setTimeout(() => setQuitArmed(false), 4000);
              }}
            >
              {quitArmed ? "再点一次退出登录" : "退出登录"}
            </button>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
