import React from "react";
import { Link } from "react-router-dom";
import { getStatusColor } from "../styles/theme";

export default function OrderServiceCard({
  item,
  statusLabel,
  partyLabel,
  partyName,
  updateInfo,
  onClick,
  to,
  linkState,
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
          {statusColor.icon} {statusLabel || "Без статуса"}
        </span>
        <span className="service-card__id">№ {item.id}</span>
      </div>

      <h3 className="service-card__title">{item.title}</h3>
      <p className="service-card__category">
        {item.category_work || "Категория не указана"}
      </p>

      <div className="service-card__footer">
        <span className="service-card__customer">
          <span aria-hidden="true">👤</span>
          {partyName || partyLabel}
        </span>
        <span className="service-card__budget">
          {item.budget ? `${item.budget} ₽` : "Договорная"}
        </span>
      </div>
    </>
  );

  if (to) {
    return (
      <Link
        to={to}
        state={linkState}
        className="service-card service-card--link"
      >
        {content}
      </Link>
    );
  }

  return (
    <div
      className="service-card"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick?.()}
    >
      {content}
    </div>
  );
}
