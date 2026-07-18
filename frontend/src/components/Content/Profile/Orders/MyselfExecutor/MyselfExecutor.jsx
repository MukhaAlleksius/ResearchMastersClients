import React, { useState, useEffect, useCallback, useMemo } from "react";
import { API, apiFetch } from "../../../../../utils/api.js";
import { useNavigate, useParams } from "react-router-dom";
import EstimateWorks from "../../Services/CommonComponent/EstimateWorksMaterials/EstimateWorks";
import GraphicWorks from "../../Services/CommonComponent/GraphicWorks/GraphicWorks";
import MoveToDraftModal from "../CommonComponents/MoveToDraft/MoveToDraftModal";
import OrderInfo from "../../Services/CommonComponent/CustomerOrderInfo/OrderInfo";
import WorkDetailLayout from "../../Common/WorkDetailLayout";
import { OrderDeleteFooterActions } from "../CommonComponents/DeleteOrder/DeleteOrderButton";
import "../../Services/CommonComponent/CustomerOrderInfo/customer_order_info.css";
import {
  getWorkDetailTabs,
  useWorkDetailInitialTab,
} from "../../Common/workDetailTabs";

const ORDER_STATUS = {
  DRAFT: "Не предложенные исполнителям",
};

export default function MyselfExecutor({ order, onBack, onOrderUpdated, onOrderDeleted, userId, listActivity }) {
  const [activeTab, setActiveTab] = useWorkDetailInitialTab("customer_self_execution");

  const tabs = useMemo(
    () => getWorkDetailTabs("customer_self_execution"),
    [],
  );

  const [orderData, setOrderData] = useState(null);

  const [loading, setLoading] = useState(true);

  const [loadingDraft, setLoadingDraft] = useState(false);

  const [showDraftModal, setShowDraftModal] = useState(false);

  const [error, setError] = useState(null);

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

      const updatedOrder = {
        ...currentOrder,

        status_order_customer: ORDER_STATUS.DRAFT,
      };

      if (onOrderUpdated) {
        onOrderUpdated(updatedOrder);
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
      title={currentOrder?.title || "Самостоятельное выполнение"}
      subtitle={orderId ? `Заказ № ${orderId}` : undefined}
      backLabel="Назад к заказам"
      onBack={onBack || (() => navigate(-1))}
      activityConfig={
        userId && orderId
          ? {
              userId,
              orderId,
              presetKey: "customer_self_execution",
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
            >
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

      {activeTab === "estimate" && currentOrder && (
        <EstimateWorks
          order_id={currentOrder.id}
          category_work_id={currentOrder.category_work_id}
        />
      )}

      {activeTab === "graphicWorks" && currentOrder && (
        <GraphicWorks
          orderId={currentOrder.id}
          categoryWorkId={currentOrder.category_work_id}
        />
      )}

      {showDraftModal && (
        <MoveToDraftModal
          variant="self"
          loading={loadingDraft}
          onClose={() => !loadingDraft && setShowDraftModal(false)}
          onConfirm={handleMoveToDraft}
        />
      )}
    </WorkDetailLayout>
  );
}
