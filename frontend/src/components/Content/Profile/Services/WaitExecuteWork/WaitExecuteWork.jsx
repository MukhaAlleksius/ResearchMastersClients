import { useState, useEffect, useCallback, useMemo } from "react";
import { apiFetch, buildApiUrl, ensureStoredUserId } from "../../../../../utils/api.js";
import { useNavigate, useParams } from "react-router-dom";
import Chat from "../CommonComponent/ChatOrderMaster/ChatOrderMaster";
import ContractExecutor from "../CommonComponent/CustomerExecutorContractOrder/ContractOrderCustomerExecutor";
import CustomerInfo from "../CommonComponent/InformationAboutCustomer/InformationAboutCustomer";
import EstimateWorks from "../CommonComponent/EstimateWorksMaterials/EstimateWorks";
import ExecutorCancelService from "../CommonComponent/ExecutorCancelService/ExecutorCancelService";
import OrderInfoWithMyResponse from "../CommonComponent/CustomerOrderInfo/OrderInfoWithMyResponse";
import WorkDetailLayout from "../../Common/WorkDetailLayout";
import "./WaitExecuteWork.css";
import {
  getWorkDetailTabs,
  useWorkDetailInitialTab,
} from "../../Common/workDetailTabs";
import {
  getContractBlockReason,
  useContractStatus,
} from "../../Common/useContractStatus";

export default function WaitExecuteWorkServiceInfo({
  orderId,
  onBack,
  userId,
  listActivity,
  onServiceStatusChanged,
}) {
  const [activeTab, setActiveTab] = useWorkDetailInitialTab("executor_wait_execute");
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState(null);

  const navigate = useNavigate();
  const { slug } = useParams();

  const orderIdFinal = orderId || slug;

  const fetchOrderInfo = useCallback(async () => {
    if (!orderIdFinal) {
      setError("ID заказа не найден");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await apiFetch(buildApiUrl(`/order/${orderIdFinal}`));
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      setOrder(await response.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [orderIdFinal]);

  useEffect(() => {
    fetchOrderInfo();
  }, [fetchOrderInfo]);

  const contractStatus = useContractStatus(orderIdFinal, {
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

  const contractBlockReason = getContractBlockReason(contractStatus);
  const canStartWork = !contractLoading && isContractReady;

  const handleStartExecuteWork = useCallback(async () => {
    if (isStarting || !canStartWork || !orderIdFinal) return;

    setIsStarting(true);
    setError(null);

    try {
      const executorId = await ensureStoredUserId();
      if (!executorId) {
        throw new Error("Не удалось определить пользователя. Войдите снова.");
      }

      const parsedOrderId = Number(orderIdFinal);
      if (!Number.isFinite(parsedOrderId)) {
        throw new Error("Некорректный ID заказа");
      }

      const executorRes = await apiFetch(buildApiUrl("/add_status_order_executor"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: parsedOrderId,
          executor_id: executorId,
          status: "В процессе выполнения",
        }),
      });

      if (!executorRes.ok) {
        const errBody = await executorRes.json().catch(() => ({}));
        const detail = errBody.detail;
        const message = Array.isArray(detail)
          ? detail.map((item) => item.msg || item).join(", ")
          : detail || `Ошибка сервера: ${executorRes.status}`;
        throw new Error(message);
      }

      const newStatus = "В процессе выполнения";

      if (onServiceStatusChanged) {
        onServiceStatusChanged(parsedOrderId, newStatus);
      } else {
        navigate("/profile/services", {
          state: { activeStatusTab: "inProgress" },
        });
      }
    } catch (err) {
      setError(err.message || "Ошибка при начале работы");
    } finally {
      setIsStarting(false);
    }
  }, [
    isStarting,
    orderIdFinal,
    navigate,
    canStartWork,
    onServiceStatusChanged,
  ]);

  const tabs = useMemo(
    () =>
      getWorkDetailTabs("executor_wait_execute", {
        chatLabel: "Чат с заказчиком",
        badges: {
          customerExecutorContract:
            !contractLoading && !isContractReady ? "!" : undefined,
        },
      }),
    [contractLoading, isContractReady],
  );

  return (
    <WorkDetailLayout
      title={order?.title || "Ожидание выполнения"}
      subtitle={orderIdFinal ? `Услуга № ${orderIdFinal}` : undefined}
      backLabel="Назад к услугам"
      onBack={onBack || (() => navigate(-1))}
      activityConfig={
        userId && orderIdFinal
          ? {
              userId,
              orderId: orderIdFinal,
              presetKey: "executor_wait_execute",
              activity: listActivity,
            }
          : undefined
      }
      headerExtra={
        <div className="work-detail__header-action">
          <button
            type="button"
            onClick={handleStartExecuteWork}
            disabled={isStarting || !orderIdFinal || !canStartWork}
            className="work-detail__btn-primary"
            title={
              !canStartWork
                ? contractBlockReason ||
                  "Кнопка заблокирована до составления и подписания договора"
                : undefined
            }
          >
            {isStarting ? "Обновление..." : "Начать работу"}
          </button>
          {!canStartWork && contractBlockReason && (
            <p className="work-detail__header-action-hint">
              Кнопка заблокирована до составления и подписания договора
              {contractBlockReason
                ? `: ${contractBlockReason.toLowerCase()}`
                : ""}
              .
            </p>
          )}
        </div>
      }
      meta={
        <>
          <span>
            Бюджет: <strong>{order?.budget || 0} ₽</strong>
          </span>
          <span>
            Локация: <strong>{order?.location || "Не указана"}</strong>
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
      loadingText="Загрузка информации о заказе..."
      error={error}
      onDismissError={() => setError(null)}
    >
      {activeTab === "estimateWorks" && (
        <EstimateWorks
          order_id={orderIdFinal}
          category_work_id={order?.category_work_id}
        />
      )}
      {/* 
      {activeTab === "schedule" && (
        <GraphicWorks
          orderId={orderIdFinal}
          categoryWorkId={order?.category_work_id}
        />
      )} */}

      {activeTab === "chat" && <Chat order_id={orderIdFinal} />}

      {activeTab === "customerInfo" && (
        <CustomerInfo customerId={order?.customer_id} />
      )}

      {activeTab === "orderInfo" && (
        <OrderInfoWithMyResponse order={order} embedded />
      )}

      <div
        style={{
          display:
            activeTab === "customerExecutorContract" ? "block" : "none",
        }}
      >
        <ContractExecutor
          order={order}
          onContractUpdated={handleContractUpdated}
        />
      </div>

      {/* {activeTab === "payment" && (
        <ExecutorPaymentStatus order={orderIdFinal} executorId={executorId} />
      )} */}

      {activeTab === "executorCancelOrder" && (
        <ExecutorCancelService
          order={order}
          executorId={userId}
          status="pending_customer"
          onCancelSuccess={() => {
            alert("Заявка отправлена! Ожидайте решения заказчика.");
          }}
          onCustomerCancelAgreed={onBack}
        />
      )}
    </WorkDetailLayout>
  );
}
