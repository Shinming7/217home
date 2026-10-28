import { useState } from "react";
import { api, errorText } from "../../net/api";
import type { SelfMember } from "../../net/types";
import { Panel } from "../../ui/Panel";

type OwnerClaimProps = {
  onClose: () => void;
  onClaimed: (member: SelfMember) => void;
};

export function OwnerClaim({ onClose, onClaimed }: OwnerClaimProps) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!/^\d{4}$/.test(key)) {
      setError("站长密匙是 4 位数字");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { member } = await api.claimOwner(key);
      onClaimed(member);
    } catch (caught) {
      setError(errorText(caught));
      setBusy(false);
    }
  };

  return (
    <Panel kicker="OWNER KEY · 217" title="站长上任" onClose={onClose}>
      <form className="claim-form" onSubmit={submit}>
        <p className="panel-note">
          屋里现在没有站长。输入 4 位站长密匙就能上任，同一时间只有一位站长；上任后可以在站长面板里换密匙或退位。
        </p>
        <label className="field">
          <span>站长密匙</span>
          <input
            className="text-input claim-input"
            type="password"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            value={key}
            onChange={(event) => setKey(event.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="4 位数字"
            autoComplete="off"
            autoFocus
          />
        </label>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <button className="pixel-btn primary" type="submit" disabled={busy || key.length !== 4}>
          {busy ? "正在核对密匙…" : "当选站长"}
        </button>
      </form>
    </Panel>
  );
}
