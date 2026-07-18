import React, { useState } from "react";
import { createPortal } from "react-dom";
import "../Services/CommonComponent/CustomerOrderInfo/customer_order_info.css";

export default function DeleteCustomerExecutorModal({
  executorName,
  onClose,
  onConfirm,
  loading,
}) {
  const [agreed, setAgreed] = useState(false);
  const title = executorName || "этого исполнителя";

  return createPortal(
    <div className="oi-modal-overlay" onClick={onClose} role="presentation">
      <div
        className="oi-modal oi-modal--delete"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-customer-executor-modal-title"
      >
        <header className="oi-modal__header">
          <h3 id="delete-customer-executor-modal-title" className="oi-modal__title">
            Удалить исполнителя?
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
              <p className="oi-modal__warning-title">Исполнитель будет убран из списка</p>
              <p className="oi-modal__warning-text">
                {title} исчезнет из раздела «Исполнители». Сохранённые контакты по
                нему будут удалены.
              </p>
              <p className="oi-modal__warning-text">
                Если с этим исполнителем снова появится заказ, он может вернуться в
                список. Контакты можно будет добавить заново.
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
            <span>Я понимаю и согласен удалить исполнителя из списка</span>
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
            {loading ? "Удаляем..." : "Удалить исполнителя"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
