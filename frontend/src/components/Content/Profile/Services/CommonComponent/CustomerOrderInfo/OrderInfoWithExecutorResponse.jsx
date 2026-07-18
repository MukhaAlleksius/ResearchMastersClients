import React, { useCallback, useEffect, useState } from "react";
import { fetchOrderExecutorResponse } from "../../../../../../utils/api.js";
import ExecutorResponseDisplay from "./ExecutorResponseDisplay";
import { OrderDetailsGrid, OrderInfoEmpty } from "./OrderInfoContent";
import "./customer_order_info.css";
export default function OrderInfoWithExecutorResponse({
  order,
  executorId,
  executorResponse: executorResponseProp,
  embedded = false,
  footer,
  showExecutorResponseTab = false,
}) {
  const [activeTab, setActiveTab] = useState("order");
  const [executorResponse, setExecutorResponse] = useState(
    executorResponseProp ?? null,
  );
  const [loading, setLoading] = useState(
    !executorResponseProp && Boolean(executorId && order?.id),
  );
  const [error, setError] = useState(null);

  const orderId = order?.id;

  const fetchExecutorResponse = useCallback(async () => {
    if (!executorId || !orderId) {
      setExecutorResponse(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setExecutorResponse(
        await fetchOrderExecutorResponse(executorId, orderId),
      );
    } catch (err) {
      console.error("Ошибка загрузки ответа исполнителя:", err);
      setError("Не удалось загрузить ответ исполнителя");
      setExecutorResponse(null);
    } finally {
      setLoading(false);
    }
  }, [executorId, orderId]);

  useEffect(() => {
    if (executorResponseProp !== undefined) {
      setExecutorResponse(executorResponseProp);
      setLoading(false);
      return;
    }

    fetchExecutorResponse();
  }, [executorResponseProp, fetchExecutorResponse]);

  if (!order) {
    return (
      <OrderInfoEmpty message="Загрузите заказ или выберите заказ из списка" />
    );
  }

  const { id, title, category_work } = order;
  const hasResponse = Boolean(executorResponse);
  const canShowResponseTab = showExecutorResponseTab || hasResponse || loading;

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

          {canShowResponseTab && (
            <button
              type="button"
              className={`order-info__tab ${activeTab === "response" ? "order-info__tab--active" : ""}`}
              onClick={() => setActiveTab("response")}
            >
              Ответ исполнителя
            </button>
          )}
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
            ) : hasResponse ? (
              <ExecutorResponseDisplay
                response={executorResponse}
                title="Предложение исполнителя"
              />
            ) : !executorId ? (
              <p className="order-info__response-empty">
                Исполнитель ещё не назначен на этот заказ.
              </p>
            ) : (
              <p className="order-info__response-empty">
                Ответ исполнителя для этого заказа не найден.
              </p>
            )}
          </div>
        )}
      </article>
    </div>
  );
}
