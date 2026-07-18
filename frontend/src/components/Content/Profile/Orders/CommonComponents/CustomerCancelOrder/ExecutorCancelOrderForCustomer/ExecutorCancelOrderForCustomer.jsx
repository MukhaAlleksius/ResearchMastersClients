import React, { useEffect, useState } from "react";
import { API, apiFetch, buildApiUrl } from "../../../../../../../utils/api.js";
import "../cancel_order.css";
const EXECUTOR_CANCEL_REASON_OPTIONS = [
  { value: "нет_времени", label: "Нет времени / занят" },
  { value: "сложнее_чем_ожидалось", label: "Заказ сложнее, чем ожидалось" },
  { value: "недостаточно_информации", label: "Недостаточно информации о заказе" },
  {
    value: "не_соответствует_договору",
    label: "Условия не соответствуют договорённостям",
  },
  { value: "заказчик_нарушает_условия", label: "Заказчик нарушает условия" },
  { value: "изменились_обстоятельства", label: "Изменились обстоятельства" },
  { value: "другое", label: "Другое" },
];

function getExecutorReasonLabel(value) {
  return (
    EXECUTOR_CANCEL_REASON_OPTIONS.find((option) => option.value === value)
      ?.label || value
  );
}

export default function ExecutorCancelOrderForCustomer({
  order,
  executorCancel,
  onRefresh,
  onCancelResolved,
}) {
  const [decisionValue, setDecisionValue] = useState(null);
  const [decisionComment, setDecisionComment] = useState("");
  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false);
  const [formError, setFormError] = useState("");

  const isCustomerPending = executorCancel?.status === "pending_customer";
  const isCustomerAgreed = executorCancel?.status === "agree";
  const isCustomerDisagreed = executorCancel?.status === "disagree";

  useEffect(() => {
    if (isCustomerAgreed) {
      onCancelResolved?.();
    }
  }, [isCustomerAgreed, onCancelResolved]);

  if (!order || !executorCancel) return null;

  const canSubmitDecision = decisionValue && !isSubmittingDecision;

  const handleRefresh = () => {
    onRefresh?.();
    if (executorCancel?.status === "agree") {
      onCancelResolved?.();
    }
  };

  const handleExecutorDecision = async () => {
    if (!decisionValue) return;

    setIsSubmittingDecision(true);
    setFormError("");

    try {
      const response = await apiFetch(
        buildApiUrl(`/order/${order.id}/customer_decision`),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order_id: order.id,
            customer_id: executorCancel.customer_id,
            executor_id: executorCancel.executor_id,
            status: decisionValue,
            customer_comment: decisionComment.trim(),
          }),
        },
      );

      if (response.ok) {
        setDecisionValue(null);
        setDecisionComment("");
        onRefresh?.();
        if (decisionValue === "agree") {
          onCancelResolved?.();
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

  const statusIcon = isCustomerAgreed ? "✓" : isCustomerDisagreed ? "!" : "…";
  const statusIconClass = isCustomerAgreed
    ? "cancel-tab__status-icon--success"
    : isCustomerDisagreed
      ? "cancel-tab__status-icon--danger"
      : "cancel-tab__status-icon--pending";

  return (
    <div className="cancel-tab">
      <article className="cancel-tab__shell">
        <header className="cancel-tab__head">
          <span className="cancel-tab__badge">Отказ</span>
          <h2 className="cancel-tab__title">
            {isCustomerAgreed
              ? "Вы согласились с отменой"
              : isCustomerDisagreed
                ? "Вы не согласились с отменой"
                : "Исполнитель запросил отмену"}
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
                {isCustomerAgreed
                  ? "Заказ возвращён в поиск исполнителя"
                  : isCustomerDisagreed
                    ? "Спор передан администратору"
                    : "Требуется ваше решение"}
              </p>
              <p className="cancel-tab__status-meta">Статус: {executorCancel.status}</p>
            </div>
          </div>

          <p className="cancel-tab__initiator">
            <strong>Исполнитель</strong> инициировал отмену заказа
          </p>

          <div className="cancel-tab__reason-box">
            <span className="cancel-tab__reason-label">Причина отказа</span>
            <strong>{getExecutorReasonLabel(executorCancel.reason_type)}</strong>
            <p className="cancel-tab__reason-text">{executorCancel.reason_text}</p>
          </div>

          {isCustomerPending && (
            <div className="cancel-tab__decision">
              <h4 className="cancel-tab__decision-title">Примите решение по отмене</h4>
              <p className="cancel-tab__decision-hint">
                {decisionValue === "agree"
                  ? "Заказ вернётся в поиск исполнителя."
                  : decisionValue === "disagree"
                    ? "Спор будет передан администратору."
                    : "Выберите, согласны ли вы с отменой заказа исполнителем."}
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

          {isCustomerAgreed && (
            <div className="cancel-tab__notice cancel-tab__notice--success">
              Вы подтвердили отмену. Заказ возвращён в поиск исполнителя.
            </div>
          )}

          {isCustomerDisagreed && (
            <div className="cancel-tab__notice cancel-tab__notice--error">
              Вы не согласились с отменой. Заявка передана администратору.
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
                onClick={handleRefresh}
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
