import { useState, useMemo } from "react";
import { API, apiFetch, ensureStoredUserId } from "../../../../utils/api.js";
import "./make_order_executor_modal.css";
async function readErrorMessage(response, fallback) {
  try {
    const data = await response.json();
    if (typeof data?.detail === "string") return data.detail;
    if (data?.detail) return JSON.stringify(data.detail);
  } catch {
    // ignore
  }
  return fallback;
}
export default function MakeOrderExecutorModal({
  ordersCustomer = [],
  closeOrderModal,
  handleOrderSelect,
  executorId,
}) {
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const toggleOrder = (orderId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const selectedOrders = useMemo(
    () => ordersCustomer.filter((o) => selectedIds.has(o.id)),
    [ordersCustomer, selectedIds],
  );

  const totalCount = ordersCustomer.length;
  const selectedCount = selectedOrders.length;
  const allSelected = totalCount > 0 && selectedIds.size === totalCount;

  const toggleSelectAll = () => {
    setSelectedIds(
      allSelected ? new Set() : new Set(ordersCustomer.map((o) => o.id)),
    );
  };

  const handleSubmit = async () => {
    if (selectedOrders.length === 0) return;

    if (handleOrderSelect) handleOrderSelect(selectedOrders);

    try {
      const customerId = await ensureStoredUserId();
      if (!customerId) {
        alert("Не удалось определить пользователя. Войдите в аккаунт снова.");
        return;
      }

      for (const order of selectedOrders) {
        const customerResponse = await apiFetch(
          `${API.baseURL}/add_status_order_customer`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              order_id: order.id,
              customer_id: customerId,
              status: "В поиске исполнителя",
            }),
          },
        );

        const executorResponse = await apiFetch(
          `${API.baseURL}/add_status_order_executor`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              order_id: order.id,
              executor_id: Number(executorId),
              status: "Предложения заказчиков",
            }),
          },
        );

        if (!customerResponse.ok) {
          alert(
            await readErrorMessage(
              customerResponse,
              "Не удалось обновить статус заказа",
            ),
          );
          return;
        }

        if (!executorResponse.ok) {
          alert(
            await readErrorMessage(
              executorResponse,
              "Не удалось предложить заказ мастеру",
            ),
          );
          return;
        }
      }
      closeOrderModal();
    } catch (error) {
      console.log("Ошибка добавления данных", error);
      alert(error.message || "Не удалось предложить заказ мастеру");
    }
  };

  return (
    <div
      className="moe-modal-overlay"
      onClick={closeOrderModal}
      role="presentation"
    >
      <div
        className="moe-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="moe-modal-title"
      >
        <header className="moe-modal__header">
          <h2 id="moe-modal-title" className="moe-modal__title">
            Предложить заказы мастеру
          </h2>
          <button
            type="button"
            className="moe-modal__close"
            onClick={closeOrderModal}
            aria-label="Закрыть"
          >
            ×
          </button>
        </header>

        <div className="moe-modal__body">
          {totalCount === 0 ? (
            <p className="moe-modal__empty">
              Нет заказов со статусом «В поиске исполнителя», которые ещё не
              были предложены этому мастеру.
            </p>
          ) : (
            <>
              <div className="moe-modal__toolbar">
                <span className="moe-modal__count">
                  {selectedCount} из {totalCount}
                </span>
                <button
                  type="button"
                  className="moe-modal__link"
                  onClick={toggleSelectAll}
                >
                  {allSelected ? "Снять выбор" : "Выбрать все"}
                </button>
              </div>
              <ul className="moe-modal__list">
                {ordersCustomer.map((order) => (
                  <li key={order.id}>
                    <label className="moe-order-row">
                      <input
                        type="checkbox"
                        className="moe-order-row__checkbox"
                        checked={selectedIds.has(order.id)}
                        onChange={() => toggleOrder(order.id)}
                      />
                      <span className="moe-order-row__main">
                        <span className="moe-order-row__title">
                          {order.title || "Без названия"}
                        </span>
                        {(order.id != null || order.date) && (
                          <span className="moe-order-row__meta">
                            {order.id != null && <>№{order.id}</>}
                            {order.id != null && order.date && " · "}
                            {order.date}
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <footer className="moe-modal__footer">
          <button
            type="button"
            className="moe-modal__btn moe-modal__btn--secondary"
            onClick={closeOrderModal}
          >
            Отмена
          </button>
          <button
            type="button"
            className="moe-modal__btn moe-modal__btn--primary"
            onClick={handleSubmit}
            disabled={selectedCount === 0 || totalCount === 0}
          >
            Отправить{selectedCount > 0 ? ` (${selectedCount})` : ""}
          </button>
        </footer>
      </div>
    </div>
  );
}
