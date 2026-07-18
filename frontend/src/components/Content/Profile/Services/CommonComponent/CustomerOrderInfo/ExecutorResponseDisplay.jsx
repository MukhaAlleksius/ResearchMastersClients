import React from "react";

export function getExecutorDisplayName(executorName) {
  if (!executorName) return "Исполнитель";
  if (typeof executorName === "string") return executorName;
  return (
    `${executorName.first_name || ""} ${executorName.second_name || ""}`.trim() ||
    "Исполнитель"
  );
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
  const priceText = `${response.proposed_price ?? "—"} ${response.currency || "BYN"}`;

  const rows = [
    {
      key: "price",
      label: "Цена",
      value: priceText,
      valueClass: "order-info__def--emphasis",
    },
    {
      key: "budget",
      label: "Тип бюджета",
      value: response.budget_type || "—",
    },
    {
      key: "time",
      label: "Срок выполнения",
      value: response.estimated_time || "—",
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

      {response.message && (
        <div className="exec-response__message">
          <dl className="order-info__list">
            <div className="order-info__row order-info__row--message">
              <dt className="order-info__term">Сообщение</dt>
              <dd className="order-info__def exec-response__message-text">
                {response.message}
              </dd>
            </div>
          </dl>
        </div>
      )}

      {children && (
        <footer className="exec-response__footer">{children}</footer>
      )}
    </section>
  );
}
