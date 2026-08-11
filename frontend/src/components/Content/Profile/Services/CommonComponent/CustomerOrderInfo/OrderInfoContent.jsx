import React from "react";
import { classifyBudgetType } from "../../../../../../utils/budgetTypes.js";
import "./customer_order_info.css";

export const formatDateTime = (value) =>
  value ? new Date(value).toLocaleString("ru-RU") : "Не указана";

export const formatBudget = (budget, currency, _budgetType) => {
  if (budget == null || budget === "" || Number(budget) <= 0) {
    return "Сумма неизвестна";
  }
  const amount = Number(budget).toLocaleString("ru-RU");
  return [amount, currency || "BYN"].filter(Boolean).join(" ");
};

/** Подпись суммы в карточке/инфо заказа. */
export function orderBudgetLabel(budgetType) {
  const deal = classifyBudgetType(budgetType);
  if (deal === "estimate") return "Сметная цена";
  if (deal === "fixed") {
    const value = String(budgetType || "").toLowerCase();
    if (value.includes("фиксир")) return "Фиксированная цена";
    return "Договорная цена";
  }
  return "Сумма";
}

export const formatLocation = (country, region, town) => {
  const parts = [country, region, town].filter(Boolean);
  return parts.length ? parts.join(", ") : "Не указано";
};

export function OrderInfoEmpty({ message = "Информация о заказе недоступна" }) {
  return <div className="order-info order-info--empty">{message}</div>;
}

export function OrderInfoHighlights({
  budget,
  currency,
  budget_type,
}) {
  const label = orderBudgetLabel(budget_type);
  return (
    <div className="order-info__highlights order-info__highlights--strip" aria-label="Ключевые параметры">
      <div className="order-info__highlight">
        <span className="order-info__highlight-label">{label}</span>
        <span className="order-info__highlight-value">
          {formatBudget(budget, currency, budget_type)}
        </span>
      </div>
    </div>
  );
}

function DetailRow({ label, children, valueClass = "" }) {
  if (children == null || children === "") return null;

  return (
    <div className="order-info__row">
      <dt className="order-info__term">{label}</dt>
      <dd className={`order-info__def ${valueClass}`.trim()}>{children}</dd>
    </div>
  );
}

function DetailSection({ title, children, wide = false, variant = "" }) {
  const rows = React.Children.toArray(children).filter(Boolean);
  if (!rows.length) return null;

  return (
    <section
      className={`order-info__section order-info__section--card ${wide ? "order-info__section--wide" : ""} ${variant ? `order-info__section--${variant}` : ""}`.trim()}
    >
      {title && <h3 className="order-info__section-title">{title}</h3>}
      <dl className="order-info__list">{rows}</dl>
    </section>
  );
}

export function OrderDetailsGrid({ order, embedded = false }) {
  const {
    description,
    budget,
    currency,
    budget_type,
    country,
    region,
    town,
    location,
    deadline,
    insurance_required,
    created_at,
    updated_at,
  } = order;

  const place = formatLocation(country, region, town);
  const hasPlace = place !== "Не указано" || location;

  return (
    <div
      className={`order-info__stack ${embedded ? "order-info__stack--embedded" : ""}`.trim()}
    >
      {embedded && (
        <section className="order-info__section order-info__section--card order-info__section--wide order-info__section--metrics">
          <OrderInfoHighlights
            budget={budget}
            currency={currency}
            budget_type={budget_type}
          />
        </section>
      )}

      {description && (
        <section className="order-info__section order-info__section--card order-info__section--wide order-info__section--lead">
          <h3 className="order-info__section-title">Описание</h3>
          <div className="order-info__description">{description}</div>
        </section>
      )}

      <DetailSection title="Условия и сроки" variant="conditions">
        {!embedded && (
          <DetailRow label={orderBudgetLabel(budget_type)}>
            {formatBudget(budget, currency, budget_type)}
          </DetailRow>
        )}
        <DetailRow label="Срок выполнения">{deadline}</DetailRow>
        <DetailRow label="Страхование">
          {insurance_required ? "Требуется" : "Не требуется"}
        </DetailRow>
      </DetailSection>

      {hasPlace && (
        <section className="order-info__section order-info__section--card order-info__section--place">
          <h3 className="order-info__section-title">Место выполнения</h3>
          <dl className="order-info__list">
            {place !== "Не указано" && (
              <DetailRow label="Регион">{place}</DetailRow>
            )}
            <DetailRow label="Адрес">
              {location || "Не указан"}
            </DetailRow>
          </dl>
        </section>
      )}

      {(created_at || updated_at) && (
        <footer className="order-info__meta-strip order-info__section order-info__section--card">
          {created_at && (
            <span className="order-info__meta-item">
              <span className="order-info__meta-label">Создан</span>
              <span className="order-info__meta-value">{formatDateTime(created_at)}</span>
            </span>
          )}
          {updated_at && (
            <span className="order-info__meta-item">
              <span className="order-info__meta-label">Обновлён</span>
              <span className="order-info__meta-value">{formatDateTime(updated_at)}</span>
            </span>
          )}
        </footer>
      )}
    </div>
  );
}
