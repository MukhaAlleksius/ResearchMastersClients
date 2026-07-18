import React, { useState } from "react";
import { createPortal } from "react-dom";
import "../../../Services/CommonComponent/CustomerOrderInfo/customer_order_info.css";

export default function SelfExecutionModal({ onClose, onConfirm, loading }) {
  const [agreed, setAgreed] = useState(false);

  return createPortal(
    <div className="oi-modal-overlay" onClick={onClose} role="presentation">
      <div
        className="oi-modal oi-modal--self"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="self-modal-title"
      >
        <header className="oi-modal__header">
          <h3 id="self-modal-title" className="oi-modal__title">
            Самостоятельное выполнение?
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
                Заказ будет переведён в статус «Самостоятельное выполнение» и
                исчезнет из поиска исполнителей.
              </p>
              <p className="oi-modal__warning-text">
                Все откликнувшиеся исполнители потеряют возможность выполнить
                ваш заказ. Вы будете выполнять работу самостоятельно.
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
            <span>
              Я понимаю последствия и согласен выполнить заказ самостоятельно
            </span>
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
            className="oi-modal__btn-self"
            onClick={onConfirm}
            disabled={loading || !agreed}
          >
            {loading ? "Сохраняем…" : "Подтвердить"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
