import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { API, apiFetch, ensureStoredUserId, getStoredUserId } from "../../../../utils/api.js";
import { useLocation, useNavigate } from "react-router-dom";
import ConsiderationCustomer from "./ConsiderationCustomer/ConsiderationCustomer";
import ContinueExecuteWorkServiceInfo from "./ContinueExecuteWork/ContinueExecuteWork";
import ExecuteWorkServiceInfo from "./ExecuteWork/ExecuteWork";
import ExecutorOrdersSchedule from "./GraphicOrders/GraphicOrders";
import OfferCustomer from "./OfferCustomer/OfferCustomer";
import OrderServiceCard from "../Common/OrderServiceCard";
import RefusedByCustomerWork from "./RefusedByCustomer/RefusedByCustomerWork";
import StatusFilterTabs from "../Common/StatusFilterTabs";
import WaitExecuteWorkServiceInfo from "./WaitExecuteWork/WaitExecuteWork";
import { getExecutorServicePresetKey } from "../Common/workDetailTabs";
import "./services.css";
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
    hint: "Здесь услуги, по которым работы уже завершены. Можно посмотреть итоги, отчёты и оценки заказчика.",
  },
  {
    id: "inProgress",
    label: "В процессе выполнения",
    shortLabel: "В процессе",
    statusKey: "В процессе выполнения",
    hint: "Заказы, по которым вы уже приступили к работам. Ведите отчёты и следите за графиком выполнения.",
  },
  {
    id: "awaiting",
    label: "Ожидают выполнения",
    shortLabel: "Ожидают",
    statusKey: "Ожидают выполнения",
    hint: "Заказчик принял ваше предложение, но работы ещё не начались. Заказ ждёт старта выполнения.",
  },
  {
    id: "considerationCustomer",
    label: "На рассмотрении заказчика",
    shortLabel: "На рассмотрении",
    statusKey: "На рассмотрении заказчика",
    hint: "Вы откликнулись на заказ — предложение ждёт решения заказчика. Пока можно уточнять детали.",
  },
  {
    id: "offersCustomers",
    label: "Предложения заказчиков",
    shortLabel: "Предложения",
    statusKey: "Предложения заказчиков",
    hint: "Заказы, на которые можно откликнуться. Изучите условия и отправьте предложение заказчику.",
  },
  {
    id: "refusedByCustomer",
    label: "Отказано заказчиком",
    shortLabel: "Отказано",
    statusKey: "Отказано заказчиком",
    hint: "Заказчик отклонил ваше предложение или отказался от сотрудничества по этому заказу.",
  },
  {
    id: "refusedFromOrder",
    label: "Отказ от заказа",
    shortLabel: "Отказ",
    statusKey: "Отказ от заказа",
    hint: "Заказы, от которых вы отказались. Здесь хранится история таких отказов.",
  },
  {
    id: "graphicOrders",
    label: "График заказов",
    shortLabel: "График",
    statusKey: "График работ",
    hint: "Общий график ваших заказов: сроки, этапы и загрузка по работам в одном месте.",
  },
];

const allTabHint =
  "Все ваши услуги в одном списке. Выберите статус слева, чтобы отфильтровать заказы по этапу.";

const isSelfExecutionService = (service) =>
  (service?.status_service_executor || "").includes("Самостоятельное выполнение");

export default function Services() {
  const navigate = useNavigate();
  const location = useLocation();
  const [servicesExecutor, setServicesExecutor] = useState([]);
  const [servicesByStatus, setServicesByStatus] = useState({});
  const [selectedService, setSelectedService] = useState(null);
  const [activeStatusTab, setActiveStatusTab] = useState(() => {
    const tabId = location.state?.activeStatusTab ?? "all";
    return tabId === "myselfExecutor" ? "all" : tabId;
  });
  const servicesExecutorRef = useRef(servicesExecutor);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [seenRevision, setSeenRevision] = useState(0);

  const [userId, setUserId] = useState(() => getStoredUserId());

  const enrichedServices = useMemo(
    () =>
      servicesExecutor.map((service) =>
        enrichListItemWithUpdates(
          service,
          userId,
          getExecutorServicePresetKey(service.status_service_executor),
        ),
      ),
    [servicesExecutor, userId, seenRevision],
  );

  const applyServicesData = useCallback(
    (data) => {
      let seenChanged = false;

      data.forEach((service) => {
        if (userId && service.activity) {
          if (syncSeenCancelAck(userId, service.id, service.activity)) {
            seenChanged = true;
          }
          if (syncSeenActivityBaseline(userId, service.id, service.activity)) {
            seenChanged = true;
          }
          if (
            syncSeenOnRoleStatusChange(
              userId,
              service.id,
              service.activity,
              "executor",
              service.status_service_executor,
            )
          ) {
            seenChanged = true;
          }
        }
      });

      if (seenChanged) {
        setSeenRevision((value) => value + 1);
      }

      setServicesExecutor(data.filter((service) => !isSelfExecutionService(service)));

      const byStatus = data.reduce((acc, service) => {
        if (isSelfExecutionService(service)) return acc;
        const statusKey = service.status_service_executor || "Без статуса";
        acc[statusKey] = acc[statusKey] || [];
        acc[statusKey].push(service);
        return acc;
      }, {});

      const statusMap = { ...byStatus };
      statusTabs.forEach((tab) => {
        statusMap[tab.statusKey] = statusMap[tab.statusKey] || [];
      });
      setServicesByStatus(statusMap);
    },
    [userId],
  );

  const fetchServicesExecutor = useCallback(
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
          throw new Error("Войдите в аккаунт для просмотра услуг");
        }

        const response = await apiFetch(
          `${API.baseURL}/services_executor`,
        );
        if (!response.ok)
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);

        const data = await response.json();
        if (!Array.isArray(data)) throw new Error("Получены некорректные данные");

        applyServicesData(data);
      } catch (err) {
        console.error("Ошибка загрузки услуг:", err);
        if (!silent) setError(err.message);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [applyServicesData, userId],
  );

  useEffect(() => {
    if (userId) return;
    ensureStoredUserId().then((id) => {
      if (id) setUserId(id);
    });
  }, [userId]);

  useEffect(() => {
    servicesExecutorRef.current = servicesExecutor;
  }, [servicesExecutor]);

  useEffect(() => {
    fetchServicesExecutor();
  }, [fetchServicesExecutor]);

  useEffect(() => {
    if (location.state?.activeStatusTab) {
      navigate("/profile/services", { replace: true, state: {} });
    }
  }, [location.state?.activeStatusTab, navigate]);

  useEffect(() => {
    if (selectedService) return undefined;

    const timerId = setInterval(() => {
      fetchServicesExecutor({ silent: true });
    }, LIST_ACTIVITY_POLL_MS);

    return () => clearInterval(timerId);
  }, [selectedService, fetchServicesExecutor]);

  const currentServices = useMemo(() => {
    if (activeStatusTab === "all") return enrichedServices;
    if (activeStatusTab === "graphicOrders") return [];

    const statusKey = statusTabs.find(
      (tab) => tab.id === activeStatusTab,
    )?.statusKey;
    return enrichedServices.filter(
      (service) => (service.status_service_executor || "Без статуса") === statusKey,
    );
  }, [activeStatusTab, enrichedServices]);

  const getStatusCount = useCallback(
    (statusKey) => servicesByStatus[statusKey]?.length || 0,
    [servicesByStatus],
  );

  const getUpdatesCount = useCallback(
    (statusKey) =>
      enrichedServices.filter(
        (service) =>
          (service.status_service_executor || "Без статуса") === statusKey &&
          service.updateInfo?.hasUpdates,
      ).length,
    [enrichedServices],
  );

  const totalUpdatesCount = useMemo(
    () =>
      enrichedServices.filter((service) => service.updateInfo?.hasUpdates).length,
    [enrichedServices],
  );

  const handleSelectService = useCallback((service) => {
    setSelectedService(service);
  }, []);

  const handleServiceStatusChanged = useCallback(
    (orderId, newStatus = "В процессе выполнения") => {
      setSelectedService(null);
      setActiveStatusTab("inProgress");

      const updated = servicesExecutorRef.current.map((service) =>
        String(service.id) === String(orderId)
          ? { ...service, status_service_executor: newStatus }
          : service,
      );
      applyServicesData(updated);
      void fetchServicesExecutor({ silent: true });
    },
    [applyServicesData, fetchServicesExecutor],
  );

  const activeTabMeta =
    activeStatusTab === "all"
      ? { label: "Все услуги", hint: allTabHint }
      : statusTabs.find((tab) => tab.id === activeStatusTab);

  const handleStatusChange = (tabId) => {
    setActiveStatusTab(tabId);
    setSelectedService(null);
  };

  const isGraphicTab = activeStatusTab === "graphicOrders";

  if (loading) {
    return (
      <div className="list-page">
        <div className="list-loading">
          <div className="list-loading__spinner" aria-hidden="true" />
          <p>Загрузка услуг...</p>
        </div>
      </div>
    );
  }

  if (selectedService) {
    const handleBack = () => {
      setSelectedService(null);
      setSeenRevision((value) => value + 1);
      fetchServicesExecutor();
    };
    const backProps = {
      onBack: handleBack,
      userId,
      listActivity: selectedService.activity,
    };

    return (
      <div className="list-page">
        {selectedService?.status_service_executor?.includes("Предложения") && (
          <OfferCustomer orderId={selectedService.id} {...backProps} />
        )}
        {selectedService?.status_service_executor?.includes(
          "На рассмотрении",
        ) && (
          <ConsiderationCustomer
            orderId={selectedService.id}
            customerId={selectedService.customer_id}
            {...backProps}
          />
        )}
        {selectedService?.status_service_executor?.includes(
          "Ожидают выполнения",
        ) && (
          <WaitExecuteWorkServiceInfo
            orderId={selectedService.id}
            customerId={selectedService.customer_id}
            {...backProps}
            onServiceStatusChanged={handleServiceStatusChanged}
          />
        )}
        {selectedService?.status_service_executor?.includes("В процессе") && (
          <ContinueExecuteWorkServiceInfo
            orderId={selectedService.id}
            customerId={selectedService.customer_id}
            {...backProps}
          />
        )}
        {(selectedService?.status_service_executor?.includes(
          "Отказано заказчиком",
        ) ||
          selectedService?.status_service_executor?.includes(
            "Отказ от заказа",
          )) && (
          <RefusedByCustomerWork
            orderId={selectedService.id}
            statusLabel={
              selectedService?.status_service_executor?.includes(
                "Отказ от заказа",
              )
                ? "Отказ от заказа"
                : "Отказано заказчиком"
            }
            {...backProps}
          />
        )}
        {selectedService?.status_service_executor?.includes("Выполнен") && (
          <ExecuteWorkServiceInfo service={selectedService} {...backProps} />
        )}
      </div>
    );
  }

  return (
    <div className="list-page">
      <header className="list-page__header">
        <div>
          <h2 className="list-page__title">Мои услуги</h2>
          <p className="list-page__subtitle">
            {servicesExecutor.length > 0
              ? `Всего ${servicesExecutor.length} — выберите статус для фильтрации`
              : "У вас пока нет услуг"}
          </p>
        </div>
      </header>

      {error && (
        <div className="list-alert">
          <p className="list-alert__text">Ошибка загрузки услуг: {error}</p>
          <button
            type="button"
            className="list-alert__retry"
            onClick={fetchServicesExecutor}
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
            label: "Все услуги",
            count: servicesExecutor.length,
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
          {isGraphicTab ? (
            <ExecutorOrdersSchedule />
          ) : (
            <div className="services-grid" id="services-container">
              {currentServices.length === 0 ? (
                <div className="list-empty">
                  <div className="list-empty__icon" aria-hidden="true">
                    📭
                  </div>
                  <h3 className="list-empty__title">
                    {activeStatusTab === "all"
                      ? "Нет услуг"
                      : `Нет услуг: «${activeTabMeta?.label}»`}
                  </h3>
                  <p className="list-empty__text">
                    Выберите другой статус в панели слева.
                  </p>
                </div>
              ) : (
                currentServices.map((service) => (
                  <OrderServiceCard
                    key={service.id}
                    item={service}
                    statusLabel={service.status_service_executor}
                    partyLabel="Заказчик"
                    partyName={service.customer_name}
                    updateInfo={service.updateInfo}
                    onClick={() => handleSelectService(service)}
                  />
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
