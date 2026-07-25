import React, { useState } from "react";
import { createPortal } from "react-dom";
import "../../../Services/CommonComponent/CustomerOrderInfo/customer_order_info.css";

export default function CompleteOrderModal({
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
        aria-labelledby="complete-order-modal-title"
      >
        <header className="oi-modal__header">
          <h3 id="complete-order-modal-title" className="oi-modal__title">
            Заказ выполнен?
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
                Заказ {title} будет переведён в статус «Выполнен».
              </p>
              <p className="oi-modal__warning-text">
                Исполнитель получит уведомление о завершении. Отменить это
                действие будет нельзя. После подтверждения вы сможете оставить
                отзыв об исполнителе.
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
            <span>Я подтверждаю, что работы выполнены и принимаю результат</span>
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
            {loading ? "Сохраняем…" : "Заказ выполнен"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
