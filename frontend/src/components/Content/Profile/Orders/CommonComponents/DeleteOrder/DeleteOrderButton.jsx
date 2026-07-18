import React, { useState } from "react";
import { API, apiFetch } from "../../../../../../utils/api.js";
import DeleteOrderModal from "./DeleteOrderModal";
import { canCustomerDeleteOrder } from "../../../../../../utils/orderDelete";
import "../../../Services/CommonComponent/CustomerOrderInfo/customer_order_info.css";
export default function DeleteOrderButton({
  orderId,
  orderTitle,
  statusOrderCustomer,
  onDeleted,
  className = "order-info__btn-delete",
}) {
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!canCustomerDeleteOrder(statusOrderCustomer)) {
    return null;
  }

  const handleConfirm = async () => {
    if (!orderId) {
      setError("Не удалось определить заказ или пользователя");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiFetch(
        `${API.baseURL}/order/${orderId}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const detail = data.detail;
        const message = Array.isArray(detail)
          ? detail.map((item) => item.msg).join(", ")
          : detail || "Не удалось удалить заказ";
        throw new Error(message);
      }

      setShowModal(false);
      onDeleted?.();
    } catch (err) {
      setError(err.message || "Не удалось удалить заказ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {error && !showModal && (
        <p className="order-info__alert" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        className={className}
        onClick={() => {
          setError(null);
          setShowModal(true);
        }}
        disabled={loading}
      >
        Удалить заказ
      </button>

      {showModal && (
        <DeleteOrderModal
          orderTitle={orderTitle}
          loading={loading}
          error={error}
          onClose={() => !loading && setShowModal(false)}
          onConfirm={handleConfirm}
        />
      )}
    </>
  );
}

export function OrderDeleteFooterActions({
  orderId,
  orderTitle,
  statusOrderCustomer,
  onDeleted,
  hideDelete = false,
  children,
}) {
  const showDelete = !hideDelete && canCustomerDeleteOrder(statusOrderCustomer);

  if (!showDelete && !children) {
    return null;
  }

  return (
    <div className="order-info__footer-actions">
      {children}
      {showDelete && (
        <DeleteOrderButton
          orderId={orderId}
          orderTitle={orderTitle}
          statusOrderCustomer={statusOrderCustomer}
          onDeleted={onDeleted}
        />
      )}
    </div>
  );
}
