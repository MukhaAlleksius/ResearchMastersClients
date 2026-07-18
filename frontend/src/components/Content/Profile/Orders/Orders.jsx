import React, { useEffect, useState, useCallback, useMemo } from "react";
import { API, apiFetch, ensureStoredUserId, getStoredUserId } from "../../../../utils/api.js";
import { useLocation, useNavigate } from "react-router-dom";
import AddOrderForDraft from "./CommonComponents/AddOrder/AddOrderForDarft";
import OrderServiceCard from "../Common/OrderServiceCard";
import StatusFilterTabs from "../Common/StatusFilterTabs";
import { dedupeOrdersById } from "../../../../utils/orders.js";
import { getCustomerOrderPresetKey } from "../Common/workDetailTabs";
import "../Services/services.css";
import {
  enrichListItemWithUpdates,
  LIST_ACTIVITY_POLL_MS,
  syncSeenCancelAck,
  syncSeenActivityBaseline,
  syncSeenOnRoleStatusChange,
} from "../../../../utils/orderActivity.js";

const statusTabs = [
  {
    id: "completed",
    label: "Выполненные работы",
    shortLabel: "Выполненные",
    statusKey: "Выполнен",
    hint: "Здесь заказы, по которым работы уже завершены. Можно посмотреть итоги, отчёты и оценки.",
  },
  {
    id: "inProgress",
    label: "В процессе выполнения",
    shortLabel: "В процессе",
    statusKey: "В процессе выполнения",
    hint: "Заказы, по которым исполнитель уже приступил к работам. Следите за ходом выполнения и отчётами.",
  },
  {
    id: "awaiting",
    label: "Ожидают выполнения",
    shortLabel: "Ожидают",
    statusKey: "Ожидают выполнения",
    hint: "Исполнитель выбран, но работы ещё не начались. Заказ ждёт старта выполнения.",
  },
  {
    id: "researchExecutor",
    label: "В поиске исполнителя",
    shortLabel: "Поиск исполнителя",
    statusKey: "В поиске исполнителя",
    hint: "Опубликованные заказы: их видят исполнители и могут откликаться. Выберите подходящее предложение.",
  },
  {
    id: "waitOfferExecutors",
    label: "Не предложенные исполнителям",
    shortLabel: "Черновики",
    statusKey: "Не предложенные исполнителям",
    hint: "Здесь хранятся заказы, которые ещё не предложены исполнителям. Вы можете спокойно заполнить и править данные — заказ никому не виден. Когда всё готово, опубликуйте его: заказ перейдёт в поиск исполнителя.",
  },
  {
    id: "myselfExecutor",
    label: "Самостоятельное выполнение",
    shortLabel: "Самостоятельно",
    statusKey: "Самостоятельное выполнение",
    hint: "Заказы, которые вы выполняете сами, без привлечения исполнителя. Здесь можно вести смету и график работ.",
  },
];

const allTabHint =
  "Все ваши заказы в одном списке. Выберите статус слева, чтобы отфильтровать заказы по этапу.";

export default function Orders() {
  const navigate = useNavigate();
  const location = useLocation();
  const [allOrders, setAllOrders] = useState([]);
  const [ordersByStatus, setOrdersByStatus] = useState({});
  const [addOrder, setAddOrder] = useState(false);
  const [activeStatusTab, setActiveStatusTab] = useState(
    location.state?.activeStatusTab ?? "all",
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [seenRevision, setSeenRevision] = useState(0);

  const [userId, setUserId] = useState(() => getStoredUserId());

  const enrichedOrders = useMemo(
    () =>
      allOrders.map((order) =>
        enrichListItemWithUpdates(
          order,
          userId,
          getCustomerOrderPresetKey(order.status_order_customer),
        ),
      ),
    [allOrders, userId, seenRevision],
  );

  const applyOrdersData = useCallback(
    (data) => {
      const uniqueOrders = dedupeOrdersById(data);
      let seenChanged = false;

      uniqueOrders.forEach((order) => {
        if (userId && order.activity) {
          if (syncSeenCancelAck(userId, order.id, order.activity)) {
            seenChanged = true;
          }
          if (syncSeenActivityBaseline(userId, order.id, order.activity)) {
            seenChanged = true;
          }
          if (
            syncSeenOnRoleStatusChange(
              userId,
              order.id,
              order.activity,
              "customer",
              order.status_order_customer,
            )
          ) {
            seenChanged = true;
          }
        }
      });

      if (seenChanged) {
        setSeenRevision((value) => value + 1);
      }

      setAllOrders(uniqueOrders);

      const byStatus = uniqueOrders.reduce((acc, order) => {
        const status = order.status_order_customer || "Без статуса";
        acc[status] = acc[status] || [];
        acc[status].push(order);
        return acc;
      }, {});

      const statusMap = { ...byStatus };
      statusTabs.forEach((tab) => {
        statusMap[tab.statusKey] = statusMap[tab.statusKey] || [];
      });
      setOrdersByStatus(statusMap);
    },
    [userId],
  );

  const fetchOrdersCustomer = useCallback(
    async ({ silent = false } = {}) => {
      try {
        if (!silent) {
          setLoading(true);
          setError(null);
        }
        const user_id = (await ensureStoredUserId()) ?? userId;
        if (user_id && user_id !== userId) {
          setUserId(user_id);
        }
        if (!user_id) {
          throw new Error("Войдите в аккаунт для просмотра заказов");
        }

        const response = await apiFetch(
          `${API.baseURL}/orders_customer`,
        );
        if (!response.ok)
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);

        const data = await response.json();
        if (!Array.isArray(data)) throw new Error("Получены некорректные данные");

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
    fetchOrdersCustomer();
  }, [fetchOrdersCustomer]);

  useEffect(() => {
    if (location.state?.activeStatusTab) {
      navigate("/profile/orders", { replace: true, state: {} });
    }
  }, [location.state?.activeStatusTab, navigate]);

  useEffect(() => {
    if (addOrder) return undefined;

    const timerId = setInterval(() => {
      fetchOrdersCustomer({ silent: true });
    }, LIST_ACTIVITY_POLL_MS);

    return () => clearInterval(timerId);
  }, [addOrder, fetchOrdersCustomer]);

  const currentOrders = useMemo(() => {
    if (activeStatusTab === "all") return enrichedOrders;
    const statusKey = statusTabs.find(
      (tab) => tab.id === activeStatusTab,
    )?.statusKey;
    return enrichedOrders.filter(
      (order) => (order.status_order_customer || "Без статуса") === statusKey,
    );
  }, [activeStatusTab, enrichedOrders]);

  const getStatusCount = useCallback(
    (statusKey) => ordersByStatus[statusKey]?.length || 0,
    [ordersByStatus],
  );

  const getUpdatesCount = useCallback(
    (statusKey) =>
      enrichedOrders.filter(
        (order) =>
          (order.status_order_customer || "Без статуса") === statusKey &&
          order.updateInfo?.hasUpdates,
      ).length,
    [enrichedOrders],
  );

  const totalUpdatesCount = useMemo(
    () => enrichedOrders.filter((order) => order.updateInfo?.hasUpdates).length,
    [enrichedOrders],
  );

  const activeTabMeta =
    activeStatusTab === "all"
      ? { label: "Все заказы", hint: allTabHint }
      : statusTabs.find((tab) => tab.id === activeStatusTab);

  const handleStatusChange = (tabId) => {
    setActiveStatusTab(tabId);
  };

  const handleDraftOrderCreated = useCallback(
    async () => {
      setAddOrder(false);
      setActiveStatusTab("waitOfferExecutors");
      await fetchOrdersCustomer();
    },
    [fetchOrdersCustomer],
  );

  if (loading) {
    return (
      <div className="list-page">
        <div className="list-loading">
          <div className="list-loading__spinner" aria-hidden="true" />
          <p>Загрузка заказов...</p>
        </div>
      </div>
    );
  }

  if (addOrder) {
    return (
      <div className="list-page">
        <button
          type="button"
          className="btn-list-back"
          onClick={() => setAddOrder(false)}
        >
          ← Назад к заказам
        </button>
        <div className="list-page__content">
          <AddOrderForDraft onSuccess={handleDraftOrderCreated} />
        </div>
      </div>
    );
  }

  return (
    <div className="list-page">
      <header className="list-page__header">
        <div>
          <h2 className="list-page__title">Мои заказы</h2>
          <p className="list-page__subtitle">
            {allOrders.length > 0
              ? `Всего ${allOrders.length} — выберите статус для фильтрации`
              : "Создайте первый заказ"}
          </p>
        </div>
        <button
          type="button"
          className="btn-list-primary"
          onClick={() => setAddOrder(true)}
        >
          + Добавить заказ в черновик
        </button>
      </header>

      {error && (
        <div className="list-alert">
          <p className="list-alert__text">Ошибка загрузки заказов: {error}</p>
          <button
            type="button"
            className="list-alert__retry"
            onClick={fetchOrdersCustomer}
          >
            Попробовать снова
          </button>
        </div>
      )}

      <div className="list-page__body">
        <StatusFilterTabs
          tabs={statusTabs}
          activeId={activeStatusTab}
          onChange={handleStatusChange}
          allTab={{
            id: "all",
            label: "Все заказы",
            count: allOrders.length,
            updatesCount: totalUpdatesCount,
          }}
          getCount={getStatusCount}
          getUpdatesCount={getUpdatesCount}
        />

        <div className="list-page__content">
          {activeTabMeta?.hint && (
            <div className="list-hint" role="note">
              <p className="list-hint__text">{activeTabMeta.hint}</p>
            </div>
          )}
          <div className="services-grid" id="orders-container">
            {currentOrders.length === 0 ? (
              <div className="list-empty">
                <div className="list-empty__icon" aria-hidden="true">
                  📭
                </div>
                <h3 className="list-empty__title">
                  {activeStatusTab === "all"
                    ? "Нет заказов"
                    : activeStatusTab === "waitOfferExecutors"
                      ? "Черновиков пока нет"
                      : `Нет заказов: «${activeTabMeta?.label}»`}
                </h3>
                <p className="list-empty__text">
                  {activeStatusTab === "all"
                    ? "Создайте первый заказ, чтобы начать работу."
                    : activeStatusTab === "waitOfferExecutors"
                      ? "Нажмите «Добавить заказ в черновик», чтобы создать новый заказ."
                      : "Выберите другой статус или создайте новый заказ."}
                </p>
                {(activeStatusTab === "all" ||
                  activeStatusTab === "waitOfferExecutors") && (
                  <button
                    type="button"
                    className="btn-list-primary"
                    onClick={() => setAddOrder(true)}
                  >
                    {activeStatusTab === "waitOfferExecutors"
                      ? "Добавить заказ в черновик"
                      : "Создать заказ"}
                  </button>
                )}
              </div>
            ) : (
              currentOrders.map((order) => (
                <OrderServiceCard
                  key={order.id}
                  item={order}
                  statusLabel={order.status_order_customer}
                  partyLabel="Клиент"
                  partyName={order.customer_name || order.executor_name}
                  updateInfo={order.updateInfo}
                  to={`/profile/orders/${order.id}`}
                  linkState={{ order, fromTab: activeStatusTab }}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
