import React, { useState, useEffect, useCallback, useMemo } from "react";
import { API, apiFetch } from "../../../../../utils/api.js";
import { useNavigate, useParams } from "react-router-dom";
import ClearOrderDataAfterRefusalButton from "../CommonComponents/DeleteOrder/ClearOrderDataAfterRefusalButton";
import MoveToDraftModal from "../CommonComponents/MoveToDraft/MoveToDraftModal";
import OrderInfo from "../../Services/CommonComponent/CustomerOrderInfo/OrderInfo";
import OrderResponsesExecutors from "../CommonComponents/OrdersResponsesExecutors/OrderResponsesExecutors";
import SelfExecutionModal from "../CommonComponents/SelfExecution/SelfExecutionModal";
import WorkDetailLayout from "../../Common/WorkDetailLayout";
import { OrderDeleteFooterActions } from "../CommonComponents/DeleteOrder/DeleteOrderButton";
import "../../Services/CommonComponent/CustomerOrderInfo/customer_order_info.css";
import {
  getWorkDetailTabs,
  useWorkDetailInitialTab,
} from "../../Common/workDetailTabs";
import "./ResearchExecutorsOrder.css";

const ORDER_STATUS = {
  DRAFT: "Не предложенные исполнителям",
  SEARCH: "В поиске исполнителя",
};

export default function ResearchExecutor({ order, onBack, onOrderUpdated, onOrderDeleted, userId, listActivity }) {
  const [activeTab, setActiveTab] = useWorkDetailInitialTab("customer_search");
  const [responsesCount, setResponsesCount] = useState(0);
  const [orderData, setOrderData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingSelfExecution, setLoadingSelfExecution] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [showSelfModal, setShowSelfModal] = useState(false);
  const [error, setError] = useState(null);
  const [canClearAfterExecutorRefusal, setCanClearAfterExecutorRefusal] =
    useState(false);
  const [responsesRevision, setResponsesRevision] = useState(0);

  const navigate = useNavigate();
  const { slug } = useParams();
  const orderId = order?.id || slug;
  const currentOrder = orderData || order;

  const fetchOrderInfo = useCallback(async () => {
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

      setOrderData({
        ...(await response.json()),
        status_order_customer: order?.status_order_customer,
      });
    } catch (err) {
      setError(err.message);
      setOrderData(order || null);
    } finally {
      setLoading(false);
    }
  }, [orderId, order]);

  useEffect(() => {
    fetchOrderInfo();
  }, [fetchOrderInfo]);

  useEffect(() => {
    const fetchResponsesCount = async () => {
      if (!orderId) return;
      try {
        const response = await apiFetch(
          `${API.baseURL}/order_responses_executors/${orderId}`,
        );
        if (!response.ok) return;
        const data = await response.json();
        setResponsesCount(Array.isArray(data) ? data.length : data ? 1 : 0);
      } catch {
        setResponsesCount(0);
      }
    };

    fetchResponsesCount();
  }, [orderId, responsesRevision]);

  useEffect(() => {
    const checkClearEligibility = async () => {
      const customerId = Number(localStorage.getItem("user_id"));
      if (!orderId || !customerId) {
        setCanClearAfterExecutorRefusal(false);
        return;
      }

      try {
        const params = new URLSearchParams({ customer_id: String(customerId) });
        const response = await apiFetch(
          `${API.baseURL}/order/${orderId}/clear_after_executor_refusal_eligibility?${params.toString()}`,
        );
        if (!response.ok) {
          setCanClearAfterExecutorRefusal(false);
          return;
        }
        const data = await response.json();
        setCanClearAfterExecutorRefusal(Boolean(data.can_clear));
      } catch {
        setCanClearAfterExecutorRefusal(false);
      }
    };

    checkClearEligibility();
  }, [orderId, currentOrder?.status_order_customer, responsesRevision]);

  const handleAssignmentDataCleared = useCallback(() => {
    setCanClearAfterExecutorRefusal(false);
    setResponsesRevision((value) => value + 1);
    fetchOrderInfo();
  }, [fetchOrderInfo]);

  const handleAcceptSuccess = useCallback(
    (executorId) => {
      if (onOrderUpdated) {
        onOrderUpdated({
          ...currentOrder,
          executor_id: executorId,
          status_order_customer: "Ожидают выполнения",
        });
        return;
      }
      navigate(0);
    },
    [currentOrder, onOrderUpdated, navigate],
  );

  const tabs = useMemo(
    () =>
      getWorkDetailTabs("customer_search", {
        badges: {
          orderResponesExecutors: responsesCount || undefined,
        },
      }),
    [responsesCount],
  );

  const handleSelfExecution = async () => {
    if (!currentOrder?.id) return;

    setLoadingSelfExecution(true);
    setError(null);

    const customerId = Number(localStorage.getItem("user_id"));
    const executorId =
      currentOrder.executor_id || currentOrder?.executor?.id || null;

    try {
      const requests = [
        apiFetch(`${API.baseURL}/add_status_order_customer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order_id: currentOrder.id,
            customer_id: customerId,
            status: "Самостоятельное выполнение",
          }),
        }),
      ];

      if (executorId) {
        requests.push(
          apiFetch(`${API.baseURL}/add_status_order_executor`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              order_id: currentOrder.id,
              executor_id: executorId,
              status: "Самостоятельное выполнение",
            }),
          }),
        );
      }

      const responses = await Promise.all(requests);
      if (!responses.every((response) => response.ok)) {
        throw new Error("Ошибка сервера при принятии заказа");
      }

      if (onOrderUpdated) {
        onOrderUpdated({
          ...currentOrder,
          status_order_customer: "Самостоятельное выполнение",
        });
      } else {
        navigate(0);
      }

      setShowSelfModal(false);
    } catch (err) {
      console.error("Ошибка обновления статуса:", err);
      setError("Не удалось перевести заказ в самостоятельное выполнение");
    } finally {
      setLoadingSelfExecution(false);
    }
  };

  const handleMoveToDraft = async () => {
    if (!currentOrder?.id) return;

    setLoadingDraft(true);
    setError(null);

    const customerId = Number(localStorage.getItem("user_id"));

    try {
      const response = await apiFetch(
        `${API.baseURL}/add_status_order_customer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order_id: currentOrder.id,
            customer_id: customerId,
            status: ORDER_STATUS.DRAFT,
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Ошибка сервера при смене статуса");
      }

      setShowDraftModal(false);

      if (onOrderUpdated) {
        onOrderUpdated({
          ...currentOrder,
          status_order_customer: ORDER_STATUS.DRAFT,
        });
      } else {
        navigate(0);
      }
    } catch (err) {
      console.error("Ошибка перевода в черновик:", err);
      setError("Не удалось вернуть заказ в черновик");
    } finally {
      setLoadingDraft(false);
    }
  };

  const layoutError =
    error ||
    (!loading && !currentOrder ? "Ошибка загрузки данных заказа" : null);

  return (
    <WorkDetailLayout
      rootClassName="research-executor"
      title={currentOrder?.title || "Поиск исполнителя"}
      subtitle={orderId ? `Заказ № ${orderId}` : undefined}
      backLabel="Назад к заказам"
      onBack={onBack || (() => navigate(-1))}
      activityConfig={
        userId && orderId
          ? {
              userId,
              orderId,
              presetKey: "customer_search",
              activity: listActivity ?? order?.activity,
            }
          : undefined
      }
      headerExtra={
        <button
          type="button"
          onClick={() => setShowSelfModal(true)}
          disabled={loadingSelfExecution || !currentOrder?.id}
          className="work-detail__btn-primary"
          style={{
            background: loadingSelfExecution
              ? undefined
              : "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
            boxShadow: "0 4px 14px rgba(245, 158, 11, 0.35)",
          }}
        >
          {loadingSelfExecution ? "Сохраняем..." : "Самостоятельное выполнение"}
        </button>
      }
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      loading={loading}
      loadingText="Загрузка заказа..."
      error={layoutError}
      onDismissError={() => setError(null)}
    >
      {activeTab === "orderInfo" && currentOrder && (
        <OrderInfo
          order={currentOrder}
          embedded
          footer={
            <OrderDeleteFooterActions
              orderId={currentOrder.id}
              orderTitle={currentOrder.title}
              statusOrderCustomer={currentOrder.status_order_customer}
              onDeleted={onOrderDeleted || onBack}
              hideDelete={canClearAfterExecutorRefusal}
            >
              {canClearAfterExecutorRefusal && (
                <ClearOrderDataAfterRefusalButton
                  orderId={currentOrder.id}
                  orderTitle={currentOrder.title}
                  onCleared={handleAssignmentDataCleared}
                />
              )}
              <button
                type="button"
                className="order-info__btn-draft"
                onClick={() => setShowDraftModal(true)}
                disabled={loadingDraft || !currentOrder?.id}
              >
                Убрать заказ в черновик
              </button>
            </OrderDeleteFooterActions>
          }
        />
      )}

      {activeTab === "orderResponesExecutors" && currentOrder && (
        <OrderResponsesExecutors
          order={currentOrder}
          onAcceptSuccess={handleAcceptSuccess}
        />
      )}

      {showDraftModal && (
        <MoveToDraftModal
          variant="search"
          loading={loadingDraft}
          onClose={() => !loadingDraft && setShowDraftModal(false)}
          onConfirm={handleMoveToDraft}
        />
      )}

      {showSelfModal && (
        <SelfExecutionModal
          loading={loadingSelfExecution}
          onClose={() => !loadingSelfExecution && setShowSelfModal(false)}
          onConfirm={handleSelfExecution}
        />
      )}
    </WorkDetailLayout>
  );
}
