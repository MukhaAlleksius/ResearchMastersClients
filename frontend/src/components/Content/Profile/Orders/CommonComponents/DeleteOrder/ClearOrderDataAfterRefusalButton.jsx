import React, { useState } from "react";
import { API, apiFetch } from "../../../../../../utils/api.js";
import ClearOrderDataAfterRefusalModal from "./ClearOrderDataAfterRefusalModal";
import "../../../Services/CommonComponent/CustomerOrderInfo/customer_order_info.css";
export default function ClearOrderDataAfterRefusalButton({
  orderId,
  orderTitle,
  onCleared,
  className = "order-info__btn-delete",
}) {
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleConfirm = async () => {
    const customerId = Number(localStorage.getItem("user_id"));
    if (!customerId || !orderId) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ customer_id: String(customerId) });
      const response = await apiFetch(
        `${API.baseURL}/order/${orderId}/clear_after_executor_refusal?${params.toString()}`,
        { method: "POST" },
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const detail = data.detail;
        const message = Array.isArray(detail)
          ? detail.map((item) => item.msg).join(", ")
          : detail || "Не удалось удалить данные заказа";
        throw new Error(message);
      }

      setShowModal(false);
      onCleared?.();
    } catch (err) {
      setError(err.message || "Не удалось удалить данные заказа");
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
        <ClearOrderDataAfterRefusalModal
          orderTitle={orderTitle}
          loading={loading}
          onClose={() => !loading && setShowModal(false)}
          onConfirm={handleConfirm}
        />
      )}
    </>
  );
}
