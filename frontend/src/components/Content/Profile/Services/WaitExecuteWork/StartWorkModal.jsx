import React, { useState } from "react";
import { createPortal } from "react-dom";
import "../CommonComponent/CustomerOrderInfo/customer_order_info.css";

export default function StartWorkModal({
  orderTitle,
  onClose,
  onConfirm,
  loading,
  error,
}) {
  const [agreed, setAgreed] = useState(false);
  const title = orderTitle ? `«${orderTitle}»` : "этот заказ";

  return createPortal(
    <div className="oi-modal-overlay" onClick={onClose} role="presentation">
      <div
        className="oi-modal oi-modal--self"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="start-work-modal-title"
      >
        <header className="oi-modal__header">
          <h3 id="start-work-modal-title" className="oi-modal__title">
            Начать работу?
          </h3>
          <button
            type="button"
            className="oi-modal__close"
            onClick={onClose}
            aria-label="Закрыть"
            disabled={loading}
          >
            ×
          </button>
        </header>

        <div className="oi-modal__body">
          <div className="oi-modal__warning oi-modal__warning--self" role="alert">
            <span className="oi-modal__warning-icon" aria-hidden="true">
              ⚠
            </span>
            <div className="oi-modal__warning-content">
              <p className="oi-modal__warning-title">Внимание</p>
              <p className="oi-modal__warning-text">
                Заказ {title} будет переведён в статус «В процессе выполнения».
              </p>
              <p className="oi-modal__warning-text">
                Заказчик увидит, что вы приступили к работам. После подтверждения
                отменить начало работы будет нельзя — только через отказ от
                исполнения.
              </p>
            </div>
          </div>

          <label className="oi-modal__agreement">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              disabled={loading}
            />
            <span>Я понимаю последствия и готов начать работу</span>
          </label>

          {error && (
            <p className="order-info__alert" role="alert">
              {error}
            </p>
          )}
        </div>

        <footer className="oi-modal__footer">
          <button
            type="button"
            className="oi-modal__btn-cancel"
            onClick={onClose}
            disabled={loading}
          >
            Отмена
          </button>
          <button
            type="button"
            className="oi-modal__btn-self"
            onClick={onConfirm}
            disabled={loading || !agreed}
          >
            {loading ? "Сохраняем…" : "Начать работу"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
