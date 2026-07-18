import React, { useCallback, useEffect, useState } from "react";
import { API, apiFetch } from "../../../../../../utils/api.js";
import ExecutorResponseDisplay from "./ExecutorResponseDisplay";
import { OrderDetailsGrid, OrderInfoEmpty } from "./OrderInfoContent";
import "./customer_order_info.css";
/**
 * Просмотр заказа исполнителем с подвкладками «Детали заказа» и «Мой ответ» (только чтение).
 */
export default function OrderInfoWithMyResponse({
  order,
  embedded = false,
  footer,
}) {
  const [activeTab, setActiveTab] = useState("order");
  const [executorResponse, setExecutorResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const executorId = localStorage.getItem("user_id");
  const orderId = order?.id;

  const fetchMyResponse = useCallback(async () => {
    if (!executorId || !orderId) {
      setExecutorResponse(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await apiFetch(
        `${API.baseURL}/order_response_executor/${executorId}/${orderId}`,
      );

      if (response.status === 404 || response.status === 409) {
        setExecutorResponse(null);
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      setExecutorResponse(await response.json());
    } catch (err) {
      console.error("Ошибка загрузки ответа исполнителя:", err);
      setError("Не удалось загрузить ваш ответ");
      setExecutorResponse(null);
    } finally {
      setLoading(false);
    }
  }, [executorId, orderId]);

  useEffect(() => {
    fetchMyResponse();
  }, [fetchMyResponse]);

  if (!order) {
    return (
      <OrderInfoEmpty message="Загрузите заказ или выберите услугу из списка" />
    );
  }

  const { id, title, category_work } = order;

  return (
    <div
      className={`order-info ${embedded ? "order-info--embedded" : ""}`.trim()}
    >
      <article className="order-info__shell">
        {!embedded && (
          <header className="order-info__hero">
            <span className="order-info__badge">Заказ</span>
            <h2 className="order-info__title">{title || `Заказ #${id}`}</h2>
            <p className="order-info__subtitle">
              {category_work ? `${category_work} · ` : ""}№{id}
            </p>
          </header>
        )}

        <nav className="order-info__tabs" aria-label="Разделы заказа">
          <button
            type="button"
            className={`order-info__tab ${activeTab === "order" ? "order-info__tab--active" : ""}`}
            onClick={() => setActiveTab("order")}
          >
            Детали заказа
          </button>
          <button
            type="button"
            className={`order-info__tab ${activeTab === "response" ? "order-info__tab--active" : ""}`}
            onClick={() => setActiveTab("response")}
          >
            Мой ответ
          </button>
        </nav>

        {activeTab === "order" && (
          <>
            <OrderDetailsGrid order={order} embedded={embedded} />
            {footer && <div className="order-info__footer">{footer}</div>}
          </>
        )}

        {activeTab === "response" && (
          <div className="order-info__panel">
            {loading ? (
              <p className="order-info__loading">Загрузка ответа…</p>
            ) : error ? (
              <p className="order-info__response-empty">{error}</p>
            ) : executorResponse ? (
              <ExecutorResponseDisplay
                response={executorResponse}
                title="Ваше предложение"
                showExecutorName={false}
              />
            ) : (
              <p className="order-info__response-empty">
                Ответ на этот заказ не найден или был удалён.
              </p>
            )}
          </div>
        )}
      </article>
    </div>
  );
}
