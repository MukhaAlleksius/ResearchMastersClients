import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { API, apiFetch, buildApiUrl, readApiError } from "../../../../../../utils/api.js";
import { getExecutorProfileLink } from "../../../../../../utils/executorProfile";
import ExecutorResponseDisplay, {
  getExecutorDisplayName,
} from "../../../Services/CommonComponent/CustomerOrderInfo/ExecutorResponseDisplay";
import "../../../Services/CommonComponent/CustomerOrderInfo/customer_order_info.css";
import "./order_responses_executors.css";

const OrderResponsesExecutors = ({ order, onReject, onAcceptSuccess }) => {
  const [orderResponsesExecutors, setOrderResponsesExecutors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [acceptingId, setAcceptingId] = useState(null);

  const fetchOrderResponsesExecutors = useCallback(async () => {
    if (!order?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await apiFetch(
        buildApiUrl(`/order_responses_executors/${order.id}`),
      );

      if (response.status === 404 || response.status === 409) {
        setOrderResponsesExecutors([]);
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      setOrderResponsesExecutors(Array.isArray(data) ? data : data ? [data] : []);
    } catch (err) {
      console.error(err);
      setError("Не удалось загрузить отклики исполнителей");
      setOrderResponsesExecutors([]);
    } finally {
      setLoading(false);
    }
  }, [order?.id]);

  useEffect(() => {
    fetchOrderResponsesExecutors();
  }, [fetchOrderResponsesExecutors]);

  const handleAccept = async (executorId) => {
    if (!order?.id || acceptingId) return;

    setAcceptingId(executorId);

    try {
      const customerId = localStorage.getItem("user_id");

      const responseExecutorOrder = await apiFetch(
        buildApiUrl("/add_executor_order"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order_id: order.id,
            executor_id: executorId,
          }),
        },
      );

      const [responseCustomer, responseExecutor] = await Promise.all([
        apiFetch(buildApiUrl("/add_status_order_customer"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order_id: order.id,
            customer_id: customerId,
            status: "Ожидают выполнения",
          }),
        }),
        apiFetch(buildApiUrl("/add_status_order_executor"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order_id: order.id,
            executor_id: executorId,
            status: "Ожидают выполнения",
          }),
        }),
      ]);

      if (
        !responseExecutorOrder.ok ||
        !responseCustomer.ok ||
        !responseExecutor.ok
      ) {
        const details = await Promise.all([
          readApiError(responseExecutorOrder),
          readApiError(responseCustomer),
          readApiError(responseExecutor),
        ]);
        throw new Error(
          details.filter(Boolean).join("; ") ||
            "Ошибка сервера при принятии предложения",
        );
      }

      setOrderResponsesExecutors([]);
      onAcceptSuccess?.(executorId);
    } catch (acceptError) {
      console.error("Ошибка принятия:", acceptError);
      alert(acceptError.message || "Ошибка при принятии предложения");
    } finally {
      setAcceptingId(null);
    }
  };

  if (loading) {
    return (
      <div className="order-responses order-responses--loading">
        <div className="order-responses__spinner" aria-hidden="true" />
        <p>Загрузка откликов…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="order-responses">
        <div className="order-responses__alert" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="order-responses__retry"
            onClick={fetchOrderResponsesExecutors}
          >
            Попробовать снова
          </button>
        </div>
      </div>
    );
  }

  if (orderResponsesExecutors.length === 0) {
    return (
      <div className="order-responses">
        <div className="order-responses__empty">
          <span className="order-responses__empty-icon" aria-hidden="true">
            ↩
          </span>
          <h3 className="order-responses__empty-title">
            Нет ответов от исполнителей
          </h3>
          <p className="order-responses__empty-text">
            Когда исполнители откликнутся на заказ, их предложения появятся
            здесь — с ценой, сроками и комментарием.
          </p>
          <button
            type="button"
            className="order-responses__retry"
            onClick={fetchOrderResponsesExecutors}
          >
            Обновить
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="order-responses">
      <header className="order-responses__header">
        <div>
          <h2 className="order-responses__title">Отклики исполнителей</h2>
          <p className="order-responses__subtitle">
            Сравните предложения и выберите подходящего мастера
          </p>
        </div>
        <span className="order-responses__count">
          {orderResponsesExecutors.length}
        </span>
      </header>

      <ul className="order-responses__list">
        {orderResponsesExecutors.map((response, index) => {
          const executorLabel = getExecutorDisplayName(response.executor_name);
          const isAccepting = acceptingId === response.executor_id;
          const profileLink = getExecutorProfileLink(
            response.executor_id,
            response.executor_name,
          );

          return (
            <li
              className="order-responses__item"
              key={response.id || `${response.executor_id}-${index}`}
            >
              <article className="order-responses__card">
                <div className="order-responses__card-head">
                  <span className="order-responses__avatar" aria-hidden="true">
                    {executorLabel.charAt(0).toUpperCase()}
                  </span>
                  <div className="order-responses__card-meta">
                    <h3 className="order-responses__executor-name">
                      {profileLink ? (
                        <Link
                          to={profileLink.pathname}
                          state={profileLink.state}
                          className="order-responses__executor-link"
                        >
                          {executorLabel}
                        </Link>
                      ) : (
                        executorLabel
                      )}
                    </h3>
                    {profileLink && (
                      <Link
                        to={profileLink.pathname}
                        state={profileLink.state}
                        className="order-responses__profile-link"
                      >
                        Профиль исполнителя
                      </Link>
                    )}
                    {response.id && (
                      <p className="order-responses__response-id">
                        Отклик №{response.id}
                      </p>
                    )}
                  </div>
                </div>

                <ExecutorResponseDisplay
                  response={response}
                  title="Условия предложения"
                  showExecutorName={false}
                  variant="compact"
                />

                <div className="order-responses__actions">
                  <button
                    type="button"
                    className="order-responses__btn order-responses__btn--accept"
                    onClick={() => handleAccept(response.executor_id)}
                    disabled={Boolean(acceptingId)}
                  >
                    {isAccepting ? "Принимаем…" : "Принять предложение"}
                  </button>

                  {onReject && (
                    <button
                      type="button"
                      className="order-responses__btn order-responses__btn--reject"
                      onClick={() => onReject(response)}
                      disabled={Boolean(acceptingId)}
                    >
                      Отклонить
                    </button>
                  )}
                </div>
              </article>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default OrderResponsesExecutors;
