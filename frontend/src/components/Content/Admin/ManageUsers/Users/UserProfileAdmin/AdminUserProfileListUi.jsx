import React from "react";
import { useNavigate, useLocation } from "react-router-dom";

export const ORDER_FILTER_PARAM_KEYS = [
  "category_work_slug",
  "country",
  "region",
  "town",
  "status_order",
  "budget_from",
  "budget_to",
  "start_date_orders",
  "end_date_orders",
];

export function countActiveFiltersFromSearch(search, keys = ORDER_FILTER_PARAM_KEYS) {
  const params = new URLSearchParams(search);
  return keys.reduce((count, key) => (params.get(key) ? count + 1 : count), 0);
}

export function AupFiltersToolbar({
  filtersOpen,
  onToggleFilters,
  activeFilterCount = 0,
  onClearFilters,
}) {
  return (
    <div className="aup-filters-toolbar">
      <button
        type="button"
        className={`manage-users-btn manage-users-btn--ghost ${filtersOpen ? "is-active" : ""}`}
        onClick={onToggleFilters}
        aria-expanded={filtersOpen}
      >
        Фильтры
        {activeFilterCount > 0 && (
          <span className="manage-users-btn__count">{activeFilterCount}</span>
        )}
      </button>
      {activeFilterCount > 0 && onClearFilters && (
        <button
          type="button"
          className="manage-users-btn manage-users-btn--outline"
          onClick={onClearFilters}
        >
          Сбросить
        </button>
      )}
    </div>
  );
}

export function getStatusTone(status = "") {
  const s = String(status).toLowerCase();
  if (s.includes("заверш") || s.includes("выполн")) return "success";
  if (s.includes("отмен") || s.includes("отказ")) return "danger";
  if (s.includes("работ") || s.includes("исполн") || s.includes("ожид")) return "warning";
  if (s.includes("поиск") || s.includes("предлож") || s.includes("рассмотр")) return "info";
  if (s.includes("чернов") || s.includes("не предлож")) return "muted";
  return "default";
}

export function formatListDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

export function formatBudget(budget, currency) {
  if (budget == null || budget === "") return "Не указан";
  const num = Number(budget);
  const formatted = Number.isFinite(num)
    ? num.toLocaleString("ru-RU")
    : String(budget);
  return currency ? `${formatted} ${currency}` : formatted;
}

export function AupFiltersPanel({ children }) {
  return <div className="aup-filters">{children}</div>;
}

export function AupFilterBlock({ title, icon, children }) {
  return (
    <section className="aup-filters__block">
      <h3 className="aup-filters__title">
        {icon && (
          <span className="aup-filters__title-icon" aria-hidden="true">
            {icon}
          </span>
        )}
        {title}
      </h3>
      <div className="aup-filters__grid">{children}</div>
    </section>
  );
}

export function AupFilterSelect({
  label,
  options,
  value,
  onChange,
  disabled = false,
}) {
  return (
    <div className="aup-field">
      <label className="aup-field__label">{label}</label>
      <select
        className="aup-field__input"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((option, idx) => (
          <option key={`${label}-${idx}`} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

export function AupFilterInput({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  disabled = false,
}) {
  return (
    <div className="aup-field">
      <label className="aup-field__label">{label}</label>
      <input
        type={type}
        className="aup-field__input"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function AupListState({ variant, message, onRetry, emptyTitle }) {
  if (variant === "loading") {
    return (
      <div className="aup-list-state">
        <div className="aup-list-state__spinner" aria-hidden="true" />
        <p>{message || "Загрузка…"}</p>
      </div>
    );
  }

  if (variant === "error") {
    return (
      <div className="aup-list-state aup-list-state--error">
        <span className="aup-list-state__icon" aria-hidden="true">
          ⚠
        </span>
        <p>{message || "Не удалось загрузить данные"}</p>
        {onRetry && (
          <button
            type="button"
            className="manage-users-btn manage-users-btn--primary"
            onClick={onRetry}
          >
            Повторить
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="aup-list-state aup-list-state--empty">
      <span className="aup-list-state__icon" aria-hidden="true">
        📋
      </span>
      <h3>{emptyTitle || "Ничего не найдено"}</h3>
      <p>{message || "Попробуйте изменить фильтры"}</p>
    </div>
  );
}

function StatusBadge({ status }) {
  const tone = getStatusTone(status);
  return (
    <span className={`aup-list-card__status aup-list-card__status--${tone}`}>
      {status || "Без статуса"}
    </span>
  );
}

export function AupOrderCard({ order, onClick }) {
  const location = [order.town, order.region].filter(Boolean).join(", ");
  const description = order.description?.trim();

  return (
    <article
      className="aup-list-card"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="aup-list-card__top">
        <span className="aup-list-card__category">
          {order.category_work || "Без категории"}
        </span>
        <span className="aup-list-card__id">№ {order.id}</span>
      </div>

      <h3 className="aup-list-card__title">{order.title || "Без названия"}</h3>

      {description && (
        <p className="aup-list-card__desc">
          {description.length > 120
            ? `${description.slice(0, 120)}…`
            : description}
        </p>
      )}

      <div className="aup-list-card__meta">
        <div className="aup-list-card__meta-item">
          <span className="aup-list-card__meta-label">Бюджет</span>
          <span className="aup-list-card__meta-value">
            {formatBudget(order.budget, order.currency)}
          </span>
        </div>
        {location && (
          <div className="aup-list-card__meta-item">
            <span className="aup-list-card__meta-label">Локация</span>
            <span className="aup-list-card__meta-value">{location}</span>
          </div>
        )}
        <div className="aup-list-card__meta-item">
          <span className="aup-list-card__meta-label">Создан</span>
          <span className="aup-list-card__meta-value">
            {formatListDate(order.created_at)}
          </span>
        </div>
      </div>

      <div className="aup-list-card__footer">
        <StatusBadge
          status={
            order.status_order_customer || order.status_service_executor || order.status
          }
        />
        <span className="aup-list-card__cta">Открыть →</span>
      </div>
    </article>
  );
}

export function AupServiceCard({ service, onClick }) {
  const location = [service.town, service.region].filter(Boolean).join(", ");

  return (
    <article
      className="aup-list-card aup-list-card--service"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="aup-list-card__top">
        <span className="aup-list-card__category aup-list-card__category--service">
          Услуга исполнителя
        </span>
        <span className="aup-list-card__id">№ {service.id}</span>
      </div>

      <h3 className="aup-list-card__title">
        {service.title || "Без названия"}
      </h3>

      <div className="aup-list-card__meta">
        {location && (
          <div className="aup-list-card__meta-item">
            <span className="aup-list-card__meta-label">Локация</span>
            <span className="aup-list-card__meta-value">{location}</span>
          </div>
        )}
        <div className="aup-list-card__meta-item">
          <span className="aup-list-card__meta-label">Создана</span>
          <span className="aup-list-card__meta-value">
            {formatListDate(service.created_at)}
          </span>
        </div>
      </div>

      <div className="aup-list-card__footer">
        <StatusBadge
          status={service.status_service_executor || service.status}
        />
        <span className="aup-list-card__cta">Открыть →</span>
      </div>
    </article>
  );
}

export function AupListPagination({ totalPages = 5 }) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPage =
    parseInt(new URLSearchParams(location.search).get("page"), 10) || 1;

  const handlePageChange = (page) => {
    if (page < 1) return;
    const params = new URLSearchParams(location.search);
    params.set("page", String(page));
    navigate(`?${params.toString()}`, { replace: true });
  };

  const pages = Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1);

  return (
    <nav className="aup-pagination" aria-label="Пагинация">
      <button
        type="button"
        className="aup-pagination__btn"
        disabled={currentPage === 1}
        onClick={() => handlePageChange(currentPage - 1)}
        aria-label="Предыдущая страница"
      >
        ←
      </button>
      {pages.map((page) => (
        <button
          key={page}
          type="button"
          className={`aup-pagination__btn ${currentPage === page ? "is-active" : ""}`}
          onClick={() => handlePageChange(page)}
          aria-current={currentPage === page ? "page" : undefined}
        >
          {page}
        </button>
      ))}
      <button
        type="button"
        className="aup-pagination__btn"
        onClick={() => handlePageChange(currentPage + 1)}
        aria-label="Следующая страница"
      >
        →
      </button>
    </nav>
  );
}
