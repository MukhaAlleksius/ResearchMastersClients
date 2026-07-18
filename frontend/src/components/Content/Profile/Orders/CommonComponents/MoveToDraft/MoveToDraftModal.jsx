import React, { useState } from "react";
import { createPortal } from "react-dom";
import "../../../Services/CommonComponent/CustomerOrderInfo/customer_order_info.css";

const VARIANTS = {
  search: {
    texts: [
      "Если вы уберёте заказ в черновик, все откликнувшиеся исполнители потеряют возможность выполнить ваш заказ. Их предложения будут отменены, и заказ исчезнет из поиска.",
      "После редактирования вы сможете снова опубликовать заказ, но исполнителям придётся откликнуться заново.",
    ],
    agreement: "Я понимаю последствия и согласен убрать заказ в черновик",
  },
  self: {
    texts: [
      "Если вы уберёте заказ в черновик, он выйдет из статуса «Самостоятельное выполнение».",
      "Текущая смета и график работ будут удалены. После редактирования их нужно будет заполнить заново при повторном переводе в работу.",
    ],
    agreement:
      "Я понимаю, что смета и график работ будут удалены, и согласен убрать заказ в черновик",
  },
};

export default function MoveToDraftModal({
  onClose,
  onConfirm,
  loading,
  variant = "search",
}) {
  const [agreed, setAgreed] = useState(false);
  const content = VARIANTS[variant] ?? VARIANTS.search;

  return createPortal(
    <div className="oi-modal-overlay" onClick={onClose} role="presentation">
      <div
        className="oi-modal oi-modal--warning"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="draft-modal-title"
      >
        <header className="oi-modal__header">
          <h3 id="draft-modal-title" className="oi-modal__title">
            Убрать заказ в черновик?
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
          <div className="oi-modal__warning" role="alert">
            <span className="oi-modal__warning-icon" aria-hidden="true">
              ⚠
            </span>
            <div className="oi-modal__warning-content">
              <p className="oi-modal__warning-title">Внимание</p>
              {content.texts.map((text) => (
                <p key={text} className="oi-modal__warning-text">
                  {text}
                </p>
              ))}
            </div>
          </div>

          <label className="oi-modal__agreement">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              disabled={loading}
            />
            <span>{content.agreement}</span>
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
            {loading ? "Сохраняем…" : "Убрать в черновик"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
