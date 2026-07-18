import { useState, useEffect, useCallback, useMemo } from "react";
import { API, apiFetch, buildApiUrl } from "../../../../../utils/api.js";
import { useNavigate, useParams } from "react-router-dom";
import CommentsRating from "../CommonComponents/CommentsRating/CommentsRating";
import ContractAgreement from "../CommonComponents/CustomerExecutorContractOrder/CustomerExecutorContract";
import CustomerEstimateWorks from "../CommonComponents/CustomerEstimateWorksMaterials/CustomerEstimateWorks";
import CustomerReportWorks from "../CommonComponents/CustomerReportWorks/CustomerReportWorks";
import ExecutorInfo from "../CommonComponents/CustomerOrderInfo/ExecutorInfo";
import OrderInfoWithExecutorResponse from "../../Services/CommonComponent/CustomerOrderInfo/OrderInfoWithExecutorResponse";
import Payment from "../CommonComponents/Payment/Payment";
import WorkDetailLayout from "../../Common/WorkDetailLayout";
import {
  getWorkDetailTabs,
  useWorkDetailInitialTab,
} from "../../Common/workDetailTabs";

const FALLBACK_ORDER = {
  id: 123,
  title: "Заказ",
  customer_id: 456,
  budget: 15000,
  location: "Москва",
};

const FALLBACK_CUSTOMER = {
  name: "Иван Иванов",
  company: "ООО Ромашка",
};

export default function ExecutedOrder({ order, onBack, userId, listActivity }) {
  const [activeTab, setActiveTab] = useWorkDetailInitialTab("customer_completed");
  const [orderData, setOrderData] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [executorOrder, setExecutorOrder] = useState(null);
  const [orderResponseExecutor, setOrderResponseExecutor] = useState(null);
  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const navigate = useNavigate();
  const { slug } = useParams();
  const orderId = order?.id || slug;

  const currentOrder = orderData || order || FALLBACK_ORDER;
  const currentCustomer = customer || FALLBACK_CUSTOMER;

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

      if (loadedOrder.customer_id) {
        try {
          const customerRes = await apiFetch(
            buildApiUrl(`/profile/?user_id=${loadedOrder.customer_id}`),
          );
          if (customerRes.ok) {
            setCustomer(await customerRes.json());
          }
        } catch {
          setCustomer(FALLBACK_CUSTOMER);
        }
      }
    } catch (err) {
      setError(err.message);
      setOrderData(order || FALLBACK_ORDER);
      setCustomer(FALLBACK_CUSTOMER);
    } finally {
      setLoading(false);
    }
  }, [orderId, order]);

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
      const response = await apiFetch(
        buildApiUrl(`/order_response_executor/${resolvedExecutorId}/${orderId}`),
      );
      if (response.ok) {
        setOrderResponseExecutor(await response.json());
      }
    } catch (err) {
      console.error("Ошибка order_response_executor:", err);
    }
  }, [resolvedExecutorId, orderId]);

  const fetchPayment = useCallback(async () => {
    if (!orderData?.id || !customer?.id) return;
    try {
      const res = await apiFetch(
        buildApiUrl(`/payment_for_order/${orderData.id}/${customer.id}`),
      );
      setPayment(res.ok ? await res.json() : null);
    } catch {
      setPayment(null);
    }
  }, [orderData, customer]);

  useEffect(() => {
    fetchOrderInfo();
    fetchExecutorOrder();
  }, [fetchOrderInfo, fetchExecutorOrder]);

  useEffect(() => {
    fetchOrderResponseExecutor();
  }, [fetchOrderResponseExecutor]);

  useEffect(() => {
    if (orderData && customer) {
      fetchPayment();
    }
  }, [orderData, customer, fetchPayment]);

  const tabs = useMemo(() => getWorkDetailTabs("customer_completed"), []);

  const layoutError =
    error ||
    (!loading && !orderData ? "Ошибка загрузки данных заказа" : null);

  return (
    <WorkDetailLayout
      title={currentOrder.title || "Выполненный заказ"}
      subtitle={orderId ? `Заказ № ${orderId}` : undefined}
      backLabel="Назад к заказам"
      onBack={onBack || (() => navigate(-1))}
      activityConfig={
        userId && orderId
          ? {
              userId,
              orderId,
              presetKey: "customer_completed",
              activity: listActivity ?? order?.activity,
            }
          : undefined
      }
      meta={
        <>
          <span>
            Бюджет: <strong>{currentOrder.budget || 0} ₽</strong>
          </span>
          <span>
            Локация: <strong>{currentOrder.location || "Не указана"}</strong>
          </span>
          <span>
            Статус: <strong>Выполнен</strong>
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
      {activeTab === "orderInfo" && (
        <OrderInfoWithExecutorResponse
          order={currentOrder}
          executorId={resolvedExecutorId}
          executorResponse={orderResponseExecutor}
          embedded
        />
      )}

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

      {activeTab === "executorInfo" && (
        <ExecutorInfo
          executorId={resolvedExecutorId}
          customerId={userId}
        />
      )}

      {activeTab === "customerExecutorContract" && (
        <ContractAgreement
          order={currentOrder}
          order_response_executor={orderResponseExecutor}
          customer={currentCustomer}
          executor_id={resolvedExecutorId}
        />
      )}

      {activeTab === "payment" && (
        <Payment
          order={currentOrder}
          customerId={currentOrder.customer_id}
          executorId={resolvedExecutorId}
          existingPayment={payment}
          onSuccess={(paid) => setPayment(paid)}
        />
      )}

      {activeTab === "commentsRating" && (
        <CommentsRating orderId={orderId} executorId={resolvedExecutorId} />
      )}
    </WorkDetailLayout>
  );
}
