"use client";
/**
 * Message box at the bottom of the screen shown after a card is read
 * (check-in, check-out, errors). It can carry buttons, e.g. "Anulo".
 * Tapping it closes it.
 */

export interface NoticeData {
  kind: "checkin" | "checkout" | "warning" | "error";
  title: string;
  text?: string;
  actions?: { label: string; run: () => void }[];
}

interface NoticeProps {
  notice: NoticeData;
  onClose: () => void;
}

export default function Notice({ notice, onClose }: NoticeProps) {
  return (
    <div className={`notice ${notice.kind}`} onClick={onClose}>
      <div className="notice-title">{notice.title}</div>
      {notice.text && <div className="notice-text">{notice.text}</div>}

      {notice.actions && (
        <div className="row" style={{ marginTop: 10 }}>
          {notice.actions.map((action) => (
            <button
              key={action.label}
              className="btn sm"
              onClick={(event) => {
                event.stopPropagation(); // don't trigger onClose twice
                onClose();
                action.run();
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
