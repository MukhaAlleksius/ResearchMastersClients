import { useState, useEffect, useCallback, useMemo } from "react";
import { apiFetch, buildApiUrl, fetchOrderExecutorResponse } from "../../../../../utils/api.js";
import { useNavigate, useParams } from "react-router-dom";
import Chat from "../../Services/CommonComponent/ChatOrderMaster/ChatOrderMaster";
import CommentsRating from "../CommonComponents/CommentsRating/CommentsRating";
import CustomerCancelOrder from "../CommonComponents/CustomerCancelOrder/CustomerCancelOrder";
import CustomerEstimateWorks from "../CommonComponents/CustomerEstimateWorksMaterials/CustomerEstimateWorks";
import CustomerExecutorComplaints from "../CommonComponents/CustomerExecutorComplaints/CustomerExecutorComplaints";
import CustomerReportWorks from "../CommonComponents/CustomerReportWorks/CustomerReportWorks";
import ExecutorInfo from "../CommonComponents/CustomerOrderInfo/ExecutorInfo";
import OrderInfoWithExecutorResponse from "../../Services/CommonComponent/CustomerOrderInfo/OrderInfoWithExecutorResponse";
import WorkDetailLayout from "../../Common/WorkDetailLayout";
import CompleteOrderModal from "./CompleteOrderModal";
import { uiAlert } from "../../../../UiDialog/uiDialog.js";

import {
  getWorkDetailTabs,
  useWorkDetailInitialTab,
} from "../../Common/workDetailTabs";

const COMPLETED_STATUS = "Выполнен";

const FALLBACK_ORDER = {
  id: 123,
  title: "Покраска стен в комнате",
  customer_id: 456,
  budget: 15000,
  location: "Москва, ул. Ленина, д.10",
};

export default function InProgressExecuteOrder({ order, onBack, userId, onOrderStatusChanged }) {
  const [activeTab, setActiveTab] = useWorkDetailInitialTab("customer_in_progress");
  const [orderData, setOrderData] = useState(null);
  const [executorOrder, setExecutorOrder] = useState(null);
  const [orderResponseExecutor, setOrderResponseExecutor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isCompleting, setIsCompleting] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [error, setError] = useState(null);
  const [modalError, setModalError] = useState(null);

  const navigate = useNavigate();
  const { slug } = useParams();
  const orderId = order?.id || slug;

  const currentOrder = orderData || FALLBACK_ORDER;

  const resolvedExecutorId = useMemo(() => {
    const candidates = [
      executorOrder?.executor_id,
      orderResponseExecutor?.executor_id,
      orderData?.executor_id,
      order?.executor_id,
    ];

    for (const value of candidates) {
      const id = Number(value);
      if (Number.isFinite(id) && id > 0) {
        return id;
      }
    }

    return null;
  }, [
    executorOrder?.executor_id,
    orderResponseExecutor?.executor_id,
    orderData?.executor_id,
    order?.executor_id,
  ]);

  const resolvedCustomerId = useMemo(() => {
    const candidates = [
      currentOrder?.customer_id,
      orderData?.customer_id,
      order?.customer_id,
      userId,
    ];
    for (const value of candidates) {
      const id = Number(value);
      if (Number.isFinite(id) && id > 0) {
        return id;
      }
    }
    return null;
  }, [
    currentOrder?.customer_id,
    orderData?.customer_id,
    order?.customer_id,
    userId,
  ]);

  const fetchOrderInfo = useCallback(async () => {
    if (!orderId) {
      setError("ID заказа не найден");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await apiFetch(buildApiUrl(`/order/${orderId}`));
      if (!response.ok) throw new Error(`Ошибка ${response.status}`);

      const loadedOrder = await response.json();
      setOrderData(loadedOrder);

      if (loadedOrder.executor_id) {
        setExecutorOrder({
          id: 0,
          order_id: Number(orderId),
          executor_id: loadedOrder.executor_id,
        });
      }
    } catch (err) {
      setError(err.message);
      setOrderData(FALLBACK_ORDER);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  const fetchExecutorOrder = useCallback(async () => {
    if (!orderId) return;
    try {
      const response = await apiFetch(
        buildApiUrl(`/executor_order/${orderId}`),
      );
      if (response.ok) {
        setExecutorOrder(await response.json());
      }
    } catch (err) {
      console.error("Ошибка executor_order:", err);
    }
  }, [orderId]);

  const fetchOrderResponseExecutor = useCallback(async () => {
    if (!resolvedExecutorId || !orderId) return;
    try {
      const data = await fetchOrderExecutorResponse(resolvedExecutorId, orderId);
      setOrderResponseExecutor(data);
    } catch (err) {
      console.error("Ошибка order_response_executor:", err);
    }
  }, [resolvedExecutorId, orderId]);

  useEffect(() => {
    fetchOrderInfo();
    fetchExecutorOrder();
  }, [fetchOrderInfo, fetchExecutorOrder]);

  useEffect(() => {
    fetchOrderResponseExecutor();
  }, [fetchOrderResponseExecutor]);

  const openCompleteModal = useCallback(() => {
    if (isCompleting || !orderId || !resolvedCustomerId) return;
    setModalError(null);
    setShowCompleteModal(true);
  }, [isCompleting, orderId, resolvedCustomerId]);

  const closeCompleteModal = useCallback(() => {
    if (isCompleting) return;
    setShowCompleteModal(false);
    setModalError(null);
  }, [isCompleting]);

  const handleCompleteOrder = useCallback(async () => {
    if (isCompleting || !orderId || !resolvedCustomerId) return;

    setIsCompleting(true);
    setModalError(null);
    setError(null);

    try {
      const parsedOrderId = Number(orderId);
      if (!Number.isFinite(parsedOrderId)) {
        throw new Error("Некорректный ID заказа");
      }

      const requests = [
        apiFetch(buildApiUrl("/add_status_order_customer"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order_id: parsedOrderId,
            customer_id: resolvedCustomerId,
            status: COMPLETED_STATUS,
          }),
        }),
      ];

      if (resolvedExecutorId) {
        requests.push(
          apiFetch(buildApiUrl("/add_status_order_executor"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              order_id: parsedOrderId,
              executor_id: resolvedExecutorId,
              status: COMPLETED_STATUS,
            }),
          }),
        );
      }

      const responses = await Promise.all(requests);
      const failed = responses.find((res) => !res.ok);
      if (failed) {
        const errBody = await failed.json().catch(() => ({}));
        const detail = errBody.detail;
        const message = Array.isArray(detail)
          ? detail.map((item) => item.msg || item).join(", ")
          : detail || `Ошибка сервера: ${failed.status}`;
        throw new Error(message);
      }

      setShowCompleteModal(false);

      if (onOrderStatusChanged) {
        onOrderStatusChanged(parsedOrderId, COMPLETED_STATUS);
      } else {
        navigate("/profile/orders", {
          state: { activeStatusTab: "Выполнен" },
        });
      }
    } catch (err) {
      setModalError(err.message || "Не удалось отметить заказ выполненным");
    } finally {
      setIsCompleting(false);
    }
  }, [
    isCompleting,
    orderId,
    resolvedCustomerId,
    resolvedExecutorId,
    onOrderStatusChanged,
    navigate,
  ]);

  const layoutError =
    error ||
    (!loading && !orderData ? "Ошибка загрузки данных заказа" : null);

  const tabs = useMemo(
    () =>
      getWorkDetailTabs("customer_in_progress", {
        chatLabel: "Чат с исполнителем",
      }),
    [],
  );

  return (
    <>
      <WorkDetailLayout
        title={currentOrder.title || "Заказ"}
        backLabel="Назад к заказам"
        onBack={onBack || (() => navigate(-1))}
        headerExtra={
          <div className="work-detail__header-action">
            <button
              type="button"
              onClick={openCompleteModal}
              disabled={isCompleting || loading || !orderId || !resolvedCustomerId}
              className="work-detail__btn-primary"
            >
              {isCompleting ? "Сохранение…" : "Заказ выполнен"}
            </button>
          </div>
        }
        meta={
          <>
            <span>
              Бюджет:{" "}
              <strong>
                {currentOrder?.budget != null
                  ? `${Number(currentOrder.budget).toLocaleString()} ${currentOrder.currency || "BYN"}`
                  : "—"}
              </strong>
            </span>
            <span>
              Статус: <strong>В процессе выполнения</strong>
            </span>
          </>
        }
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        loading={loading}
        loadingText="Загрузка заказа..."
        error={layoutError}
        onDismissError={() => setError(null)}
      >
        {activeTab === "estimateWorks" && (
          <CustomerEstimateWorks
            order_id={orderId}
            category_work_id={currentOrder.category_work_id}
            executor_id={resolvedExecutorId}
          />
        )}

        {activeTab === "schedule" && (
          <CustomerReportWorks order={currentOrder} />
        )}

        {activeTab === "chat" && <Chat order_id={orderId} />}

        {activeTab === "executorInfo" && (
          <ExecutorInfo
            executorId={resolvedExecutorId}
            customerId={userId}
          />
        )}

        {activeTab === "orderInfo" && (
          <OrderInfoWithExecutorResponse
            order={currentOrder}
            executorId={resolvedExecutorId}
            executorResponse={orderResponseExecutor}
            showExecutorResponseTab
            embedded
          />
        )}

        {activeTab === "customerCancelOrder" && (
          <CustomerCancelOrder
            order={currentOrder}
            executorId={resolvedExecutorId}
            status="pending_executor"
            onCancelSuccess={async () => {
              await uiAlert("Заявка отправлена! Ожидайте решения исполнителя.");
            }}
            onCancelResolved={onOrderStatusChanged}
          />
        )}

        {activeTab === "commentsRating" && (
          <CommentsRating orderId={orderId} executorId={resolvedExecutorId} />
        )}

        {activeTab === "complaints" && (
          <CustomerExecutorComplaints
            orderId={orderId}
            userType="customer"
          />
        )}
      </WorkDetailLayout>

      {showCompleteModal && (
        <CompleteOrderModal
          orderTitle={currentOrder?.title}
          onClose={closeCompleteModal}
          onConfirm={handleCompleteOrder}
          loading={isCompleting}
          error={modalError}
        />
      )}
    </>
  );
}
