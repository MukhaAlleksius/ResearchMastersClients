import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  API,
  apiFetch,
  ensureStoredUserId,
  getStoredUserId,
} from "../../../../utils/api.js";
import {
  dedupeOrdersById,
  getCustomerOrderCardCue,
  getCustomerOrderStatusLabel,
} from "../../../../utils/orders.js";
import AddOrderForDraft from "./CommonComponents/AddOrder/AddOrderForDarft";
import OrderServiceCard from "../Common/OrderServiceCard";
import StatusFilterTabs from "../Common/StatusFilterTabs";
import { IconInbox } from "../ProfileIcons.jsx";
import "../Services/services.css";

const statusTabs = [
  {
    id: "waitOfferExecutors",
    label: "Не предложенные исполнителям",
    shortLabel: "Черновики",
    statusKey: "Не предложенные исполнителям",
    hint: "Здесь хранятся заказы, которые ещё не предложены исполнителям. Вы можете спокойно заполнить и править данные — заказ никому не виден. Когда всё готово, опубликуйте его: заказ перейдёт в поиск исполнителя.",
  },
  {
    id: "researchExecutor",
    label: "В поиске исполнителя",
    shortLabel: "Поиск исполнителя",
    statusKey: "В поиске исполнителя",
    hint: "Опубликованные заказы: их видят исполнители и могут откликаться. Выберите подходящее предложение.",
  },
  {
    id: "awaiting",
    label: "Ожидают выполнения",
    shortLabel: "Ожидают",
    statusKey: "Ожидают выполнения",
    hint: "Исполнитель выбран, но работы ещё не начались. Заказ ждёт старта выполнения.",
  },
  {
    id: "inProgress",
    label: "В процессе выполнения",
    shortLabel: "В процессе",
    statusKey: "В процессе выполнения",
    hint: "Заказы, по которым исполнитель уже приступил к работам. Следите за ходом выполнения и отчётами.",
  },
  {
    id: "completed",
    label: "Выполненные работы",
    shortLabel: "Выполненные",
    statusKey: "Выполнен",
    hint: "Здесь заказы, по которым работы уже завершены. Можно посмотреть итоги, отчёты и оценки.",
  },
  {
    id: "refusedFromOrder",
    label: "Отказ",
    shortLabel: "Отказ",
    statusKey: "Отказано заказчиком",
    hint: "Вы отказались от исполнителя. Заказ не виден в поиске. Переведите его в черновик, при необходимости поправьте данные и снова опубликуйте.",
  },
  {
    id: "refusedByCustomer",
    label: "Отказано",
    shortLabel: "Отказано",
    statusKey: "Отказ от заказа",
    hint: "Исполнитель отказался от заказа. Заказ не виден в поиске. Переведите его в черновик, при необходимости поправьте данные и снова опубликуйте.",
  },
];

/** Черновики видны всегда: сюда сохраняется новый заказ, даже если список пуст. */
const ALWAYS_VISIBLE_TAB_IDS = new Set(["waitOfferExecutors"]);

const SELF_TAB_ID = "myselfExecutor";
const SELF_STATUS = "Самостоятельное выполнение";

function isSelfOrder(order) {
  return (order?.status_order_customer || "").includes(SELF_STATUS);
}

const allTabHint = [
  "Здесь заказы, для которых вы ищете исполнителя, и те, которые мастер уже выполняет.",
  "Выберите статус слева, чтобы оставить заказы одного этапа.",
];

const selfTabHint =
  "Эти заказы вы ведёте сами: смета и журнал работ. Чтобы снова искать мастера, верните заказ в черновик.";

export default function Orders() {
  const navigate = useNavigate();
  const location = useLocation();
  const [addOrder, setAddOrder] = useState(false);
  const [allOrders, setAllOrders] = useState([]);
  const [ordersByStatus, setOrdersByStatus] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userId, setUserId] = useState(() => getStoredUserId());
  const [executorCount, setExecutorCount] = useState(0);
  const [activeStatusTab, setActiveStatusTab] = useState(
    location.state?.activeStatusTab ?? "all",
  );

  const applyOrdersData = useCallback((data) => {
    const uniqueOrders = dedupeOrdersById(data);
    setAllOrders(uniqueOrders);

    const byStatus = uniqueOrders.reduce((acc, order) => {
      const status = order.status_order_customer || "Без статуса";
      (acc[status] ||= []).push(order);
      return acc;
    }, {});

    const statusMap = { ...byStatus };
    statusTabs.forEach((tab) => {
      statusMap[tab.statusKey] = statusMap[tab.statusKey] || [];
    });
    setOrdersByStatus(statusMap);
  }, []);

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

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const response = await apiFetch(
          `${API.baseURL}/customer_executors/${userId}`,
        );
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled) {
          setExecutorCount(Array.isArray(data) ? data.length : 0);
        }
      } catch (err) {
        console.error("Ошибка загрузки исполнителей:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (location.state?.activeStatusTab) {
      navigate("/profile/orders", { replace: true, state: {} });
    }
  }, [location.state?.activeStatusTab, navigate]);

  const getStatusCount = useCallback(
    (statusKey) => ordersByStatus[statusKey]?.length || 0,
    [ordersByStatus],
  );

  const visibleStatusTabs = useMemo(
    () =>
      statusTabs.filter(
        (tab) =>
          ALWAYS_VISIBLE_TAB_IDS.has(tab.id) || getStatusCount(tab.statusKey) > 0,
      ),
    [getStatusCount],
  );

  const dealOrders = useMemo(
    () => allOrders.filter((order) => !isSelfOrder(order)),
    [allOrders],
  );
  const selfOrders = useMemo(
    () => allOrders.filter(isSelfOrder),
    [allOrders],
  );

  const visibleActiveStatusTab =
    activeStatusTab === SELF_TAB_ID && selfOrders.length > 0
      ? SELF_TAB_ID
      : visibleStatusTabs.some((tab) => tab.id === activeStatusTab)
        ? activeStatusTab
        : "all";

  const activeTabMeta =
    visibleActiveStatusTab === "all"
      ? { label: "Все заказы", hint: allTabHint }
      : visibleActiveStatusTab === SELF_TAB_ID
        ? { label: "Веду сам", hint: selfTabHint }
        : statusTabs.find((tab) => tab.id === visibleActiveStatusTab);

  const currentOrders = useMemo(() => {
    if (visibleActiveStatusTab === SELF_TAB_ID) return selfOrders;
    if (visibleActiveStatusTab === "all") return dealOrders;
    const statusKey = statusTabs.find(
      (tab) => tab.id === visibleActiveStatusTab,
    )?.statusKey;
    return dealOrders.filter(
      (order) => (order.status_order_customer || "Без статуса") === statusKey,
    );
  }, [visibleActiveStatusTab, dealOrders, selfOrders]);

  useEffect(() => {
    if (loading) return;
    if (activeStatusTab === SELF_TAB_ID) {
      if (selfOrders.length === 0) setActiveStatusTab("all");
      return;
    }
    if (activeStatusTab === "all") return;
    if (visibleStatusTabs.some((tab) => tab.id === activeStatusTab)) return;
    setActiveStatusTab("all");
  }, [loading, activeStatusTab, visibleStatusTabs, selfOrders.length]);

  const handleDraftOrderCreated = async (createdOrder) => {
    setAddOrder(false);
    setActiveStatusTab("waitOfferExecutors");
    await fetchOrders();
    if (createdOrder?.id) {
      navigate("/profile/orders", {
        replace: true,
        state: { highlightOrderId: createdOrder.id },
      });
    }
  };

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
            {allOrders.length === 0
              ? "Создайте первый заказ"
              : dealOrders.length > 0
                ? `Всего ${dealOrders.length} — выберите статус для фильтрации`
                : "Эти заказы вы ведёте сами"}
          </p>
          {executorCount > 0 && (
            <Link to="/profile/my_executors" className="list-page__quiet-link">
              Мои исполнители
              <span className="list-page__quiet-count">{executorCount}</span>
            </Link>
          )}
        </div>
        <div className="list-page__actions">
          <button
            type="button"
            className="btn-list-primary btn-list-header"
            onClick={() => setAddOrder(true)}
          >
            + Добавить заказ в черновик
          </button>
        </div>
      </header>

      {error && (
        <div className="list-alert">
          <p className="list-alert__text">Ошибка загрузки заказов: {error}</p>
          <button
            type="button"
            className="list-alert__retry"
            onClick={fetchOrders}
          >
            Попробовать снова
          </button>
        </div>
      )}

      <div className="list-page__body">
        <StatusFilterTabs
          tabs={visibleStatusTabs}
          activeId={visibleActiveStatusTab}
          onChange={setActiveStatusTab}
          allTab={{
            id: "all",
            label: "Все заказы",
            count: dealOrders.length,
          }}
          getCount={getStatusCount}
          aside={
            selfOrders.length > 0
              ? {
                  heading: "Веду сам",
                  id: SELF_TAB_ID,
                  label: "Веду сам",
                  count: selfOrders.length,
                }
              : null
          }
        />

        <div className="list-page__content">
          {activeTabMeta?.hint && (
            <div className="list-hint" role="note">
              {(Array.isArray(activeTabMeta.hint)
                ? activeTabMeta.hint
                : [activeTabMeta.hint]
              ).map((paragraph) => (
                <p key={paragraph} className="list-hint__text">
                  {paragraph}
                </p>
              ))}
            </div>
          )}
          <div className="services-grid" id="orders-container">
            {currentOrders.length === 0 ? (
              <div className="list-empty">
                <div className="list-empty__icon" aria-hidden="true">
                  <IconInbox width={28} height={28} />
                </div>
                <h3 className="list-empty__title">
                  {visibleActiveStatusTab === "all"
                    ? selfOrders.length > 0
                      ? "Заказов с мастером нет"
                      : "Нет заказов"
                    : visibleActiveStatusTab === "waitOfferExecutors"
                      ? "Черновиков пока нет"
                      : `Нет заказов: «${activeTabMeta?.label}»`}
                </h3>
                <p className="list-empty__text">
                  {visibleActiveStatusTab === "all"
                    ? selfOrders.length > 0
                      ? "Заказы, которые вы ведёте сами, собраны в блоке «Веду сам»."
                      : "Создайте первый заказ, чтобы начать работу."
                    : visibleActiveStatusTab === "waitOfferExecutors"
                      ? "Нажмите «Добавить заказ в черновик», чтобы создать новый заказ."
                      : "Выберите другой статус или создайте новый заказ."}
                </p>
                {((visibleActiveStatusTab === "all" &&
                  selfOrders.length === 0) ||
                  visibleActiveStatusTab === "waitOfferExecutors") && (
                  <button
                    type="button"
                    className="btn-list-primary"
                    onClick={() => setAddOrder(true)}
                  >
                    {visibleActiveStatusTab === "waitOfferExecutors"
                      ? "Добавить заказ в черновик"
                      : "Создать заказ"}
                  </button>
                )}
              </div>
            ) : (
              currentOrders.map((order) => {
                const cue = getCustomerOrderCardCue(order);
                return (
                  <OrderServiceCard
                    key={order.id}
                    item={order}
                    statusLabel={getCustomerOrderStatusLabel(
                      order.status_order_customer,
                    )}
                    detail={cue.detail}
                    partyName={cue.person}
                    to={`/profile/orders/${order.id}`}
                    linkState={{ order, fromTab: visibleActiveStatusTab }}
                    highlighted={
                      Number(order.id) ===
                      Number(location.state?.highlightOrderId)
                    }
                  />
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
