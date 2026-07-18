import React, { useState, useEffect, useCallback } from "react";
import { API, apiFetch } from "../../../../../utils/api.js";
import CustomerOrderInfo from "../CommonComponents/CustomerOrderInfo/CustomerOrderInfo";
import "../../Services/services.css";
export default function DraftOrder({
  order,
  onBack,
  onOrderUpdated,
  onOrderDeleted,
}) {
  const [orderCustomer, setOrderCustomer] = useState(order || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const orderId = order?.id;

  const fetchOrderCustomer = useCallback(async () => {
    if (!orderId) {
      setError("ID заказа не найден");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await apiFetch(`${API.baseURL}/order/${orderId}`);
      if (!response.ok) throw new Error(`Ошибка ${response.status}`);

      setOrderCustomer({
        ...(await response.json()),
        status_order_customer: order?.status_order_customer,
      });
    } catch (err) {
      console.error("Ошибка загрузки черновика:", err);
      setError(err.message);
      setOrderCustomer(order || null);
    } finally {
      setLoading(false);
    }
  }, [order, orderId]);

  useEffect(() => {
    fetchOrderCustomer();
  }, [fetchOrderCustomer]);

  const handleOrderUpdated = (updatedOrder) => {
    const merged = {
      ...updatedOrder,
      status_order_customer:
        updatedOrder.status_order_customer ?? order?.status_order_customer,
    };
    setOrderCustomer(merged);
    onOrderUpdated?.(merged);
  };

  return (
    <>
      <button type="button" className="btn-list-back" onClick={onBack}>
        ← Назад к заказам
      </button>

      {loading && (
        <div className="list-loading">
          <div className="list-loading__spinner" aria-hidden="true" />
          <p>Загрузка заказа...</p>
        </div>
      )}

      {error && !loading && (
        <div className="list-alert">
          <p className="list-alert__text">Ошибка загрузки заказа: {error}</p>
          <button
            type="button"
            className="list-alert__retry"
            onClick={fetchOrderCustomer}
          >
            Попробовать снова
          </button>
        </div>
      )}

      {!loading && orderCustomer && (
        <div className="list-page__content">
          <CustomerOrderInfo
            order={orderCustomer}
            onOrderUpdated={handleOrderUpdated}
            onOrderDeleted={onOrderDeleted || onBack}
          />
        </div>
      )}
    </>
  );
}
