import React, { useState } from "react";
import { API, apiFetch, buildApiUrl } from "../../../../../../../utils/api.js";
import "../../../../Orders/CommonComponents/CustomerCancelOrder/cancel_order.css";
const CUSTOMER_CANCEL_REASON_OPTIONS = [
  { value: "слишком_дорого", label: "Слишком дорого" },
  { value: "слишком_долго", label: "Слишком долгий срок" },
  { value: "изменились_обстоятельства", label: "Изменились обстоятельства" },
  { value: "нашёл_дешевле", label: "Нашёл дешевле" },
  { value: "другое", label: "Другое" },
];

function getCustomerReasonLabel(value) {
  return (
    CUSTOMER_CANCEL_REASON_OPTIONS.find((option) => option.value === value)
      ?.label || value
  );
}

export default function CustomerCancelServiceForExecutor({
  order,
  customerCancel,
  onRefresh,
  onDecisionApplied,
}) {
  const [decisionValue, setDecisionValue] = useState(null);
  const [decisionComment, setDecisionComment] = useState("");
  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false);
  const [formError, setFormError] = useState("");

  if (!order || !customerCancel) return null;

  const isExecutorPending = customerCancel?.status === "pending_executor";
  const isExecutorAgreed = customerCancel?.status === "agree";
  const isExecutorDisagreed = customerCancel?.status === "disagree";
  const canSubmitDecision = decisionValue && !isSubmittingDecision;

  const handleExecutorDecision = async () => {
    if (!decisionValue || !order?.id) return;

    setIsSubmittingDecision(true);
    setFormError("");

    try {
      const response = await apiFetch(
        buildApiUrl(`/order/${order.id}/executor_decision`),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order_id: order.id,
            customer_id: customerCancel.customer_id,
            executor_id: customerCancel.executor_id,
            status: decisionValue,
            executor_comment: decisionComment.trim(),
          }),
        },
      );

      if (response.ok) {
        setDecisionValue(null);
        setDecisionComment("");
        onRefresh?.();
        if (decisionValue === "agree") {
          onDecisionApplied?.();
        }
      } else {
        const error = await response.json();
        setFormError(error.detail || "Не удалось отправить решение");
      }
    } catch (error) {
      setFormError(`Ошибка сети: ${error.message}`);
    } finally {
      setIsSubmittingDecision(false);
    }
  };

  const statusIcon = isExecutorAgreed ? "✓" : isExecutorDisagreed ? "!" : "…";
  const statusIconClass = isExecutorAgreed
    ? "cancel-tab__status-icon--success"
    : isExecutorDisagreed
      ? "cancel-tab__status-icon--danger"
      : "cancel-tab__status-icon--pending";

  return (
    <div className="cancel-tab">
      <article className="cancel-tab__shell">
        <header className="cancel-tab__head">
          <span className="cancel-tab__badge">Отказ</span>
          <h2 className="cancel-tab__title">
            {isExecutorAgreed
              ? "Вы согласились с отменой"
              : isExecutorDisagreed
                ? "Вы не согласились с отменой"
                : "Заказчик запросил отмену"}
          </h2>
          <p className="cancel-tab__subtitle">Заказ № {order.id}</p>
        </header>

        <div className="cancel-tab__status">
          <div className="cancel-tab__status-head">
            <span
              className={`cancel-tab__status-icon ${statusIconClass}`.trim()}
              aria-hidden="true"
            >
              {statusIcon}
            </span>
            <div>
              <p className="cancel-tab__status-title">
                {isExecutorAgreed
                  ? "Заказ возвращён в поиск исполнителя"
                  : isExecutorDisagreed
                    ? "Спор передан администратору"
                    : "Требуется ваше решение"}
              </p>
              <p className="cancel-tab__status-meta">Статус: {customerCancel.status}</p>
            </div>
          </div>

          <p className="cancel-tab__initiator">
            <strong>Заказчик</strong> инициировал отмену заказа
          </p>

          <div className="cancel-tab__reason-box">
            <span className="cancel-tab__reason-label">Причина отмены</span>
            <strong>{getCustomerReasonLabel(customerCancel.reason_type)}</strong>
            <p className="cancel-tab__reason-text">{customerCancel.reason_text}</p>
          </div>

          {isExecutorPending && (
            <div className="cancel-tab__decision">
              <h4 className="cancel-tab__decision-title">Примите решение по отмене</h4>
              <p className="cancel-tab__decision-hint">
                {decisionValue === "agree"
                  ? "Вы соглашаетесь закрыть заказ."
                  : decisionValue === "disagree"
                    ? "Спор будет передан администратору."
                    : "Выберите, согласны ли вы с отменой заказа заказчиком."}
              </p>

              {formError && (
                <div
                  className="cancel-tab__notice cancel-tab__notice--error"
                  role="alert"
                  style={{ marginBottom: "0.875rem" }}
                >
                  {formError}
                </div>
              )}

              <div className="cancel-tab__choice-row">
                <button
                  type="button"
                  className={`cancel-tab__choice ${
                    decisionValue === "agree" ? "cancel-tab__choice--active-success" : ""
                  }`.trim()}
                  onClick={() => setDecisionValue("agree")}
                  disabled={isSubmittingDecision}
                >
                  Согласен
                </button>
                <button
                  type="button"
                  className={`cancel-tab__choice ${
                    decisionValue === "disagree" ? "cancel-tab__choice--active-danger" : ""
                  }`.trim()}
                  onClick={() => setDecisionValue("disagree")}
                  disabled={isSubmittingDecision}
                >
                  Не согласен
                </button>
              </div>

              <label className="cancel-tab__field">
                <span className="cancel-tab__label">Комментарий (необязательно)</span>
                <textarea
                  className="cancel-tab__textarea"
                  value={decisionComment}
                  onChange={(e) => setDecisionComment(e.target.value)}
                  placeholder="Добавьте комментарий к решению…"
                  rows={3}
                  maxLength={500}
                  disabled={isSubmittingDecision}
                />
                <span className="cancel-tab__hint">{decisionComment.length}/500</span>
              </label>

              <div className="cancel-tab__actions">
                <button
                  type="button"
                  className={`cancel-tab__btn ${
                    decisionValue === "disagree"
                      ? "cancel-tab__btn--danger"
                      : "cancel-tab__btn--success"
                  }`.trim()}
                  onClick={handleExecutorDecision}
                  disabled={!canSubmitDecision}
                >
                  {isSubmittingDecision
                    ? "Отправка…"
                    : decisionValue === "agree"
                      ? "Подтвердить согласие"
                      : decisionValue === "disagree"
                        ? "Подтвердить несогласие"
                        : "Выберите решение"}
                </button>
              </div>
            </div>
          )}

          {isExecutorAgreed && (
            <div className="cancel-tab__notice cancel-tab__notice--success">
              Вы подтвердили отмену заказа заказчиком.
              {customerCancel.executor_comment && (
                <span> Комментарий: {customerCancel.executor_comment}</span>
              )}
            </div>
          )}

          {isExecutorDisagreed && (
            <div className="cancel-tab__notice cancel-tab__notice--error">
              Вы не согласились с отменой. Заявка передана администратору.
              {customerCancel.executor_comment && (
                <span> Комментарий: {customerCancel.executor_comment}</span>
              )}
            </div>
          )}

          {order.payment?.escrow_status === "deposited" && (
            <div className="cancel-tab__notice cancel-tab__notice--info cancel-tab__notice--spaced">
              Средства заморожены на счёте до завершения процедуры отмены.
            </div>
          )}

          {onRefresh && (
            <div className="cancel-tab__footer-actions">
              <button
                type="button"
                className="cancel-tab__btn cancel-tab__btn--secondary"
                onClick={onRefresh}
              >
                Обновить статус
              </button>
            </div>
          )}
        </div>
      </article>
    </div>
  );
}
