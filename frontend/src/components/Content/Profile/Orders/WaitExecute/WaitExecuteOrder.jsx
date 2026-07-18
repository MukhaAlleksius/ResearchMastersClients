import { useState, useEffect, useCallback, useMemo } from "react";
import { API, apiFetch, buildApiUrl } from "../../../../../utils/api.js";
import { useNavigate, useParams } from "react-router-dom";
import Chat from "../../Services/CommonComponent/ChatOrderMaster/ChatOrderMaster";
import ContractAgreement from "../CommonComponents/CustomerExecutorContractOrder/CustomerExecutorContract";
import CustomerCancelOrder from "../CommonComponents/CustomerCancelOrder/CustomerCancelOrder";
import CustomerEstimateWorks from "../CommonComponents/CustomerEstimateWorksMaterials/CustomerEstimateWorks";
import CustomerInfo from "../../Services/CommonComponent/InformationAboutCustomer/InformationAboutCustomer";
import OrderInfoWithExecutorResponse from "../../Services/CommonComponent/CustomerOrderInfo/OrderInfoWithExecutorResponse";
import WorkDetailLayout from "../../Common/WorkDetailLayout";
import {
  getWorkDetailTabs,
  useWorkDetailInitialTab,
} from "../../Common/workDetailTabs";
import { useContractStatus } from "../../Common/useContractStatus";
import { OrderDeleteFooterActions } from "../CommonComponents/DeleteOrder/DeleteOrderButton";
import ExecutorInfo from "../CommonComponents/CustomerOrderInfo/ExecutorInfo";

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
  const [customer, setCustomer] = useState(null);
  const [executorId, setExecutorId] = useState(null);
  const [orderResponseExecutor, setOrderResponseExecutor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const navigate = useNavigate();
  const { slug } = useParams();
  const orderId = order?.id || slug;

  const currentOrder = orderData || order || FALLBACK_ORDER;
  const currentCustomer = customer || FALLBACK_CUSTOMER;

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

      if (loaded.customer_id) {
        const customerRes = await apiFetch(
          buildApiUrl(`/profile/?user_id=${loaded.customer_id}`),
        );
        if (customerRes.ok) {
          setCustomer(await customerRes.json());
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

  const contractStatus = useContractStatus(orderId, {
    pollWhileNotReady: true,
  });
  const {
    isReady: isContractReady,
    loading: contractLoading,
    refetch: refetchContractStatus,
  } = contractStatus;

  const handleContractUpdated = useCallback(() => {
    refetchContractStatus({ silent: true });
  }, [refetchContractStatus]);

  useEffect(() => {
    if (activeTab === "customerExecutorContract") {
      refetchContractStatus({ silent: true });
    }
  }, [activeTab, refetchContractStatus]);

  const tabs = useMemo(
    () =>
      getWorkDetailTabs("customer_wait_execute", {
        chatLabel: "Чат с исполнителем",
        badges: {
          customerExecutorContract:
            !contractLoading && !isContractReady ? "!" : undefined,
        },
      }),
    [contractLoading, isContractReady],
  );

  const contractNotice =
    !contractLoading && !isContractReady
      ? {
          variant: "warning",
          title: "Договор нужен до начала работ",
          text: contractStatus.exists
            ? "Подпишите договор во вкладке «Договор» и дождитесь подписи исполнителя. После этого исполнитель сможет начать работу."
            : "Составьте и сохраните договор во вкладке «Договор», затем подпишите его. Исполнитель также должен подписать договор — только после этого он сможет начать работу.",
          actionLabel: "Перейти к договору",
          onAction: () => setActiveTab("customerExecutorContract"),
        }
      : null;

  return (
    <WorkDetailLayout
      title={currentOrder.title || "Ожидание выполнения"}
      subtitle={orderId ? `Заказ № ${orderId}` : undefined}
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
      notice={contractNotice}
      meta={
        <>
          <span>
            Бюджет: <strong>{currentOrder.budget || 0} ₽</strong>
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

      {activeTab === "customerExecutorContract" && (
        <ContractAgreement
          order={currentOrder}
          order_response_executor={orderResponseExecutor}
          customer={currentCustomer}
          executor_id={resolvedExecutorId}
          onContractUpdated={handleContractUpdated}
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
