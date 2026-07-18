import React, { useState, useEffect, useMemo } from "react";
import { API, apiFetch } from "../../../../utils/api.js";
import { Link } from "react-router-dom";
import {
  FaSearch,
  FaGavel,
  FaUser,
  FaHardHat,
  FaClock,
  FaArrowRight,
  FaInbox,
} from "react-icons/fa";
import "./complaints_list.css";

const STATUS_LABELS = {
  open: "Открыта",
  in_progress: "В работе",
  closed: "Закрыта",
  resolved: "Решена",
};

function getStatusClass(status) {
  const s = (status || "").toLowerCase();
  if (s === "open" || s === "новая") return "complaint-card__status--open";
  if (s === "in_progress" || s === "в работе") return "complaint-card__status--progress";
  if (s === "closed" || s === "resolved" || s === "закрыта") return "complaint-card__status--closed";
  return "complaint-card__status--default";
}

function getStatusLabel(status) {
  if (!status) return "Открыта";
  return STATUS_LABELS[status.toLowerCase()] || status;
}

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

export default function AdminDisputesSituationsList() {
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    const fetchDisputes = async () => {
      try {
        setError("");
        const res = await apiFetch(`${API.baseURL}/admin/complaints`);
        if (!res.ok) throw new Error("Не удалось загрузить список жалоб");

        const data = await res.json();
        let disputesArray = [];
        if (Array.isArray(data)) {
          disputesArray = data;
        } else if (data?.complaints) {
          disputesArray = data.complaints;
        } else if (data?.disputes) {
          disputesArray = data.disputes;
        }
        setDisputes(disputesArray);
      } catch (err) {
        setError(err.message || "Ошибка загрузки");
        setDisputes([]);
      } finally {
        setLoading(false);
      }
    };

    fetchDisputes();
  }, []);

  const statuses = useMemo(() => {
    const set = new Set();
    disputes.forEach((d) => {
      if (d.status) set.add(d.status);
    });
    return Array.from(set);
  }, [disputes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return disputes.filter((d) => {
      if (statusFilter !== "all" && (d.status || "open") !== statusFilter) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        d.order_id,
        d.order_title,
        d.customer_email,
        d.executor_email,
        d.id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [disputes, search, statusFilter]);

  const openCount = disputes.filter((d) => {
    const s = (d.status || "open").toLowerCase();
    return s === "open" || s === "in_progress" || !d.status;
  }).length;

  return (
    <div className="complaints-page">
      <header className="complaints-hero">
        <div className="complaints-hero__text">
          <span className="complaints-hero__badge">Админ · Модерация</span>
          <h1 className="complaints-hero__title">Жалобы и споры</h1>
          <p className="complaints-hero__subtitle">
            Просмотр обращений по заказам, переписка с участниками и вынесение вердикта
          </p>
        </div>
        <div className="complaints-hero__stats">
          <div className="complaints-stat">
            <span className="complaints-stat__value">{disputes.length}</span>
            <span className="complaints-stat__label">всего</span>
          </div>
          <div className="complaints-stat">
            <span className="complaints-stat__value">{openCount}</span>
            <span className="complaints-stat__label">активных</span>
          </div>
          <div className="complaints-stat">
            <span className="complaints-stat__value">{filtered.length}</span>
            <span className="complaints-stat__label">найдено</span>
          </div>
        </div>
      </header>

      <div className="complaints-toolbar">
        <div className="complaints-search">
          <span className="complaints-search__icon" aria-hidden="true">
            <FaSearch size={14} />
          </span>
          <input
            className="complaints-search__input"
            type="search"
            placeholder="Поиск по заказу, email, ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Поиск жалоб"
          />
        </div>
        <select
          className="complaints-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Фильтр по статусу"
        >
          <option value="all">Все статусы</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {getStatusLabel(s)}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="complaints-alert complaints-alert--error">{error}</div>}

      {loading ? (
        <div className="complaints-loading">
          <span className="complaints-spinner" />
          Загрузка жалоб…
        </div>
      ) : filtered.length === 0 ? (
        <div className="complaints-empty">
          <span className="complaints-empty__icon" aria-hidden="true">
            <FaInbox size={40} />
          </span>
          <h2 className="complaints-empty__title">
            {disputes.length === 0 ? "Нет открытых жалоб" : "Ничего не найдено"}
          </h2>
          <p className="complaints-empty__text">
            {disputes.length === 0
              ? "Когда пользователи откроют спор по заказу, он появится здесь."
              : "Попробуйте изменить поиск или сбросить фильтр статуса."}
          </p>
        </div>
      ) : (
        <div className="complaints-grid">
          {filtered.map((dispute) => (
            <article key={dispute.id} className="complaint-card">
              <div className="complaint-card__head">
                <div className="complaint-card__order">
                  <span className="complaint-card__order-icon" aria-hidden="true">
                    <FaGavel size={14} />
                  </span>
                  <div>
                    <div className="complaint-card__order-id">
                      Заказ #{dispute.order_id}
                    </div>
                    <div className="complaint-card__order-meta">
                      Жалоба #{dispute.id}
                    </div>
                  </div>
                </div>
                <span
                  className={`complaint-card__status ${getStatusClass(dispute.status)}`}
                >
                  {getStatusLabel(dispute.status)}
                </span>
              </div>

              <h3 className="complaint-card__title">
                {dispute.order_title || `Спор по заказу #${dispute.order_id}`}
              </h3>

              <div className="complaint-card__participants">
                <div className="complaint-card__participant">
                  <span className="complaint-card__participant-icon">
                    <FaUser size={12} />
                  </span>
                  <span>
                    Заказчик: {dispute.customer_email || "не указан"}
                  </span>
                </div>
                <div className="complaint-card__participant">
                  <span className="complaint-card__participant-icon">
                    <FaHardHat size={12} />
                  </span>
                  <span>
                    Исполнитель: {dispute.executor_email || "не указан"}
                  </span>
                </div>
              </div>

              <div className="complaint-card__footer">
                <span className="complaint-card__date">
                  <FaClock size={11} />
                  {formatDate(dispute.last_message_at || dispute.created_at)}
                </span>
                <Link
                  to={`/admin/complaints/complaint/${dispute.id}/order/${dispute.order_id}`}
                  className="complaint-card__btn"
                >
                  Открыть
                  <FaArrowRight size={11} />
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
