import React, { useEffect, useState } from "react";
import { API, apiFetch } from "../../../../../../utils/api.js";
import DeleteExecutorServiceModal from "./DeleteExecutorServiceModal";
import "../CustomerOrderInfo/customer_order_info.css";
export default function DeleteExecutorServiceButton({
  orderId,
  orderTitle,
  onDeleted,
  className = "order-info__btn-delete",
}) {
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [canDelete, setCanDelete] = useState(false);

  useEffect(() => {
    const executorId = Number(localStorage.getItem("user_id"));
    if (!orderId || !executorId) {
      setCanDelete(false);
      return;
    }

    const params = new URLSearchParams({ executor_id: String(executorId) });
    apiFetch(
      `${API.baseURL}/order/${orderId}/executor_service_delete_eligibility?${params.toString()}`,
    )
      .then((response) => (response.ok ? response.json() : { can_delete: false }))
      .then((data) => setCanDelete(Boolean(data.can_delete)))
      .catch(() => setCanDelete(false));
  }, [orderId]);

  if (!canDelete) {
    return null;
  }

  const handleConfirm = async () => {
    const executorId = Number(localStorage.getItem("user_id"));
    if (!executorId || !orderId) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ executor_id: String(executorId) });
      const response = await apiFetch(
        `${API.baseURL}/order/${orderId}/executor_service?${params.toString()}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const detail = data.detail;
        const message = Array.isArray(detail)
          ? detail.map((item) => item.msg).join(", ")
          : detail || "Не удалось удалить услугу";
        throw new Error(message);
      }

      setShowModal(false);
      onDeleted?.();
    } catch (err) {
      setError(err.message || "Не удалось удалить услугу");
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

      <div className="order-info__footer-actions">
        <button
          type="button"
          className={className}
          onClick={() => {
            setError(null);
            setShowModal(true);
          }}
          disabled={loading}
        >
          Удалить услугу
        </button>
      </div>

      {showModal && (
        <DeleteExecutorServiceModal
          orderTitle={orderTitle}
          loading={loading}
          onClose={() => !loading && setShowModal(false)}
          onConfirm={handleConfirm}
        />
      )}
    </>
  );
}
