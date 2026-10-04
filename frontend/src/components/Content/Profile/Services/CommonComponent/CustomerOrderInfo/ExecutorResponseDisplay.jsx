import React from "react";
import {
  isEstimateBudgetType,
  isFixedBudgetType,
} from "../../../../../../utils/budgetTypes.js";

export function getExecutorDisplayName(executorName) {
  if (!executorName) return "Исполнитель";
  if (typeof executorName === "string") return executorName;
  return (
    `${executorName.first_name || ""} ${executorName.second_name || ""}`.trim() ||
    "Исполнитель"
  );
}

function formatResponseDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ExecutorResponseDisplay({
  response,
  title,
  showExecutorName = true,
  variant = "default",
  children,
}) {
  if (!response) return null;

  const executorLabel = getExecutorDisplayName(response.executor_name);
  const isCompact = variant === "compact";
  const isFixed = isFixedBudgetType(response.budget_type);
  const isEstimate = isEstimateBudgetType(response.budget_type);
  const priceText = isFixed
    ? `${response.proposed_price ?? "—"} ${response.currency || "BYN"}`
    : isEstimate
      ? "По смете"
      : response.proposed_price != null
        ? `${response.proposed_price} ${response.currency || "BYN"}`
        : "—";
  const messageText = String(response.message || "").trim();

  const rows = [
    {
      key: "responded",
      label: "Дата ответа",
      value: formatResponseDate(response.created_at),
    },
    {
      key: "budget",
      label: "Тип бюджета",
      value: response.budget_type || "—",
    },
    {
      key: "price",
      label: isFixed ? "Сумма" : "Стоимость",
      value: priceText,
      valueClass: "order-info__def--emphasis",
    },
    {
      key: "start",
      label: "Начало работ",
      value: response.start_time_work || "—",
    },
  ];

  const sectionTitle =
    title || (showExecutorName ? "Предложение исполнителя" : "Предложение");

  return (
    <section
      className={`exec-response order-info__section order-info__section--card ${isCompact ? "exec-response--compact" : ""} order-info__response-card`.trim()}
    >
      {(title || showExecutorName || isCompact) && (
        <header className="exec-response__head">
          <h3 className="order-info__section-title">{sectionTitle}</h3>
          {showExecutorName && !isCompact && (
            <p className="exec-response__meta">{executorLabel}</p>
          )}
        </header>
      )}

      <dl className="order-info__list">
        {rows.map(({ key, label, value, valueClass = "" }) => (
          <div key={key} className="order-info__row">
            <dt className="order-info__term">{label}</dt>
            <dd className={`order-info__def ${valueClass}`.trim()}>{value}</dd>
          </div>
        ))}
      </dl>

      <div className="exec-response__message">
        <dl className="order-info__list">
          <div className="order-info__row order-info__row--message">
            <dt className="order-info__term">Сообщение</dt>
            <dd className="order-info__def exec-response__message-text">
              {messageText || "—"}
            </dd>
          </div>
        </dl>
      </div>

      {children && (
        <footer className="exec-response__footer">{children}</footer>
      )}
    </section>
  );
}
