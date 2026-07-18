import React, { useState } from "react";
import { createPortal } from "react-dom";
import "../CustomerOrderInfo/customer_order_info.css";

export default function DeleteExecutorServiceModal({
  orderTitle,
  onClose,
  onConfirm,
  loading,
}) {
  const [agreed, setAgreed] = useState(false);
  const title = orderTitle ? `«${orderTitle}»` : "эту услугу";

  return createPortal(
    <div className="oi-modal-overlay" onClick={onClose} role="presentation">
      <div
        className="oi-modal oi-modal--delete"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-executor-service-modal-title"
      >
        <header className="oi-modal__header">
          <h3 id="delete-executor-service-modal-title" className="oi-modal__title">
            Удалить услугу?
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
                Услуга {title} будет удалена из вашего списка.
              </p>
              <p className="oi-modal__warning-text">
                Будут удалены ваша смета, график работ, договор, отклик, чат, жалобы
                администратору и записи об отказе по этому заказу.
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
            <span>Я понимаю последствия и согласен удалить услугу</span>
          </label>
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
            {loading ? "Удаляем..." : "Удалить услугу"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
