import { useState, useEffect, useCallback, useMemo } from "react";
import { apiFetch, buildApiUrl, ensureStoredUserId } from "../../../../../utils/api.js";
import { useNavigate, useParams } from "react-router-dom";
import Chat from "../CommonComponent/ChatOrderMaster/ChatOrderMaster";
import CustomerInfo from "../CommonComponent/InformationAboutCustomer/InformationAboutCustomer";
import EstimateWorks from "../CommonComponent/EstimateWorksMaterials/EstimateWorks";
import ExecutorCancelService from "../CommonComponent/ExecutorCancelService/ExecutorCancelService";
import OrderInfoWithMyResponse from "../CommonComponent/CustomerOrderInfo/OrderInfoWithMyResponse";
import WorkDetailLayout from "../../Common/WorkDetailLayout";
import StartWorkModal from "./StartWorkModal";
import "./WaitExecuteWork.css";
import {
  getWorkDetailTabs,
  useWorkDetailInitialTab,
} from "../../Common/workDetailTabs";

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
  const [showStartModal, setShowStartModal] = useState(false);
  const [error, setError] = useState(null);
  const [modalError, setModalError] = useState(null);

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

  const openStartModal = useCallback(() => {
    if (isStarting || !orderIdFinal) return;
    setModalError(null);
    setShowStartModal(true);
  }, [isStarting, orderIdFinal]);

  const closeStartModal = useCallback(() => {
    if (isStarting) return;
    setShowStartModal(false);
    setModalError(null);
  }, [isStarting]);

  const handleStartExecuteWork = useCallback(async () => {
    if (isStarting || !orderIdFinal) return;

    setIsStarting(true);
    setModalError(null);
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
      setShowStartModal(false);

      if (onServiceStatusChanged) {
        onServiceStatusChanged(parsedOrderId, newStatus);
      } else {
        navigate("/profile/services", {
          state: { activeStatusTab: "inProgress" },
        });
      }
    } catch (err) {
      setModalError(err.message || "Ошибка при начале работы");
    } finally {
      setIsStarting(false);
    }
  }, [isStarting, orderIdFinal, navigate, onServiceStatusChanged]);

  const tabs = useMemo(
    () =>
      getWorkDetailTabs("executor_wait_execute", {
        chatLabel: "Чат с заказчиком",
      }),
    [],
  );

  return (
    <>
      <WorkDetailLayout
        title={order?.title || "Ожидание выполнения"}
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
              onClick={openStartModal}
              disabled={isStarting || !orderIdFinal}
              className="work-detail__btn-primary"
            >
              {isStarting ? "Обновление..." : "Начать работу"}
            </button>
          </div>
        }
        meta={
          <>
            <span>
              Бюджет:{" "}
              <strong>
                {order?.budget != null
                  ? `${Number(order.budget).toLocaleString()} ${order.currency || "BYN"}`
                  : "—"}
              </strong>
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

        {activeTab === "chat" && <Chat order_id={orderIdFinal} />}

        {activeTab === "customerInfo" && (
          <CustomerInfo customerId={order?.customer_id} />
        )}

        {activeTab === "orderInfo" && (
          <OrderInfoWithMyResponse order={order} embedded />
        )}

        {activeTab === "executorCancelOrder" && (
          <ExecutorCancelService
            order={order}
            executorId={userId}
            status="pending_customer"
            allowExecutorDecision={false}
            onCancelSuccess={() => {
              alert("Заявка отправлена! Ожидайте решения заказчика.");
            }}
            onCustomerCancelAgreed={onBack}
          />
        )}
      </WorkDetailLayout>

      {showStartModal && (
        <StartWorkModal
          orderTitle={order?.title}
          onClose={closeStartModal}
          onConfirm={handleStartExecuteWork}
          loading={isStarting}
          error={modalError}
        />
      )}
    </>
  );
}
