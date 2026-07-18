import React, { useState, useEffect, useCallback } from "react";
import { API, apiFetch, buildApiUrl } from "../../../../../../utils/api.js";
import CustomerCancelOrderForExecutor from "./CustomerCancelOrderForExecutor/CustomerCancelOrderForExecutor";
import ExecutorCancelOrderForCustomer from "./ExecutorCancelOrderForCustomer/ExecutorCancelOrderForCustomer";
import "./cancel_order.css";
const CUSTOMER_CANCEL_REASON_OPTIONS = [
  { value: "слишком_дорого", label: "Слишком дорого" },
  { value: "слишком_долго", label: "Слишком долгий срок" },
  { value: "изменились_обстоятельства", label: "Изменились обстоятельства" },
  { value: "нашёл_дешевле", label: "Нашёл дешевле" },
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

export default function CustomerCancelOrder({
  order,
  executorId,
  status = "pending_executor",
  onCancelSuccess,
  onCancelResolved,
}) {
  const [reasonType, setReasonType] = useState("");
  const [reasonText, setReasonText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [customerCancel, setCustomerCancel] = useState(null);
  const [executorCancel, setExecutorCancel] = useState(null);
  const [loading, setLoading] = useState(true);

  const executorIdResolved = executorId ?? order?.executor_id;
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
      setFormError("Не удалось определить исполнителя для этого заказа");
      return;
    }

    setIsSubmitting(true);
    setFormError("");

    try {
      const response = await apiFetch(
        buildApiUrl(`/order/${order.id}/customer_cancel`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "customer_cancel",
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
      <CancelOrderUnavailable message="Заказ не найден. Вернитесь к списку заказов." />
    );
  }

  if (!loading && (!executorIdResolved || !order.customer_id)) {
    return (
      <CancelOrderUnavailable message="Исполнитель для этого заказа ещё не назначен. Отмена станет доступна после выбора исполнителя." />
    );
  }

  if (hasExecutorCancellation) {
    return (
      <ExecutorCancelOrderForCustomer
        order={order}
        executorCancel={executorCancel}
        onRefresh={loadCancellationState}
        onCancelResolved={onCancelResolved}
      />
    );
  }

  if (hasCustomerCancellation) {
    return (
      <CustomerCancelOrderForExecutor
        order={order}
        customerCancel={customerCancel}
        onRefresh={loadCancellationState}
        onCancelResolved={onCancelResolved}
      />
    );
  }

  if (loading) {
    return <CancelOrderLoading />;
  }

  return (
    <div className="cancel-tab">
      <article className="cancel-tab__shell">
        <header className="cancel-tab__head">
          <span className="cancel-tab__badge">Отмена</span>
          <h2 className="cancel-tab__title">Отмена заказа № {order.id}</h2>
          <p className="cancel-tab__subtitle">
            Заполните форму — исполнитель получит уведомление и сможет согласиться
            или оспорить отмену
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
              <span className="cancel-tab__label">Причина отмены</span>
              <select
                className="cancel-tab__select"
                value={reasonType}
                onChange={(e) => setReasonType(e.target.value)}
                required
                disabled={isSubmitting}
              >
                <option value="">Выберите причину</option>
                {CUSTOMER_CANCEL_REASON_OPTIONS.map((option) => (
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
                placeholder="Опишите, почему хотите отменить заказ…"
                rows={4}
                required
                maxLength={1000}
                disabled={isSubmitting}
              />
              <span className="cancel-tab__hint">{reasonText.length}/1000</span>
            </label>

            <div className="cancel-tab__notice cancel-tab__notice--info">
              После отправки исполнитель выберет: согласен или не согласен с
              отменой.
            </div>

            <div className="cancel-tab__actions">
              <button
                type="submit"
                className="cancel-tab__btn cancel-tab__btn--danger"
                disabled={!canSubmit}
              >
                {isSubmitting ? "Отправка…" : "Отправить заявку на отмену"}
              </button>
            </div>
          </form>
        </div>
      </article>
    </div>
  );
}
