import React, { useEffect, useState } from "react";
import { API, apiFetch } from "../../../../../../../utils/api.js";
import "../../../../Orders/CommonComponents/CustomerCancelOrder/cancel_order.css";
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

export default function ExecutorCancelServiceForCustomer({
  order,
  executorCancel,
  onRefresh,
  onCancelResolved,
}) {
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState("");

  const isCustomerPending = executorCancel?.status === "pending_customer";
  const isCustomerAgreed = executorCancel?.status === "agree";
  const isCustomerDisagreed = executorCancel?.status === "disagree";

  useEffect(() => {
    if (isCustomerAgreed) {
      onCancelResolved?.();
    }
  }, [isCustomerAgreed, onCancelResolved]);

  if (!order || !executorCancel) return null;

  const handleWithdrawCancel = async () => {
    if (!order?.id || !executorCancel) return;
    if (
      !window.confirm(
        "Отменить заявку на отказ? Заказ продолжит выполняться в обычном режиме.",
      )
    ) {
      return;
    }

    setIsWithdrawing(true);
    setWithdrawError("");

    try {
      const params = new URLSearchParams({
        customer_id: String(executorCancel.customer_id),
        executor_id: String(executorCancel.executor_id),
      });
      const response = await apiFetch(
        `${API.baseURL}/order/${order.id}/executor_cancel?${params.toString()}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || "Не удалось отменить заявку");
      }

      onRefresh?.();
    } catch (error) {
      setWithdrawError(error.message || "Не удалось отменить заявку");
    } finally {
      setIsWithdrawing(false);
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
              ? "Заказ отменён"
              : isCustomerDisagreed
                ? "Заказчик не согласен"
                : "Заявка отправлена"}
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
                  ? "Заказчик согласился с отменой"
                  : isCustomerDisagreed
                    ? "Спор передан администратору"
                    : "Ожидаем ответ заказчика"}
              </p>
              <p className="cancel-tab__status-meta">Статус: {executorCancel.status}</p>
            </div>
          </div>

          <p className="cancel-tab__initiator">Вы инициировали отмену заказа</p>

          <div className="cancel-tab__reason-box">
            <span className="cancel-tab__reason-label">Ваша причина</span>
            <strong>{getExecutorReasonLabel(executorCancel.reason_type)}</strong>
            <p className="cancel-tab__reason-text">{executorCancel.reason_text}</p>
          </div>

          {isCustomerPending && (
            <div className="cancel-tab__notice cancel-tab__notice--info">
              Заказчик ещё не принял решение. Вы получите уведомление, когда он
              ответит.
            </div>
          )}

          {withdrawError && (
            <div className="cancel-tab__notice cancel-tab__notice--error" role="alert">
              {withdrawError}
            </div>
          )}

          {isCustomerAgreed && (
            <div className="cancel-tab__notice cancel-tab__notice--success">
              Заказчик согласился с отменой. Заказ возвращён в поиск исполнителя.
            </div>
          )}

          {isCustomerDisagreed && (
            <div className="cancel-tab__notice cancel-tab__notice--error">
              Заказчик не согласился с отменой. Ситуация передана администратору.
            </div>
          )}

          {onRefresh && (
            <div className="cancel-tab__footer-actions">
              {isCustomerPending && (
                <button
                  type="button"
                  className="cancel-tab__btn cancel-tab__btn--secondary"
                  onClick={handleWithdrawCancel}
                  disabled={isWithdrawing}
                >
                  {isWithdrawing ? "Отмена…" : "Отмена"}
                </button>
              )}
              <button
                type="button"
                className="cancel-tab__btn cancel-tab__btn--secondary"
                onClick={onRefresh}
                disabled={isWithdrawing}
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
