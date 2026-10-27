import { useEffect, type ReactNode } from "react";

type PanelProps = {
  kicker?: string;
  title: string;
  wide?: boolean;
  onClose: () => void;
  children: ReactNode;
};

export function Panel({ kicker, title, wide, onClose, children }: PanelProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="panel-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className={wide ? "panel wide" : "panel"} role="dialog" aria-modal="true" aria-label={title}>
        <header className="panel-head">
          <div>
            {kicker ? <span className="profile-kicker">{kicker}</span> : null}
            <h2>{title}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>
        <div className="panel-body">{children}</div>
      </section>
    </div>
  );
}
