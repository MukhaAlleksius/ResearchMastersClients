import React from "react";
import { Link } from "react-router-dom";
import { getStatusColor } from "../styles/theme";
import { formatMoney } from "../../../../utils/currency.js";
import { formatExecutorResponses } from "../../../../utils/orders.js";
import { IconUser, StatusIcon } from "../ProfileIcons.jsx";

function formatCardBudget(item) {
  const amount = item?.budget;
  const hasAmount = amount != null && amount !== "" && Number(amount) > 0;
  if (hasAmount) {
    return formatMoney(amount, item.currency || "BYN");
  }
  return "Сумма неизвестна";
}

export default function OrderServiceCard({
  item,
  statusLabel,
  partyLabel,
  partyName,
  onClick,
  to,
  linkState,
  highlighted = false,
}) {
  const statusColor = getStatusColor(statusLabel);

  const content = (
    <>
      <div className="service-card__header">
        <span
          className="service-card__status"
          style={{
            backgroundColor: statusColor.bg,
            color: statusColor.text,
            border: `1px solid ${statusColor.border}`,
          }}
        >
          <StatusIcon name={statusColor.icon} />
          {statusLabel || "Без статуса"}
        </span>
      </div>

      <h3 className="service-card__title" title={item.title}>
        {item.title}
      </h3>
      <p
        className="service-card__category"
        title={item.category_work || undefined}
      >
        {item.category_work || "Категория не указана"}
      </p>
      <p className="service-card__responses">
        {item.responses_count != null
          ? Number(item.responses_count) > 0
            ? `Откликнулись: ${formatExecutorResponses(item.responses_count)}`
            : "Пока нет откликов"
          : "\u00a0"}
      </p>

      <div className="service-card__footer">
        <span
          className="service-card__customer"
          title={partyName || partyLabel}
        >
          <IconUser width={14} height={14} />
          {partyName || partyLabel}
        </span>
        <span className="service-card__budget">{formatCardBudget(item)}</span>
      </div>
    </>
  );

  if (to) {
    return (
      <Link
        to={to}
        state={linkState}
        className={`service-card service-card--link${highlighted ? " service-card--highlight" : ""}`}
      >
        {content}
      </Link>
    );
  }

  return (
    <div
      className={`service-card${highlighted ? " service-card--highlight" : ""}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick?.()}
    >
      {content}
    </div>
  );
}
