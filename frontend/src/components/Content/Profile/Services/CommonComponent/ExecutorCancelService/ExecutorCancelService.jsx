import React, { useState, useEffect, useCallback } from "react";
import { API, apiFetch, buildApiUrl } from "../../../../../../utils/api.js";
import CustomerCancelServiceForExecutor from "./CustomerCancelSrviceForExecutor/CustomerCancelServiceForExecutor";
import ExecutorCancelServiceForCustomer from "./ExecutorCancelServiceForCustomer/ExecutorCancelServiceForCustomer";
import "../../../Orders/CommonComponents/CustomerCancelOrder/cancel_order.css";
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

function CancelOrderUnavailable({ message }) {
  return (
    <div className="cancel-tab">
      <article className="cancel-tab__shell">
        <div className="cancel-tab__body">
          <div className="cancel-tab__notice cancel-tab__notice--error" role="alert">
            {message}
          </div>
        </div>
      </article>
    </div>
  );
}

function CancelOrderLoading() {
  return (
    <div className="cancel-tab cancel-tab--loading">
      <div className="cancel-tab__spinner" aria-hidden="true" />
      <p>Проверяем статус отмены…</p>
    </div>
  );
}

export default function ExecutorCancelService({
  order,
  executorId,
  status = "pending_customer",
  onCancelSuccess,
  onCustomerCancelAgreed,
}) {
  const [reasonType, setReasonType] = useState("");
  const [reasonText, setReasonText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [customerCancel, setCustomerCancel] = useState(null);
  const [executorCancel, setExecutorCancel] = useState(null);
  const [loading, setLoading] = useState(true);

  const executorIdResolved =
    executorId ?? order?.executor_id ?? parseInt(localStorage.getItem("user_id"), 10);
  const canSubmit = reasonType && reasonText.trim() && !isSubmitting;

  const loadCancellationState = useCallback(async () => {
    if (!order?.id || !executorIdResolved || !order.customer_id) {
      setCustomerCancel(null);
      setExecutorCancel(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [customerResponse, executorResponse] = await Promise.all([
        apiFetch(
          buildApiUrl(`/order/${order.id}/customer_order_cancel?customer_id=${order.customer_id}&executor_id=${executorIdResolved}`),
        ),
        apiFetch(
          buildApiUrl(`/order/${order.id}/executor_order_cancel?customer_id=${order.customer_id}&executor_id=${executorIdResolved}`),
        ),
      ]);

      if (customerResponse.ok) {
        setCustomerCancel(await customerResponse.json());
      } else {
        setCustomerCancel(null);
      }

      if (executorResponse.ok) {
        setExecutorCancel(await executorResponse.json());
      } else {
        setExecutorCancel(null);
      }
    } catch (err) {
      console.error("Ошибка проверки статуса отмены:", err);
      setCustomerCancel(null);
      setExecutorCancel(null);
    } finally {
      setLoading(false);
    }
  }, [order?.id, order?.customer_id, executorIdResolved]);

  useEffect(() => {
    loadCancellationState();
  }, [loadCancellationState]);

  const handleSubmitCancel = async (e) => {
    e.preventDefault();
    if (!reasonType || !reasonText.trim()) {
      setFormError("Заполните причину отказа");
      return;
    }

    if (!executorIdResolved || !order?.customer_id) {
      setFormError("Не удалось определить участников заказа");
      return;
    }

    setIsSubmitting(true);
    setFormError("");

    try {
      const response = await apiFetch(
        buildApiUrl(`/order/${order.id}/executor_cancel`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "executor_cancel",
            order_id: order.id,
            customer_id: order.customer_id,
            executor_id: executorIdResolved,
            status,
            reason_type: reasonType,
            reason_text: reasonText.trim(),
          }),
        },
      );

      if (response.ok) {
        onCancelSuccess?.();
        setReasonType("");
        setReasonText("");
        loadCancellationState();
      } else {
        const error = await response.json();
        setFormError(error.detail || "Не удалось отправить заявку");
      }
    } catch (error) {
      setFormError(`Ошибка сети: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasCustomerCancellation =
    customerCancel &&
    ["pending_executor", "agree", "disagree"].includes(customerCancel.status);

  const hasExecutorCancellation =
    executorCancel &&
    ["pending_customer", "agree", "disagree"].includes(executorCancel.status);

  if (!order?.id) {
    return (
      <CancelOrderUnavailable message="Заказ не найден. Вернитесь к списку услуг." />
    );
  }

  if (!loading && (!executorIdResolved || !order.customer_id)) {
    return (
      <CancelOrderUnavailable message="Не удалось загрузить данные заказа для оформления отказа." />
    );
  }

  if (loading) {
    return <CancelOrderLoading />;
  }

  if (hasCustomerCancellation) {
    return (
      <CustomerCancelServiceForExecutor
        order={order}
        customerCancel={customerCancel}
        onRefresh={loadCancellationState}
        onDecisionApplied={onCustomerCancelAgreed}
      />
    );
  }

  if (hasExecutorCancellation) {
    return (
      <ExecutorCancelServiceForCustomer
        order={order}
        executorCancel={executorCancel}
        onRefresh={loadCancellationState}
        onCancelResolved={onCustomerCancelAgreed}
      />
    );
  }

  return (
    <div className="cancel-tab">
      <article className="cancel-tab__shell">
        <header className="cancel-tab__head">
          <span className="cancel-tab__badge">Отказ</span>
          <h2 className="cancel-tab__title">Отказ от заказа № {order.id}</h2>
          <p className="cancel-tab__subtitle">
            Опишите причину — заказчик получит уведомление и сможет принять решение
          </p>
        </header>

        <div className="cancel-tab__body">
          <div className="cancel-tab__order">
            <p className="cancel-tab__order-title">
              {order.title || `Заказ № ${order.id}`}
            </p>
            <p className="cancel-tab__order-meta">
              № {order.id}
              {order.budget != null &&
                ` · ${Number(order.budget).toLocaleString()} ${order.currency || "BYN"}`}
            </p>
          </div>

          {formError && (
            <div className="cancel-tab__notice cancel-tab__notice--error" role="alert">
              {formError}
            </div>
          )}

          <form className="cancel-tab__form" onSubmit={handleSubmitCancel}>
            <label className="cancel-tab__field">
              <span className="cancel-tab__label">Причина отказа от заказа</span>
              <select
                className="cancel-tab__select"
                value={reasonType}
                onChange={(e) => setReasonType(e.target.value)}
                required
                disabled={isSubmitting}
              >
                <option value="">Выберите причину</option>
                {EXECUTOR_CANCEL_REASON_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="cancel-tab__field">
              <span className="cancel-tab__label">Подробное объяснение</span>
              <textarea
                className="cancel-tab__textarea"
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                placeholder="Опишите, почему не можете выполнить заказ…"
                rows={4}
                required
                maxLength={1000}
                disabled={isSubmitting}
              />
              <span className="cancel-tab__hint">{reasonText.length}/1000</span>
            </label>

            <div className="cancel-tab__notice cancel-tab__notice--info">
              После отправки заказчик согласится с отменой или передаст спор
              администратору.
            </div>

            <div className="cancel-tab__actions">
              <button
                type="submit"
                className="cancel-tab__btn cancel-tab__btn--danger"
                disabled={!canSubmit}
              >
                {isSubmitting ? "Отправка…" : "Отправить отказ"}
              </button>
            </div>
          </form>
        </div>
      </article>
    </div>
  );
}
