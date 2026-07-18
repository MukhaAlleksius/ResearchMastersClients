import React, { useState } from "react";
import { createPortal } from "react-dom";
import "../../../Services/CommonComponent/CustomerOrderInfo/customer_order_info.css";

export default function DeleteOrderModal({
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
        className="oi-modal oi-modal--delete"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-order-modal-title"
      >
        <header className="oi-modal__header">
          <h3 id="delete-order-modal-title" className="oi-modal__title">
            Удалить заказ?
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
          <div className="oi-modal__warning oi-modal__warning--delete" role="alert">
            <span className="oi-modal__warning-icon" aria-hidden="true">
              !
            </span>
            <div className="oi-modal__warning-content">
              <p className="oi-modal__warning-title">Действие необратимо</p>
              <p className="oi-modal__warning-text">
                Заказ {title} будет удалён без возможности восстановления.
              </p>
              <p className="oi-modal__warning-text">
                Будут удалены смета, договор, чат, отклики и заявки на отказ
                исполнителей. График выполнения и оплата на этих этапах ещё недоступны.
              </p>
              <p className="oi-modal__warning-text">
                Исполнители получат уведомление о том, что заказчик удалил заказ.
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
            <span>Я понимаю последствия и согласен удалить заказ</span>
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
            className="oi-modal__btn-danger"
            onClick={onConfirm}
            disabled={loading || !agreed}
          >
            {loading ? "Удаляем..." : "Удалить заказ"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
