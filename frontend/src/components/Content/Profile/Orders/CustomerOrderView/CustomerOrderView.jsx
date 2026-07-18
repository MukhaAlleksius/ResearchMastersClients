import React, { useCallback, useEffect, useMemo, useState } from "react";
import { API, apiFetch } from "../../../../../utils/api.js";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import DraftOrder from "../Draft/DraftOrder";
import ExecutedOrder from "../Executed/ExecutedOrder";
import InProgressExecuteOrder from "../InProgressExecute/InProgressExecuteOrder";
import MyselfExecutor from "../MyselfExecutor/MyselfExecutor";
import ResearchExecutor from "../ResearchExecutors/ResearchExecutorsOrder";
import WaitExecuteOrder from "../WaitExecute/WaitExecuteOrder";
import {
  syncSeenActivityBaseline,
  syncSeenCancelAck,
  syncSeenOnRoleStatusChange,
} from "../../../../../utils/orderActivity.js";

function matchesStatus(order, fragment) {
  return order?.status_order_customer?.includes(fragment);
}

export default function CustomerOrderView() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const userId = useMemo(
    () => parseInt(localStorage.getItem("user_id"), 10) || null,
    [],
  );

  const [order, setOrder] = useState(location.state?.order ?? null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchOrder = useCallback(async () => {
    if (!userId || !orderId) {
      setError("Не удалось определить заказ");
      setLoading(false);
      return;
    }

    try {
      setError(null);

      const response = await apiFetch(`${API.baseURL}/orders_customer`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (!Array.isArray(data)) {
        throw new Error("Получены некорректные данные");
      }

      const found = data.find((item) => String(item.id) === String(orderId));
      if (!found) {
        setError("Заказ не найден");
        setOrder(null);
        return;
      }

      if (found.activity) {
        syncSeenCancelAck(userId, found.id, found.activity);
        syncSeenActivityBaseline(userId, found.id, found.activity);
        syncSeenOnRoleStatusChange(
          userId,
          found.id,
          found.activity,
          "customer",
          found.status_order_customer,
        );
      }

      setOrder(found);
    } catch (err) {
      console.error("Ошибка загрузки заказа:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [userId, orderId]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  const handleBack = useCallback(() => {
    navigate("/profile/orders", {
      state: { activeStatusTab: location.state?.fromTab ?? "all" },
    });
  }, [navigate, location.state?.fromTab]);

  const handleOrderUpdated = useCallback((updatedOrder) => {
    setOrder((prev) => ({
      ...updatedOrder,
      status_order_customer:
        updatedOrder.status_order_customer ?? prev?.status_order_customer,
    }));
    fetchOrder();
  }, [fetchOrder]);

  const handleOrderDeleted = useCallback(() => {
    handleBack();
  }, [handleBack]);

  const backProps = {
    onBack: handleBack,
    onOrderDeleted: handleOrderDeleted,
    onOrderStatusChanged: fetchOrder,
    userId,
    listActivity: order?.activity,
  };

  if (loading && !order) {
    return (
      <div className="list-page">
        <button type="button" className="btn-list-back" onClick={handleBack}>
          ← Назад к заказам
        </button>
        <div className="list-loading">
          <div className="list-loading__spinner" aria-hidden="true" />
          <p>Загрузка заказа...</p>
        </div>
      </div>
    );
  }

  if (error && !order) {
    return (
      <div className="list-page">
        <button type="button" className="btn-list-back" onClick={handleBack}>
          ← Назад к заказам
        </button>
        <div className="list-alert">
          <p className="list-alert__text">{error}</p>
          <button type="button" className="list-alert__retry" onClick={fetchOrder}>
            Попробовать снова
          </button>
        </div>
      </div>
    );
  }

  if (!order) {
    return null;
  }

  return (
    <div className="list-page">
      {matchesStatus(order, "Не предложенные исполнителям") && (
        <DraftOrder
          order={order}
          {...backProps}
          onOrderUpdated={handleOrderUpdated}
        />
      )}
      {matchesStatus(order, "В поиске исполнителя") && (
        <ResearchExecutor
          order={order}
          {...backProps}
          onOrderUpdated={(updatedOrder) => {
            setOrder(updatedOrder);
            fetchOrder();
          }}
        />
      )}
      {matchesStatus(order, "Ожидают выполнения") && (
        <WaitExecuteOrder order={order} {...backProps} />
      )}
      {matchesStatus(order, "В процессе выполнения") && (
        <InProgressExecuteOrder order={order} {...backProps} />
      )}
      {matchesStatus(order, "Самостоятельное выполнение") && (
        <MyselfExecutor
          order={order}
          {...backProps}
          onOrderUpdated={handleOrderUpdated}
        />
      )}
      {matchesStatus(order, "Выполнен") && (
        <ExecutedOrder order={order} {...backProps} />
      )}
      {!matchesStatus(order, "Не предложенные исполнителям") &&
        !matchesStatus(order, "В поиске исполнителя") &&
        !matchesStatus(order, "Ожидают выполнения") &&
        !matchesStatus(order, "В процессе выполнения") &&
        !matchesStatus(order, "Самостоятельное выполнение") &&
        !matchesStatus(order, "Выполнен") && (
          <div className="list-alert">
            <p className="list-alert__text">
              Неизвестный статус заказа: {order.status_order_customer || "—"}
            </p>
            <button type="button" className="list-alert__retry" onClick={handleBack}>
              Вернуться к списку
            </button>
          </div>
        )}
    </div>
  );
}
