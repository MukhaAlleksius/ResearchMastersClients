import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  FaSearch,
  FaInbox,
} from "react-icons/fa";
import { API, apiFetch } from "../../../../utils/api.js";
import "./finances.css";

const STATUS_LABELS = {
  pending: "Ожидает",
  escrow: "В эскроу",
  released: "Выплачено",
  failed: "Ошибка",
  paid: "Оплачено",
  completed: "Завершено",
};

function getStatusClass(status) {
  const s = (status || "").toLowerCase();
  if (s === "pending") return "finances-status--pending";
  if (s === "escrow") return "finances-status--escrow";
  if (s === "released" || s === "paid" || s === "completed") {
    return "finances-status--released";
  }
  if (s === "failed") return "finances-status--failed";
  return "finances-status--default";
}

function formatMoney(value, currency = "BYN") {
  const num = Number(value) || 0;
  return `${num.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
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

export default function AdminFinances() {
  const [stats, setStats] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const loadPayments = useCallback(async () => {
    try {
      setError("");
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      const qs = params.toString();
      const res = await apiFetch(
        `${API.baseURL}/admin/payments${qs ? `?${qs}` : ""}`,
      );
      if (!res.ok) throw new Error("Не удалось загрузить финансовые данные");
      const data = await res.json();
      setStats(data.stats || null);
      setPayments(Array.isArray(data.payments) ? data.payments : []);
    } catch (err) {
      setError(err.message || "Ошибка загрузки");
      setStats(null);
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return payments;
    return payments.filter((p) => {
      const haystack = [
        p.id,
        p.order_id,
        p.order_title,
        p.customer_name,
        p.executor_name,
        p.transaction_id,
        p.payment_method,
        p.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [payments, search]);

  return (
    <div className="finances-page">
      <header className="finances-hero">
        <div>
          <span className="finances-hero__badge">Админ · Финансы</span>
          <h1 className="finances-hero__title">Управление финансами</h1>
          <p className="finances-hero__subtitle">
            Платежи, эскроу, комиссия платформы и выплаты исполнителям
          </p>
        </div>
      </header>

      {stats && (
        <div className="finances-stats">
          <div className="finances-stat-card finances-stat-card--accent">
            <span className="finances-stat-card__label">Оборот</span>
            <span className="finances-stat-card__value">
              {formatMoney(stats.total_amount)}
            </span>
            <span className="finances-stat-card__hint">
              {stats.total_count} платежей
            </span>
          </div>
          <div className="finances-stat-card">
            <span className="finances-stat-card__label">Комиссия</span>
            <span className="finances-stat-card__value">
              {formatMoney(stats.total_commission)}
            </span>
            <span className="finances-stat-card__hint">доход платформы</span>
          </div>
          <div className="finances-stat-card">
            <span className="finances-stat-card__label">В эскроу</span>
            <span className="finances-stat-card__value">
              {formatMoney(stats.escrow_amount)}
            </span>
            <span className="finances-stat-card__hint">
              {stats.escrow_count} платежей
            </span>
          </div>
          <div className="finances-stat-card">
            <span className="finances-stat-card__label">Выплачено</span>
            <span className="finances-stat-card__value">
              {formatMoney(stats.released_amount)}
            </span>
            <span className="finances-stat-card__hint">
              {stats.released_count} платежей
            </span>
          </div>
        </div>
      )}

      <div className="finances-toolbar">
        <div className="finances-search">
          <span className="finances-search__icon" aria-hidden="true">
            <FaSearch size={14} />
          </span>
          <input
            className="finances-search__input"
            type="search"
            placeholder="Поиск по ID, заказу, участникам…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Поиск платежей"
          />
        </div>
        <select
          className="finances-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Фильтр по статусу"
        >
          <option value="all">Все статусы</option>
          <option value="pending">Ожидает</option>
          <option value="escrow">В эскроу</option>
          <option value="released">Выплачено</option>
          <option value="failed">Ошибка</option>
        </select>
      </div>

      {error && <div className="finances-alert">{error}</div>}

      {loading ? (
        <div className="finances-loading">
          <span className="finances-spinner" />
          Загрузка платежей…
        </div>
      ) : filtered.length === 0 ? (
        <div className="finances-empty">
          <FaInbox size={28} />
          {payments.length === 0 ? "Платежей пока нет" : "Ничего не найдено"}
        </div>
      ) : (
        <div className="finances-table-wrap">
          <table className="finances-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Заказ</th>
                <th>Заказчик</th>
                <th>Исполнитель</th>
                <th>Сумма</th>
                <th>Исполнителю</th>
                <th>Комиссия</th>
                <th>Статус</th>
                <th>Метод</th>
                <th>Дата</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td className="finances-table__id">#{p.id}</td>
                  <td>
                    <Link
                      to={`/admin/manage_orders/${p.order_id}`}
                      className="finances-table__order-link"
                    >
                      #{p.order_id}
                    </Link>
                    {p.order_title && (
                      <span className="finances-table__muted">{p.order_title}</span>
                    )}
                  </td>
                  <td>{p.customer_name}</td>
                  <td>{p.executor_name}</td>
                  <td>{formatMoney(p.amount, p.currency)}</td>
                  <td>{formatMoney(p.executor_amount, p.currency)}</td>
                  <td>{formatMoney(p.commission, p.currency)}</td>
                  <td>
                    <span className={`finances-status ${getStatusClass(p.status)}`}>
                      {STATUS_LABELS[p.status] || p.status}
                    </span>
                  </td>
                  <td>{p.payment_method || "—"}</td>
                  <td>{formatDate(p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
