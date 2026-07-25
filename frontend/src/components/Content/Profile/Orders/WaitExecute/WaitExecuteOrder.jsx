import { useState, useEffect, useCallback, useMemo } from "react";
import { apiFetch, buildApiUrl } from "../../../../../utils/api.js";
import { useNavigate, useParams } from "react-router-dom";
import Chat from "../../Services/CommonComponent/ChatOrderMaster/ChatOrderMaster";
import CustomerCancelOrder from "../CommonComponents/CustomerCancelOrder/CustomerCancelOrder";
import CustomerEstimateWorks from "../CommonComponents/CustomerEstimateWorksMaterials/CustomerEstimateWorks";
import OrderInfoWithExecutorResponse from "../../Services/CommonComponent/CustomerOrderInfo/OrderInfoWithExecutorResponse";
import WorkDetailLayout from "../../Common/WorkDetailLayout";
import {
  getWorkDetailTabs,
  useWorkDetailInitialTab,
} from "../../Common/workDetailTabs";
import { OrderDeleteFooterActions } from "../CommonComponents/DeleteOrder/DeleteOrderButton";
import ExecutorInfo from "../CommonComponents/CustomerOrderInfo/ExecutorInfo";

const FALLBACK_ORDER = {
  id: 123,
  title: "Покраска стен в комнате",
  customer_id: 456,
  budget: 15000,
  location: "Москва, ул. Ленина, д.10",
};

export default function WaitExecuteOrder({
  order,
  onBack,
  onOrderDeleted,
  onOrderStatusChanged,
  userId,
  listActivity,
}) {
  const [activeTab, setActiveTab] = useWorkDetailInitialTab("customer_wait_execute");
  const [orderData, setOrderData] = useState(null);
  const [executorId, setExecutorId] = useState(null);
  const [orderResponseExecutor, setOrderResponseExecutor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const navigate = useNavigate();
  const { slug } = useParams();
  const orderId = order?.id || slug;

  const currentOrder = orderData || order || FALLBACK_ORDER;

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

      const loaded = await response.json();
      setOrderData(loaded);

      if (loaded.executor_id) {
        setExecutorId(loaded.executor_id);
      }
    } catch (err) {
      setError(err.message);
      setOrderData(FALLBACK_ORDER);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  const fetchOrderResponseExecutor = useCallback(async () => {
    if (!executorId || !orderId) return;
    try {
      const response = await apiFetch(
        buildApiUrl(`/order_response_executor/${executorId}/${orderId}`),
      );
      if (response.ok) {
        setOrderResponseExecutor(await response.json());
      }
    } catch (err) {
      console.error("Ошибка order_response_executor:", err);
    }
  }, [executorId, orderId]);

  const fetchExecutorOrder = useCallback(async () => {
    if (!orderId) return;
    try {
      const response = await apiFetch(
        buildApiUrl(`/executor_order/${orderId}`),
      );
      if (response.ok) {
        const data = await response.json();
        if (data?.executor_id) {
          setExecutorId(data.executor_id);
        }
      }
    } catch (err) {
      console.error("Ошибка executor_order:", err);
    }
  }, [orderId]);

  useEffect(() => {
    if (order?.executor_id) {
      setExecutorId(order.executor_id);
    }
  }, [order?.executor_id]);

  useEffect(() => {
    fetchOrderInfo();
    fetchExecutorOrder();
  }, [fetchOrderInfo, fetchExecutorOrder]);

  useEffect(() => {
    fetchOrderResponseExecutor();
  }, [fetchOrderResponseExecutor]);

  const resolvedExecutorId = useMemo(() => {
    const candidates = [
      executorId,
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
    executorId,
    orderResponseExecutor?.executor_id,
    orderData?.executor_id,
    order?.executor_id,
  ]);

  const tabs = useMemo(
    () =>
      getWorkDetailTabs("customer_wait_execute", {
        chatLabel: "Чат с исполнителем",
      }),
    [],
  );

  return (
    <WorkDetailLayout
      title={currentOrder.title || "Ожидание выполнения"}
      backLabel="Назад к заказам"
      onBack={onBack || (() => navigate(-1))}
      activityConfig={
        userId && orderId
          ? {
              userId,
              orderId,
              presetKey: "customer_wait_execute",
              activity: listActivity ?? order?.activity,
            }
          : undefined
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
            Локация: <strong>{currentOrder.location || "Не указана"}</strong>
          </span>
          <span>
            Статус: <strong>Ожидает выполнения</strong>
          </span>
        </>
      }
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      loading={loading}
      loadingText="Загрузка заказа..."
      error={error}
      onDismissError={() => setError(null)}
    >
      {activeTab === "estimateWorks" && (
        <CustomerEstimateWorks
          order_id={orderId}
          category_work_id={currentOrder.category_work_id}
          executor_id={resolvedExecutorId}
        />
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
          embedded
          footer={
            <OrderDeleteFooterActions
              orderId={currentOrder.id}
              orderTitle={currentOrder.title}
              statusOrderCustomer={
                currentOrder.status_order_customer ||
                order?.status_order_customer
              }
              onDeleted={onOrderDeleted || onBack}
            />
          }
        />
      )}

      {activeTab === "customerCancelOrder" && (
        <CustomerCancelOrder
          order={currentOrder}
          executorId={resolvedExecutorId}
          status="pending_executor"
          onCancelSuccess={() => {
            alert("Заявка отправлена! Ожидайте решения исполнителя.");
          }}
          onCancelResolved={onOrderStatusChanged}
        />
      )}
    </WorkDetailLayout>
  );
}
