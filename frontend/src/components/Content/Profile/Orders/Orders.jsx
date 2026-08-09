import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import AddOrderForDraft from "./CommonComponents/AddOrder/AddOrderForDarft";
import OrderServiceCard from "../Common/OrderServiceCard";
import StatusFilterTabs from "../Common/StatusFilterTabs";
import { useCustomerOrdersList } from "../Common/useCustomerOrdersList.js";
import { IconInbox } from "../ProfileIcons.jsx";
import "../Services/services.css";

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
  const [addOrder, setAddOrder] = useState(false);
  const [activeStatusTab, setActiveStatusTab] = useState(
    location.state?.activeStatusTab ?? "all",
  );

  const {
    allOrders,
    currentOrders,
    loading,
    error,
    fetchOrders,
    getStatusCount,
  } = useCustomerOrdersList({
    statusTabs,
    activeStatusTab,
  });

  useEffect(() => {
    if (location.state?.activeStatusTab) {
      navigate("/profile/orders", { replace: true, state: {} });
    }
  }, [location.state?.activeStatusTab, navigate]);

  const activeTabMeta =
    activeStatusTab === "all"
      ? { label: "Все заказы", hint: allTabHint }
      : statusTabs.find((tab) => tab.id === activeStatusTab);

  const handleDraftOrderCreated = async () => {
    setAddOrder(false);
    setActiveStatusTab("waitOfferExecutors");
    await fetchOrders();
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
            {allOrders.length > 0
              ? `Всего ${allOrders.length} — выберите статус для фильтрации`
              : "Создайте первый заказ"}
          </p>
        </div>
        <div className="list-page__actions">
          <button
            type="button"
            className="btn-list-primary btn-list-header"
            onClick={() => navigate("/profile/my_executors")}
          >
            Мои исполнители
          </button>
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
          tabs={statusTabs}
          activeId={activeStatusTab}
          onChange={setActiveStatusTab}
          allTab={{
            id: "all",
            label: "Все заказы",
            count: allOrders.length,
          }}
          getCount={getStatusCount}
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
                  <IconInbox width={28} height={28} />
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
