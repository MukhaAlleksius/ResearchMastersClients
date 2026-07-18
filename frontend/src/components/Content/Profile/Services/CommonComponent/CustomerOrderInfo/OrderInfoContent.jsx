import React from "react";
import "./customer_order_info.css";

export const formatDateTime = (value) =>
  value ? new Date(value).toLocaleString("ru-RU") : "Не указана";

export const formatBudget = (budget, currency, budgetType) => {
  if (budget == null || budget === "") return "Не указан";
  const amount = Number(budget).toLocaleString("ru-RU");
  const parts = [amount, currency || "₽"].filter(Boolean).join(" ");
  return budgetType ? `${parts} · ${budgetType}` : parts;
};

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
  urgency_level,
  deadline,
}) {
  const hasBudget = budget != null && budget !== "";
  const items = [
    hasBudget && {
      key: "budget",
      label: "Примерная сумма",
      value: formatBudget(budget, currency, budget_type),
    },
    urgency_level && {
      key: "urgency",
      label: "Срочность",
      value: urgency_level,
    },
    deadline && {
      key: "deadline",
      label: "Срок",
      value: deadline,
    },
  ].filter(Boolean);

  if (!items.length) return null;

  return (
    <div className="order-info__highlights order-info__highlights--strip" aria-label="Ключевые параметры">
      {items.map((item) => (
        <div key={item.key} className="order-info__highlight">
          <span className="order-info__highlight-label">{item.label}</span>
          <span className="order-info__highlight-value">{item.value}</span>
        </div>
      ))}
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
    urgency_level,
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
  const hasHighlights =
    (budget != null && budget !== "") || urgency_level || deadline;

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
            urgency_level={urgency_level}
            deadline={deadline}
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
        {!hasHighlights && (
          <>
            <DetailRow label="Примерная сумма">
              {formatBudget(budget, currency, budget_type)}
            </DetailRow>
            <DetailRow label="Срочность">{urgency_level}</DetailRow>
            <DetailRow label="Срок выполнения">{deadline}</DetailRow>
          </>
        )}
        {hasHighlights && urgency_level && (
          <DetailRow label="Срочность">{urgency_level}</DetailRow>
        )}
        {hasHighlights && deadline && (
          <DetailRow label="Срок выполнения">{deadline}</DetailRow>
        )}
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
