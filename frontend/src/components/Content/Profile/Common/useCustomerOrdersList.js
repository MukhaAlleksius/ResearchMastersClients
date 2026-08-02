import { useCallback, useEffect, useMemo, useState } from "react";
import {
  API,
  apiFetch,
  ensureStoredUserId,
  getStoredUserId,
} from "../../../../utils/api.js";
import { dedupeOrdersById } from "../../../../utils/orders.js";

/**
 * Загрузка списка заказов заказчика.
 * UI (вкладки/карточки) остаётся в Orders.jsx.
 */
export function useCustomerOrdersList({
  statusTabs,
  activeStatusTab,
} = {}) {
  const [allOrders, setAllOrders] = useState([]);
  const [ordersByStatus, setOrdersByStatus] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userId, setUserId] = useState(() => getStoredUserId());

  const applyOrdersData = useCallback(
    (data) => {
      const uniqueOrders = dedupeOrdersById(data);
      setAllOrders(uniqueOrders);

      const byStatus = uniqueOrders.reduce((acc, order) => {
        const status = order.status_order_customer || "Без статуса";
        (acc[status] ||= []).push(order);
        return acc;
      }, {});

      const statusMap = { ...byStatus };
      (statusTabs || []).forEach((tab) => {
        statusMap[tab.statusKey] = statusMap[tab.statusKey] || [];
      });
      setOrdersByStatus(statusMap);
    },
    [statusTabs],
  );

  const fetchOrders = useCallback(
    async ({ silent = false } = {}) => {
      try {
        if (!silent) {
          setLoading(true);
          setError(null);
        }
        const resolvedId = (await ensureStoredUserId()) ?? userId;
        if (resolvedId && resolvedId !== userId) {
          setUserId(resolvedId);
        }
        if (!resolvedId) {
          throw new Error("Войдите в аккаунт для просмотра заказов");
        }

        const response = await apiFetch(`${API.baseURL}/orders_customer`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        if (!Array.isArray(data)) {
          throw new Error("Получены некорректные данные");
        }

        applyOrdersData(data);
      } catch (err) {
        console.error("Ошибка загрузки заказов:", err);
        if (!silent) setError(err.message);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [applyOrdersData, userId],
  );

  useEffect(() => {
    if (userId) return;
    ensureStoredUserId().then((id) => {
      if (id) setUserId(id);
    });
  }, [userId]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const currentOrders = useMemo(() => {
    if (activeStatusTab === "all") return allOrders;
    const statusKey = statusTabs?.find(
      (tab) => tab.id === activeStatusTab,
    )?.statusKey;
    return allOrders.filter(
      (order) => (order.status_order_customer || "Без статуса") === statusKey,
    );
  }, [activeStatusTab, allOrders, statusTabs]);

  const getStatusCount = useCallback(
    (statusKey) => ordersByStatus[statusKey]?.length || 0,
    [ordersByStatus],
  );

  return {
    userId,
    allOrders,
    currentOrders,
    loading,
    error,
    fetchOrders,
    getStatusCount,
  };
}
