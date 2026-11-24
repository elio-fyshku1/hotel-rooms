"use client";
/**
 * Simple yes/no dialog.
 */
interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({ title, message, confirmLabel, cancelLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div className="overlay">
      <div className="modal">
        <h2>{title}</h2>
        <p>{message}</p>
        <div className="stack">
          <button className="btn red big" onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button className="btn big" onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
