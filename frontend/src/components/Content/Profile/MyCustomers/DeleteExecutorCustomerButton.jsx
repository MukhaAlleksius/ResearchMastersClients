import React, { useState } from "react";
import { API, apiFetch } from "../../../../utils/api.js";
import DeleteExecutorCustomerModal from "./DeleteExecutorCustomerModal";

export default function DeleteExecutorCustomerButton({
  executorId,
  customerId,
  customerName,
  onDeleted,
  className = "my-customers__delete",
  label = "Удалить",
}) {
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleConfirm = async () => {
    if (!executorId || !customerId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await apiFetch(
        `${API.baseURL}/executor_customers/${executorId}/${customerId}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const detail = data.detail;
        const message = Array.isArray(detail)
          ? detail.map((item) => item.msg).join(", ")
          : detail || "Не удалось удалить заказчика";
        throw new Error(message);
      }

      setShowModal(false);
      onDeleted?.(customerId);
    } catch (err) {
      setError(err.message || "Не удалось удалить заказчика");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {error && !showModal && (
        <p className="my-customers__delete-error" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        className={className}
        onClick={(event) => {
          event.stopPropagation();
          setError(null);
          setShowModal(true);
        }}
        disabled={loading}
        aria-label={`${label} заказчика ${customerName || ""}`.trim()}
        title={label}
      >
        {label}
      </button>

      {showModal && (
        <DeleteExecutorCustomerModal
          customerName={customerName}
          loading={loading}
          onClose={() => !loading && setShowModal(false)}
          onConfirm={handleConfirm}
        />
      )}
    </>
  );
}
