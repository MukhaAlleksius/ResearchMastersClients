import React, { useState } from "react";
import { API, apiFetch } from "../../../../utils/api.js";
import DeleteCustomerExecutorModal from "./DeleteCustomerExecutorModal";
export default function DeleteCustomerExecutorButton({
  customerId,
  executorId,
  executorName,
  onDeleted,
  className = "my-executors__delete",
  label = "Удалить",
}) {
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleConfirm = async () => {
    if (!customerId || !executorId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await apiFetch(
        `${API.baseURL}/customer_executors/${customerId}/${executorId}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const detail = data.detail;
        const message = Array.isArray(detail)
          ? detail.map((item) => item.msg).join(", ")
          : detail || "Не удалось удалить исполнителя";
        throw new Error(message);
      }

      setShowModal(false);
      onDeleted?.(executorId);
    } catch (err) {
      setError(err.message || "Не удалось удалить исполнителя");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {error && !showModal && (
        <p className="my-executors__delete-error" role="alert">
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
        aria-label={`${label} исполнителя ${executorName || ""}`.trim()}
        title={label}
      >
        {label}
      </button>

      {showModal && (
        <DeleteCustomerExecutorModal
          executorName={executorName}
          loading={loading}
          onClose={() => !loading && setShowModal(false)}
          onConfirm={handleConfirm}
        />
      )}
    </>
  );
}
