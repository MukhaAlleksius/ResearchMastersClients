import React, { useState, useEffect } from "react";
import { API, apiFetch, buildApiUrl, ensureStoredUserId } from "../../../../../../utils/api.js";
import OrderInfoCard from "./OrderInfo";
import "./customer_order_info.css";
const budgetTypes = ["Фиксированная цена", "Почасовая оплата", "Договорная цена"];
const currencies = ["BYN", "Dollar USA", "Euro"];

const formatDateDDMMYY = (dateString) => {
  if (!dateString || dateString === "") return null;

  const date = new Date(dateString);
  if (isNaN(date.getTime())) return null;

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);

  return `${day}.${month}.${year}`;
};

function ResponseModal({ onClose, onSend, order }) {
  const [startDateIso, setStartDateIso] = useState("");
  const [duration, setDuration] = useState("");
  const [cost, setCost] = useState("");
  const [message, setMessage] = useState("");
  const [budgetType, setBudgetType] = useState("");
  const [currency, setCurrency] = useState("BYN");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (order?.start_time_work) {
      const [day, month, year] = order.start_time_work.split(".");
      setStartDateIso(`${year.padStart(4, "20")}-${month}-${day}`);
    }
  }, [order]);

  const handleSend = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const executorId = await ensureStoredUserId();
      if (!executorId) {
        setError("Не удалось определить пользователя. Войдите снова.");
        return;
      }

      const startDateFormatted = formatDateDDMMYY(startDateIso);
      const parsedCost = cost ? parseFloat(cost) : null;
      if (cost && (!Number.isFinite(parsedCost) || parsedCost <= 0)) {
        setError("Укажите корректную стоимость");
        return;
      }

      const response_executor_order = {
        order_id: order.id,
        executor_id: executorId,
        proposed_price: parsedCost,
        budget_type: budgetType || null,
        currency: currency || null,
        estimated_time: duration || null,
        start_time_work: startDateFormatted,
        message: message || null,
      };

      const status_order_executor = {
        order_id: order.id,
        executor_id: executorId,
        status: "На рассмотрении заказчика",
      };

      const response = await apiFetch(
        buildApiUrl("/add_order_response_executor"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(response_executor_order),
        },
      );

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        const detail = errBody.detail;
        const messageText = Array.isArray(detail)
          ? detail.map((item) => item.msg || item).join(", ")
          : detail || `Ошибка: ${response.status}`;
        setError(messageText);
        return;
      }

      const response_status_order_executor = await apiFetch(
        buildApiUrl("/add_status_order_executor"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(status_order_executor),
        },
      );

      if (!response_status_order_executor.ok) {
        const errBody = await response_status_order_executor.json().catch(() => ({}));
        setError(
          errBody.detail ||
            "Ответ сохранён, но не удалось обновить статус. Попробуйте ещё раз.",
        );
        return;
      }

      onSend({
        startDate: startDateFormatted,
        duration,
        cost,
        message,
      });
      onClose();
    } catch (err) {
      console.error("Ошибка:", err);
      setError(err.message || "Не удалось отправить ответ");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="oi-modal-overlay oi-modal-overlay--light"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="oi-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="response-modal-title"
      >
        <header className="oi-modal__header">
          <h3 id="response-modal-title" className="oi-modal__title">
            Ответить заказчику
          </h3>
          <button
            type="button"
            className="oi-modal__close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </header>

        <div className="oi-modal__body">
          {error && (
            <div className="order-info__alert" role="alert">
              {error}
            </div>
          )}

          <label className="oi-modal__field">
            <span className="oi-modal__field-label">Дата начала работы</span>
            <input
              type="date"
              className="oi-modal__input"
              value={startDateIso}
              onChange={(e) => setStartDateIso(e.target.value)}
            />
          </label>

          <label className="oi-modal__field">
            <span className="oi-modal__field-label">Сроки выполнения</span>
            <input
              type="text"
              className="oi-modal__input"
              placeholder="Например: 2 недели"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </label>

          <label className="oi-modal__field">
            <span className="oi-modal__field-label">Тип бюджета</span>
            <select
              className="oi-modal__select"
              value={budgetType}
              onChange={(e) => setBudgetType(e.target.value)}
            >
              <option value="">Выберите тип бюджета</option>
              {budgetTypes.map((bt) => (
                <option key={bt} value={bt}>
                  {bt}
                </option>
              ))}
            </select>
          </label>

          <label className="oi-modal__field">
            <span className="oi-modal__field-label">Стоимость работ</span>
            <input
              type="text"
              className="oi-modal__input"
              placeholder="Введите стоимость"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
          </label>

          <label className="oi-modal__field">
            <span className="oi-modal__field-label">Валюта</span>
            <select
              className="oi-modal__select"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              <option value="">Выберите валюту</option>
              {currencies.map((cur) => (
                <option key={cur} value={cur}>
                  {cur}
                </option>
              ))}
            </select>
          </label>

          <label className="oi-modal__field">
            <span className="oi-modal__field-label">Сообщение</span>
            <textarea
              className="oi-modal__textarea"
              placeholder="Введите сообщение заказчику"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>
        </div>

        <footer className="oi-modal__footer">
          <button
            type="button"
            className="oi-modal__btn-cancel"
            onClick={onClose}
            disabled={submitting}
          >
            Отмена
          </button>
          <button
            type="button"
            className="oi-modal__btn-submit"
            onClick={handleSend}
            disabled={submitting}
          >
            {submitting ? "Отправка…" : "Отправить"}
          </button>
        </footer>
      </div>
    </div>
  );
}

export default function OrderInfoForAnswerExecutor({ order, embedded = false }) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (!order) {
    return <OrderInfoCard />;
  }

  const handleSendResponse = (data) => {
    console.log("Ответ исполнителя:", data);
    alert(
      `Ответ отправлен!\nДата начала: ${data.startDate}\nСроки: ${data.duration}\nСтоимость: ${data.cost}\nСообщение: ${data.message}`,
    );
  };

  return (
    <>
      <OrderInfoCard
        order={order}
        embedded={embedded}
        badge="Предложение заказа"
        footer={
          <button
            type="button"
            className="order-info__btn-primary"
            onClick={() => setIsModalOpen(true)}
          >
            Ответить заказчику
          </button>
        }
      />

      {isModalOpen && (
        <ResponseModal
          onClose={() => setIsModalOpen(false)}
          onSend={handleSendResponse}
          order={order}
        />
      )}
    </>
  );
}
