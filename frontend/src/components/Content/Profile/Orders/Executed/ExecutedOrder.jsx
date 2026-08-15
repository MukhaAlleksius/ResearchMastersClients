import { useState, useEffect, useCallback, useMemo } from "react";
import { apiFetch, buildApiUrl } from "../../../../../utils/api.js";
import { useNavigate, useParams } from "react-router-dom";
import CommentsRating from "../CommonComponents/CommentsRating/CommentsRating";
import CustomerEstimateWorks from "../CommonComponents/CustomerEstimateWorksMaterials/CustomerEstimateWorks";
import CustomerReportWorks from "../CommonComponents/CustomerReportWorks/CustomerReportWorks";
import ExecutorInfo from "../CommonComponents/CustomerOrderInfo/ExecutorInfo";
import OrderInfoWithExecutorResponse from "../../Services/CommonComponent/CustomerOrderInfo/OrderInfoWithExecutorResponse";
import ContractAgreement from "../CommonComponents/CustomerExecutorContractOrder/CustomerExecutorContract";
import WorkDetailLayout from "../../Common/WorkDetailLayout";
import { EstimateEarningsMeta } from "../../Common/EstimateEarningsSummary";
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

export default function ExecutedOrder({ order, onBack, userId }) {
  const [activeTab, setActiveTab] = useWorkDetailInitialTab("customer_completed");
  const [orderData, setOrderData] = useState(null);
  const [executorOrder, setExecutorOrder] = useState(null);
  const [orderResponseExecutor, setOrderResponseExecutor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const navigate = useNavigate();
  const { slug } = useParams();
  const orderId = order?.id || slug;

  const currentOrder = orderData || order || FALLBACK_ORDER;

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
    } catch (err) {
      setError(err.message);
      setOrderData(order || FALLBACK_ORDER);
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

  useEffect(() => {
    fetchOrderInfo();
    fetchExecutorOrder();
  }, [fetchOrderInfo, fetchExecutorOrder]);

  useEffect(() => {
    fetchOrderResponseExecutor();
  }, [fetchOrderResponseExecutor]);

  const tabs = useMemo(() => getWorkDetailTabs("customer_completed"), []);

  const layoutError =
    error ||
    (!loading && !orderData ? "Ошибка загрузки данных заказа" : null);

  return (
    <WorkDetailLayout
      title={currentOrder.title || "Выполненный заказ"}
      backLabel="Назад к заказам"
      onBack={onBack || (() => navigate(-1))}
      meta={
        <EstimateEarningsMeta
          orderId={orderId}
          estimateUserId={resolvedExecutorId}
          proposedPrice={orderResponseExecutor?.proposed_price}
          offerBudgetType={orderResponseExecutor?.budget_type}
          offerCurrency={orderResponseExecutor?.currency}
          orderBudget={currentOrder?.budget}
          orderCurrency={currentOrder?.currency}
        />
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

      {activeTab === "customerExecutorContract" && (
        <ContractAgreement
          role="customer"
          order={currentOrder}
          order_response_executor={orderResponseExecutor}
          executor_id={resolvedExecutorId}
        />
      )}

      {activeTab === "executorInfo" && (
        <ExecutorInfo
          executorId={resolvedExecutorId}
          customerId={userId}
        />
      )}

      {activeTab === "commentsRating" && (
        <CommentsRating orderId={orderId} executorId={resolvedExecutorId} />
      )}
    </WorkDetailLayout>
  );
}
