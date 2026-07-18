import React from "react";

export default function SpecModal({ open, onClose, title, children, footer }) {
  if (!open) return null;

  return (
    <div className="spec-modal-overlay" onClick={onClose} role="presentation">
      <div
        className="spec-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="spec-modal-title"
      >
        <header className="spec-modal__head">
          <h3 id="spec-modal-title" className="spec-modal__title">
            {title}
          </h3>
          <button
            type="button"
            className="spec-modal__close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </header>
        <div className="spec-modal__body">{children}</div>
        {footer && <footer className="spec-modal__foot">{footer}</footer>}
      </div>
    </div>
  );
}
