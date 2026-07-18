import React, { useEffect, useState } from "react";
import { API, apiFetch } from "../../../../../../../utils/api.js";
import "../cancel_order.css";
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

export default function CustomerCancelOrderForExecutor({
  order,
  customerCancel,
  onRefresh,
  onCancelResolved,
}) {
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState("");

  const isExecutorPending = customerCancel?.status === "pending_executor";
  const isExecutorAgreed = customerCancel?.status === "agree";
  const isExecutorDisagreed = customerCancel?.status === "disagree";

  useEffect(() => {
    if (isExecutorAgreed) {
      onCancelResolved?.();
    }
  }, [isExecutorAgreed, onCancelResolved]);

  if (!order || !customerCancel) return null;

  const handleRefresh = () => {
    onRefresh?.();
    if (customerCancel?.status === "agree") {
      onCancelResolved?.();
    }
  };

  const handleWithdrawCancel = async () => {
    if (!order?.id || !customerCancel) return;
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
        customer_id: String(customerCancel.customer_id),
        executor_id: String(customerCancel.executor_id),
      });
      const response = await apiFetch(
        `${API.baseURL}/order/${order.id}/customer_cancel?${params.toString()}`,
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
              ? "Заказ отменён"
              : isExecutorDisagreed
                ? "Исполнитель не согласен"
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
                {isExecutorAgreed
                  ? "Исполнитель согласился с отменой"
                  : isExecutorDisagreed
                    ? "Спор передан администратору"
                    : "Ожидаем ответ исполнителя"}
              </p>
              <p className="cancel-tab__status-meta">Статус: {customerCancel.status}</p>
            </div>
          </div>

          <p className="cancel-tab__initiator">Вы инициировали отмену заказа</p>

          <div className="cancel-tab__reason-box">
            <span className="cancel-tab__reason-label">Ваша причина</span>
            <strong>{getCustomerReasonLabel(customerCancel.reason_type)}</strong>
            <p className="cancel-tab__reason-text">{customerCancel.reason_text}</p>
          </div>

          {isExecutorPending && (
            <div className="cancel-tab__notice cancel-tab__notice--info">
              Исполнитель ещё не принял решение. Вы получите уведомление, когда он
              ответит.
            </div>
          )}

          {withdrawError && (
            <div className="cancel-tab__notice cancel-tab__notice--error" role="alert">
              {withdrawError}
            </div>
          )}

          {isExecutorAgreed && (
            <div className="cancel-tab__notice cancel-tab__notice--success">
              Исполнитель согласился с отменой. Заказ возвращён в поиск исполнителя.
            </div>
          )}

          {isExecutorDisagreed && (
            <div className="cancel-tab__notice cancel-tab__notice--error">
              Исполнитель не согласился с отменой. Ситуация передана администратору.
              {customerCancel.executor_comment && (
                <span> Комментарий: {customerCancel.executor_comment}</span>
              )}
            </div>
          )}

          {onRefresh && (
            <div className="cancel-tab__footer-actions">
              {isExecutorPending && (
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
                onClick={handleRefresh}
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
