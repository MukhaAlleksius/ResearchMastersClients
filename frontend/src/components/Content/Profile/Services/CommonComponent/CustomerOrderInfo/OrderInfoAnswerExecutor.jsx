import React, { useState, useEffect, useCallback } from "react";
import { API, apiFetch, buildApiUrl } from "../../../../../../utils/api.js";
import ExecutorResponseDisplay from "./ExecutorResponseDisplay";
import { OrderInfoEmpty, OrderDetailsGrid } from "./OrderInfoContent";
import "./customer_order_info.css";
const budgetTypes = ["Фиксированная цена", "Почасовая оплата", "Договорная цена"];

function OfferServiceIcon() {
  return (
    <svg
      className="order-customer-offer-btn__icon-svg"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 3L4 9v10a2 2 0 002 2h12a2 2 0 002-2V9l-8-6z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M9 14l2 2 4-4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function OrderInfoAnswerExecutor({
  order,
  embedded = false,
  primaryActionLabel = "Ответить заказчику",
  createModalTitle,
  buttonOnly = false,
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [activeTab, setActiveTab] = useState("order");

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState(null);

  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    proposed_price: "",

    budget_type: "",

    currency: "BYN",

    estimated_time: "",

    start_time_work: "",

    message: "",
  });

  const [orderResponseExecutor, setOrderResponseExecutor] = useState(null);

  const user_id = localStorage.getItem("user_id");

  const order_id = order?.id;

  const isEditing = Boolean(orderResponseExecutor?.id);

  const handlePriceChange = (e) => {
    const value = e.target.value;

    const validValue = value

      .replace(/[^0-9.]/g, "")

      .replace(/(\..*?)\./g, "$1");

    setFormData({ ...formData, proposed_price: validValue });
  };

  const formatDateForInput = (dateString) => {
    if (!dateString) return "";

    const parts = dateString.match(/(\d{1,2})\.(\d{1,2})\.(\d{2})/);

    if (parts) {
      const day = parts[1].padStart(2, "0");

      const month = parts[2].padStart(2, "0");

      const year = `20${parts[3]}`;

      return `${year}-${month}-${day}`;
    }

    try {
      const date = new Date(dateString);

      return date.toISOString().split("T")[0];
    } catch {
      return "";
    }
  };

  const formatDateForBackend = (isoDate) => {
    if (!isoDate) return "";

    try {
      const date = new Date(isoDate);

      return date.toLocaleDateString("ru-RU", {
        day: "2-digit",

        month: "2-digit",

        year: "2-digit",
      });
    } catch {
      return isoDate;
    }
  };

  const fetchResponseExecutorForOrder = useCallback(async () => {
    if (!user_id || !order_id) return;

    try {
      setLoading(true);

      setError(null);

      const response = await apiFetch(
        buildApiUrl(`/order_response_executor/${user_id}/${order_id}`),
      );

      if (response.status === 404 || response.status === 409) {
        setOrderResponseExecutor(null);

        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      setOrderResponseExecutor(data);

      setFormData({
        proposed_price: data.proposed_price?.toString() || "",

        budget_type: data.budget_type || "",

        currency: data.currency || "BYN",

        estimated_time: data.estimated_time || "",

        start_time_work: data.start_time_work || "",

        message: data.message || "",
      });
    } catch (err) {
      console.error("Ошибка загрузки ответа:", err);

      setError("Не удалось загрузить ваш ответ");
    } finally {
      setLoading(false);
    }
  }, [user_id, order_id]);

  useEffect(() => {
    fetchResponseExecutorForOrder();
  }, [fetchResponseExecutorForOrder]);

  const validateForm = () => {
    if (!formData.proposed_price || parseFloat(formData.proposed_price) <= 0) {
      setError("Цена должна быть больше 0");

      return false;
    }

    if (!formData.estimated_time.trim()) {
      setError("Укажите срок выполнения");

      return false;
    }

    return true;
  };

  const buildPayload = () => ({
    order_id: order_id,

    executor_id: parseInt(user_id, 10),

    proposed_price: parseFloat(formData.proposed_price),

    budget_type: formData.budget_type || null,

    currency: formData.currency,

    estimated_time: formData.estimated_time,

    start_time_work: formatDateForBackend(formData.start_time_work),

    message: formData.message || null,
  });

  const handleCreateResponse = async () => {
    if (!user_id || !order_id) {
      setError("Ошибка данных");

      return;
    }

    if (!validateForm()) return;

    setSubmitting(true);

    setError(null);

    try {
      const payload = buildPayload();

      const response = await apiFetch(
        buildApiUrl("/add_order_response_executor"),

        {
          method: "POST",

          headers: { "Content-Type": "application/json" },

          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));

        throw new Error(errBody.detail || `Ошибка: ${response.status}`);
      }

      const statusRes = await apiFetch(
        buildApiUrl("/add_status_order_executor"),

        {
          method: "POST",

          headers: { "Content-Type": "application/json" },

          body: JSON.stringify({
            order_id: order_id,

            executor_id: parseInt(user_id, 10),

            status: "На рассмотрении заказчика",
          }),
        },
      );

      if (!statusRes.ok) {
        console.warn("Ответ сохранён, но статус услуги не обновился");
      }

      const data = await response.json();

      setOrderResponseExecutor(data);

      setIsModalOpen(false);

      alert("Предложение отправлено заказчику!");
    } catch (err) {
      console.error("Ошибка отправки:", err);

      setError(err.message || "Не удалось отправить предложение");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateResponse = async () => {
    if (!user_id || !order_id || !orderResponseExecutor?.id) {
      setError("Ошибка данных");

      return;
    }

    if (!validateForm()) return;

    setSubmitting(true);

    setError(null);

    try {
      const response = await apiFetch(
        buildApiUrl(`/update_order_response_executor/${user_id}/${order_id}`),

        {
          method: "PUT",

          headers: { "Content-Type": "application/json" },

          body: JSON.stringify(buildPayload()),
        },
      );

      if (!response.ok) {
        throw new Error(`Ошибка: ${response.status}`);
      }

      const data = await response.json();

      setOrderResponseExecutor(data);

      setIsModalOpen(false);

      alert("Ответ обновлён!");
    } catch (err) {
      console.error("Ошибка обновления:", err);

      setError("Ошибка обновления ответа");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitResponse = () => {
    if (isEditing) {
      handleUpdateResponse();
    } else {
      handleCreateResponse();
    }
  };

  const openCreateModal = () => {
    setFormData({
      proposed_price: "",

      budget_type: "",

      currency: "BYN",

      estimated_time: "",

      start_time_work: "",

      message: "",
    });

    setError(null);

    setIsModalOpen(true);
  };

  if (!order) {
    return (
      <OrderInfoEmpty message="Загрузите заказ или выберите услугу из списка" />
    );
  }

  const { id, title, category_work } = order;

  const offerButtonLabel = primaryActionLabel;
  const modalCreateTitle = createModalTitle || primaryActionLabel;

  const responseModal = isModalOpen && (
    <div
      className="oi-modal-overlay"
      onClick={() => setIsModalOpen(false)}
      role="presentation"
    >
      <div
        className="oi-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-response-title"
      >
        <header className="oi-modal__header">
          <h3 id="edit-response-title" className="oi-modal__title">
            {isEditing ? "Редактировать предложение" : modalCreateTitle}
          </h3>

          <button
            type="button"
            className="oi-modal__close"
            onClick={() => setIsModalOpen(false)}
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
            <span className="oi-modal__field-label">
              Предложенная цена ({formData.currency})
            </span>

            <input
              type="text"
              className="oi-modal__input"
              placeholder="1500.00"
              value={formData.proposed_price}
              onChange={handlePriceChange}
            />
          </label>

          <label className="oi-modal__field">
            <span className="oi-modal__field-label">Тип бюджета</span>

            <select
              className="oi-modal__select"
              value={formData.budget_type}
              onChange={(e) =>
                setFormData({ ...formData, budget_type: e.target.value })
              }
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
            <span className="oi-modal__field-label">Валюта</span>

            <select
              className="oi-modal__select"
              value={formData.currency}
              onChange={(e) =>
                setFormData({ ...formData, currency: e.target.value })
              }
            >
              <option value="BYN">BYN</option>

              <option value="USD">USD</option>

              <option value="EUR">EUR</option>

              <option value="RUB">RUB</option>
            </select>
          </label>

          <label className="oi-modal__field">
            <span className="oi-modal__field-label">Срок выполнения</span>

            <input
              type="text"
              className="oi-modal__input"
              placeholder="2 недели"
              value={formData.estimated_time}
              onChange={(e) =>
                setFormData({
                  ...formData,

                  estimated_time: e.target.value,
                })
              }
            />
          </label>

          <label className="oi-modal__field">
            <span className="oi-modal__field-label">Дата начала</span>

            <input
              type="date"
              className="oi-modal__input"
              value={formatDateForInput(formData.start_time_work)}
              onChange={(e) =>
                setFormData({
                  ...formData,

                  start_time_work: e.target.value,
                })
              }
            />
          </label>

          <label className="oi-modal__field">
            <span className="oi-modal__field-label">Сообщение заказчику</span>

            <textarea
              className="oi-modal__textarea"
              placeholder="Расскажите о вашем предложении…"
              value={formData.message}
              onChange={(e) =>
                setFormData({ ...formData, message: e.target.value })
              }
            />
          </label>
        </div>

        <footer className="oi-modal__footer">
          <button
            type="button"
            className="oi-modal__btn-cancel"
            onClick={() => setIsModalOpen(false)}
            disabled={submitting}
          >
            Отмена
          </button>

          <button
            type="button"
            className="oi-modal__btn-submit"
            onClick={handleSubmitResponse}
            disabled={submitting || !formData.proposed_price}
          >
            {submitting
              ? "Сохранение…"
              : isEditing
                ? "Обновить"
                : "Отправить"}
          </button>
        </footer>
      </div>
    </div>
  );

  if (buttonOnly) {
    if (loading) {
      return <p className="order-customer-offer-loading">Загрузка…</p>;
    }

    return (
      <>
        {orderResponseExecutor ? (
          <div className="order-customer-offer-status">
            <span className="order-customer-offer-status__badge">Отправлено</span>
            <p className="order-customer-offer-sent">
              Вы уже отправили предложение по этому заказу.
            </p>
            <button
              type="button"
              className="order-customer-offer-btn order-customer-offer-btn--secondary"
              onClick={() => setIsModalOpen(true)}
            >
              <span className="order-customer-offer-btn__label">
                Редактировать предложение
              </span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="order-customer-offer-btn"
            onClick={openCreateModal}
          >
            <span className="order-customer-offer-btn__icon">
              <OfferServiceIcon />
            </span>
            <span className="order-customer-offer-btn__text">
              <span className="order-customer-offer-btn__label">
                {offerButtonLabel}
              </span>
              <span className="order-customer-offer-btn__hint">
                Укажите цену, срок и сообщение заказчику
              </span>
            </span>
            <span className="order-customer-offer-btn__arrow" aria-hidden="true">
              →
            </span>
          </button>
        )}
        {responseModal}
      </>
    );
  }

  return (
    <div
      className={`order-info ${embedded ? "order-info--embedded" : ""}`.trim()}
    >
      <article className="order-info__shell">
        {!embedded && (
          <header className="order-info__hero">
            <span className="order-info__badge">Заказ</span>

            <h2 className="order-info__title">{title || `Заказ #${id}`}</h2>

            <p className="order-info__subtitle">
              {category_work ? `${category_work} · ` : ""}№{id}
            </p>
          </header>
        )}

        <nav className="order-info__tabs" aria-label="Разделы заказа">
          <button
            type="button"
            className={`order-info__tab ${activeTab === "order" ? "order-info__tab--active" : ""}`}
            onClick={() => setActiveTab("order")}
          >
            Детали заказа
          </button>

          <button
            type="button"
            className={`order-info__tab ${activeTab === "response" ? "order-info__tab--active" : ""}`}
            onClick={() => setActiveTab("response")}
          >
            Мой ответ
          </button>
        </nav>

        {activeTab === "order" && (
          <OrderDetailsGrid order={order} embedded={embedded} />
        )}

        {activeTab === "response" && (
          <div className="order-info__panel">
            {loading ? (
              <p className="order-info__loading">Загрузка ответа…</p>
            ) : orderResponseExecutor ? (
              <ExecutorResponseDisplay
                response={orderResponseExecutor}
                title="Ваше предложение"
                showExecutorName={false}
              >
                <button
                  type="button"
                  className="order-info__btn-secondary"
                  onClick={() => setIsModalOpen(true)}
                >
                  Редактировать ответ
                </button>
              </ExecutorResponseDisplay>
            ) : (
              <>
                <p className="order-info__response-empty">
                  Вы пока не отправляли ответ на этот заказ.
                </p>

                <button
                  type="button"
                  className="order-info__btn-primary"
                  onClick={openCreateModal}
                >
                  {offerButtonLabel}
                </button>
              </>
            )}
          </div>
        )}
      </article>

      {responseModal}
    </div>
  );
}
