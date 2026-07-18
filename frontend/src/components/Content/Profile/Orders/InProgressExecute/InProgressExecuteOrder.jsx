import { useState, useEffect, useCallback, useMemo } from "react";
import { API, apiFetch, buildApiUrl, fetchOrderExecutorResponse } from "../../../../../utils/api.js";
import { useNavigate, useParams } from "react-router-dom";
import Chat from "../../Services/CommonComponent/ChatOrderMaster/ChatOrderMaster";
import CommentsRating from "../CommonComponents/CommentsRating/CommentsRating";
import ContractAgreement from "../CommonComponents/CustomerExecutorContractOrder/CustomerExecutorContract";
import CustomerCancelOrder from "../CommonComponents/CustomerCancelOrder/CustomerCancelOrder";
import CustomerEstimateWorks from "../CommonComponents/CustomerEstimateWorksMaterials/CustomerEstimateWorks";
import CustomerExecutorComplaints from "../CommonComponents/CustomerExecutorComplaints/CustomerExecutorComplaints";
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
  title: "Покраска стен в комнате",
  customer_id: 456,
  budget: 15000,
  location: "Москва, ул. Ленина, д.10",
};

const FALLBACK_CUSTOMER = {
  name: "Иван Иванов",
  company: "ООО Ромашка",
};

export default function InProgressExecuteOrder({ order, onBack, userId, listActivity, onOrderStatusChanged }) {
  const [activeTab, setActiveTab] = useWorkDetailInitialTab("customer_in_progress");
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

  const currentOrder = orderData || FALLBACK_ORDER;
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
            buildApiUrl("/profile", { user_id: loadedOrder.customer_id }),
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
      setOrderData(FALLBACK_ORDER);
      setCustomer(FALLBACK_CUSTOMER);
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

  const layoutError =
    error ||
    (!loading && !orderData ? "Ошибка загрузки данных заказа" : null);

  const tabs = useMemo(
    () =>
      getWorkDetailTabs("customer_in_progress", {
        chatLabel: "Чат с исполнителем",
        badges: {
          payment: payment ? undefined : "!",
        },
      }),
    [payment],
  );

  return (
    <WorkDetailLayout
      title={currentOrder.title || "Заказ"}
      subtitle={orderId ? `Заказ № ${orderId}` : undefined}
      backLabel="Назад к заказам"
      onBack={onBack || (() => navigate(-1))}
      activityConfig={
        userId && orderId
          ? {
              userId,
              orderId,
              presetKey: "customer_in_progress",
              activity: listActivity ?? order?.activity,
            }
          : undefined
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
  );
}
