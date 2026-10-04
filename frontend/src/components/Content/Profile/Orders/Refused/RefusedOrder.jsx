import React, { useState, useEffect, useCallback, useMemo } from "react";
import { API, apiFetch } from "../../../../../utils/api.js";
import { useNavigate, useParams } from "react-router-dom";
import MoveToDraftModal from "../CommonComponents/MoveToDraft/MoveToDraftModal";
import OrderCustomer from "../../../Orders/OrderCustomer.jsx";
import WorkDetailLayout from "../../Common/WorkDetailLayout";
import { OrderDeleteFooterActions } from "../CommonComponents/DeleteOrder/DeleteOrderButton";
import {
  getWorkDetailTabs,
  useWorkDetailInitialTab,
} from "../../Common/workDetailTabs";
import "../../../Orders/order_customer.css";
import "../../Services/CommonComponent/CustomerOrderInfo/customer_order_info.css";
import "../CommonComponents/CustomerCancelOrder/cancel_order.css";

const ORDER_STATUS = {
  DRAFT: "Не предложенные исполнителям",
};

export default function RefusedOrder({
  order,
  onBack,
  onOrderUpdated,
  onOrderDeleted,
  statusLabel,
}) {
  const [activeTab, setActiveTab] = useWorkDetailInitialTab("customer_refused");
  const [orderData, setOrderData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [error, setError] = useState(null);

  const navigate = useNavigate();
  const { slug } = useParams();
  const orderId = order?.id || slug;
  const currentOrder = orderData || order;
  const pageTitle = statusLabel || currentOrder?.status_order_customer || "Отказ";

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

  const tabs = useMemo(() => getWorkDetailTabs("customer_refused"), []);

  const handleMoveToDraft = async () => {
    if (!currentOrder?.id) return;

    setLoadingDraft(true);
    setError(null);

    const customerId = Number(localStorage.getItem("user_id"));

    try {
      const response = await apiFetch(`${API.baseURL}/add_status_order_customer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: currentOrder.id,
          customer_id: customerId,
          status: ORDER_STATUS.DRAFT,
        }),
      });

      if (!response.ok) {
        throw new Error("Ошибка сервера при смене статуса");
      }

      setShowDraftModal(false);

      if (onOrderUpdated) {
        onOrderUpdated({
          ...currentOrder,
          status_order_customer: ORDER_STATUS.DRAFT,
        });
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
      title={currentOrder?.title || pageTitle}
      backLabel="Назад к заказам"
      showOptionalNotice={false}
      onBack={onBack || (() => navigate(-1))}
      headerExtra={
        <button
          type="button"
          onClick={() => setShowDraftModal(true)}
          disabled={loadingDraft || !currentOrder?.id}
          className="work-detail__btn-primary"
        >
          {loadingDraft ? "Сохраняем..." : "Убрать заказ в черновик"}
        </button>
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
        <>
          <div
            className="cancel-tab__notice cancel-tab__notice--info"
            role="note"
            style={{ marginBottom: 16 }}
          >
            Сотрудничество с исполнителем завершено. Заказ не виден в поиске.
            Уберите его в черновик, при необходимости поправьте данные и снова
            опубликуйте.
          </div>
          <OrderCustomer
            order={currentOrder}
            embedded
            showOfferActions={false}
            showCustomerSection={false}
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
        </>
      )}

      {showDraftModal && (
        <MoveToDraftModal
          variant="refused"
          loading={loadingDraft}
          onClose={() => !loadingDraft && setShowDraftModal(false)}
          onConfirm={handleMoveToDraft}
        />
      )}
    </WorkDetailLayout>
  );
}
