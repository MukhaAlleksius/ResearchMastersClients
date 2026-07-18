import React, { useState, useEffect, useMemo } from "react";
import { API, apiFetch } from "../../../../utils/api.js";
import { Link } from "react-router-dom";
import {
  FaSearch,
  FaBan,
  FaUser,
  FaHardHat,
  FaClock,
  FaArrowRight,
  FaInbox,
  FaBalanceScale,
} from "react-icons/fa";
import "./cancel_orders.css";

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminCancelOrdersList() {
  const [cancelOrders, setCancelOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetchCancelOrders = async () => {
      try {
        setError("");
        const res = await apiFetch(
          `${API.baseURL}/admin/cancel_orders_customers`,
        );
        if (res.status === 404) {
          setCancelOrders([]);
          return;
        }
        if (!res.ok) throw new Error("Не удалось загрузить список отказов");

        const data = await res.json();
        let cancelOrdersArray = [];
        if (Array.isArray(data)) {
          cancelOrdersArray = data;
        } else if (data?.cancel_orders_customers) {
          cancelOrdersArray = data.cancel_orders_customers;
        }
        setCancelOrders(cancelOrdersArray);
      } catch (err) {
        setError(err.message || "Ошибка загрузки");
        setCancelOrders([]);
      } finally {
        setLoading(false);
      }
    };

    fetchCancelOrders();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cancelOrders;
    return cancelOrders.filter((item) => {
      const haystack = [
        item.id,
        item.order_id,
        item.order_name,
        item.customer_name,
        item.executor_name,
        item.reason_type,
        item.reason_text,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [cancelOrders, search]);

  return (
    <div className="cancel-page">
      <header className="cancel-hero">
        <div className="cancel-hero__text">
          <span className="cancel-hero__badge">Админ · Модерация</span>
          <h1 className="cancel-hero__title">Отказы заказчиков</h1>
          <p className="cancel-hero__subtitle">
            Заявки на отмену заказа, по которым исполнитель не согласен — требуют решения администратора
          </p>
        </div>
        <div className="cancel-hero__stats">
          <div className="cancel-stat">
            <span className="cancel-stat__value">{cancelOrders.length}</span>
            <span className="cancel-stat__label">всего</span>
          </div>
          <div className="cancel-stat">
            <span className="cancel-stat__value">{filtered.length}</span>
            <span className="cancel-stat__label">найдено</span>
          </div>
        </div>
      </header>

      <div className="cancel-toolbar">
        <div className="cancel-search">
          <span className="cancel-search__icon" aria-hidden="true">
            <FaSearch size={14} />
          </span>
          <input
            className="cancel-search__input"
            type="search"
            placeholder="Поиск по заказу, имени, причине…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Поиск отказов"
          />
        </div>
      </div>

      {error && <div className="cancel-alert cancel-alert--error">{error}</div>}

      {loading ? (
        <div className="cancel-loading">
          <span className="cancel-spinner" />
          Загрузка отказов…
        </div>
      ) : filtered.length === 0 ? (
        <div className="cancel-empty">
          <span className="cancel-empty__icon" aria-hidden="true">
            <FaInbox size={40} />
          </span>
          <h2 className="cancel-empty__title">
            {cancelOrders.length === 0 ? "Нет отказов" : "Ничего не найдено"}
          </h2>
          <p className="cancel-empty__text">
            {cancelOrders.length === 0
              ? "Сейчас нет заявок на отмену заказов, требующих решения администратора."
              : "Попробуйте изменить поисковый запрос."}
          </p>
        </div>
      ) : (
        <div className="cancel-grid">
          {filtered.map((cancelOrder) => (
            <Link
              key={cancelOrder.id}
              to={`/admin/cancel_order/${cancelOrder.id}`}
              className="cancel-card-link"
            >
              <article className="cancel-card">
                <div className="cancel-card__head">
                  <div className="cancel-card__id-block">
                    <span className="cancel-card__icon" aria-hidden="true">
                      <FaBan size={14} />
                    </span>
                    <div>
                      <div className="cancel-card__id">Отказ #{cancelOrder.id}</div>
                      <div className="cancel-card__order-id">
                        Заказ #{cancelOrder.order_id}
                      </div>
                    </div>
                  </div>
                  <span className="cancel-card__status">
                    {cancelOrder.status === "disagree"
                      ? "На рассмотрении"
                      : cancelOrder.status || "Ожидает"}
                  </span>
                </div>

                <h3 className="cancel-card__title">
                  {cancelOrder.order_name || `Заказ #${cancelOrder.order_id}`}
                </h3>

                {(cancelOrder.reason_type || cancelOrder.reason_text) && (
                  <div className="cancel-card__reason">
                    {cancelOrder.reason_type && (
                      <strong>{cancelOrder.reason_type}</strong>
                    )}
                    {cancelOrder.reason_text && <div>{cancelOrder.reason_text}</div>}
                  </div>
                )}

                <div className="cancel-card__participants">
                  <div className="cancel-card__participant">
                    <span className="cancel-card__participant-icon">
                      <FaUser size={12} />
                    </span>
                    <span>
                      Заказчик:{" "}
                      {cancelOrder.customer_name ||
                        (cancelOrder.customer_id
                          ? `ID ${cancelOrder.customer_id}`
                          : "не указан")}
                    </span>
                  </div>
                  <div className="cancel-card__participant">
                    <span className="cancel-card__participant-icon">
                      <FaHardHat size={12} />
                    </span>
                    <span>
                      Исполнитель:{" "}
                      {cancelOrder.executor_name ||
                        (cancelOrder.executor_id
                          ? `ID ${cancelOrder.executor_id}`
                          : "не указан")}
                    </span>
                  </div>
                </div>

                {cancelOrder.executor_comment && (
                  <div className="cancel-card__comment">
                    Ответ исполнителя: {cancelOrder.executor_comment}
                  </div>
                )}

                <div className="cancel-card__footer">
                  <span className="cancel-card__date">
                    <FaClock size={11} />
                    {formatDate(cancelOrder.created_at)}
                  </span>
                  <span className="cancel-card__action">
                    <FaBalanceScale size={12} />
                    Вынести вердикт
                    <FaArrowRight size={10} />
                  </span>
                </div>
              </article>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
