import { useState, useEffect, useCallback, useMemo } from "react";
import { API, apiFetch, buildApiUrl } from "../../../../../utils/api.js";
import { useNavigate, useParams } from "react-router-dom";
import Chat from "../CommonComponent/ChatOrderMaster/ChatOrderMaster";
import ContractExecutor from "../CommonComponent/CustomerExecutorContractOrder/ContractOrderCustomerExecutor";
import CustomerExecutorComplaints from "../../Orders/CommonComponents/CustomerExecutorComplaints/CustomerExecutorComplaints";
import CustomerInfo from "../CommonComponent/InformationAboutCustomer/InformationAboutCustomer";
import EstimateWorks from "../CommonComponent/EstimateWorksMaterials/EstimateWorks";
import ExecutorCancelService from "../CommonComponent/ExecutorCancelService/ExecutorCancelService";
import ExecutorPaymentStatus from "../CommonComponent/Payment/ExecutorPaumentStatus";
import GraphicWorks from "../CommonComponent/GraphicWorks/GraphicWorks";
import OrderInfoWithMyResponse from "../CommonComponent/CustomerOrderInfo/OrderInfoWithMyResponse";
import WorkDetailLayout from "../../Common/WorkDetailLayout";
import {
  getWorkDetailTabs,
  useWorkDetailInitialTab,
} from "../../Common/workDetailTabs";
import { useContractStatus } from "../../Common/useContractStatus";

const FALLBACK_ORDER = {
  id: 123,
  title: "Покраска стен в комнате",
  customer_id: 456,
  category_work_id: 1,
};

export default function ContinueExecuteWorkServiceInfo({ orderId, onBack, userId, listActivity }) {
  const [activeTab, setActiveTab] = useWorkDetailInitialTab("executor_in_progress");
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const navigate = useNavigate();
  const { slug } = useParams();

  const orderIdFinal = orderId || slug;
  const executorId = localStorage.getItem("user_id");
  const currentOrder = order || FALLBACK_ORDER;

  const fetchOrderInfo = useCallback(async () => {
    if (!orderIdFinal) {
      setError("ID заказа не найден");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await apiFetch(
        buildApiUrl(`/order/${orderIdFinal}`),
      );
      if (!response.ok) throw new Error(`Ошибка ${response.status}`);

      setOrder(await response.json());
    } catch (err) {
      setError(err.message);
      setOrder(FALLBACK_ORDER);
    } finally {
      setLoading(false);
    }
  }, [orderIdFinal]);

  useEffect(() => {
    fetchOrderInfo();
  }, [fetchOrderInfo]);

  const { refetch: refetchContractStatus } = useContractStatus(orderIdFinal, {
    pollWhileNotReady: true,
  });

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
      getWorkDetailTabs("executor_in_progress", {
        chatLabel: "Чат с заказчиком",
      }),
    [],
  );

  return (
    <WorkDetailLayout
      title={currentOrder.title || "Выполнение работы"}
      subtitle={orderIdFinal ? `Услуга № ${orderIdFinal}` : undefined}
      backLabel="Назад к услугам"
      onBack={onBack || (() => navigate(-1))}
      activityConfig={
        userId && orderIdFinal
          ? {
              userId,
              orderId: orderIdFinal,
              presetKey: "executor_in_progress",
              activity: listActivity,
            }
          : undefined
      }
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      loading={loading}
      loadingText="Загрузка заказа..."
      error={error ? `Ошибка: ${error}` : null}
      onDismissError={() => setError(null)}
    >
      {activeTab === "estimateWorks" && (
        <EstimateWorks
          order_id={orderIdFinal}
          category_work_id={currentOrder.category_work_id}
        />
      )}

      {activeTab === "schedule" && (
        <GraphicWorks
          orderId={orderIdFinal}
          categoryWorkId={currentOrder.category_work_id}
        />
      )}

      {activeTab === "chat" && <Chat order_id={orderIdFinal} />}

      {activeTab === "customerInfo" && (
        <CustomerInfo customerId={currentOrder.customer_id} />
      )}

      {activeTab === "orderInfo" && (
        <OrderInfoWithMyResponse order={currentOrder} embedded />
      )}

      <div
        style={{
          display:
            activeTab === "customerExecutorContract" ? "block" : "none",
        }}
      >
        <ContractExecutor
          order={currentOrder}
          onContractUpdated={handleContractUpdated}
        />
      </div>

      {activeTab === "payment" && (
        <ExecutorPaymentStatus
          orderId={orderIdFinal}
          executorId={executorId}
        />
      )}

      {activeTab === "executorCancelOrder" && (
        <ExecutorCancelService
          order={currentOrder}
          executorId={executorId}
          status="pending_customer"
          onCancelSuccess={() => {
            alert("Заявка отправлена! Ожидайте решения заказчика.");
          }}
          onCustomerCancelAgreed={onBack}
        />
      )}

      {activeTab === "complaints" && (
        <CustomerExecutorComplaints
          orderId={orderIdFinal}
          userType="executor"
        />
      )}
    </WorkDetailLayout>
  );
}
