import React from "react";
import { getStatusColor } from "../../../styles/theme.js";
import {
  OrderDetailsGrid,
  OrderInfoHighlights,
  formatDateTime,
} from "./OrderInfoContent";
import "./customer_order_info.css";

function normalizeOrder(order) {
  if (!order) return null;
  return {
    ...order,
    category_work:
      order.category_work || order.category_work_name || order.category || "",
    budget_type: order.budget_type || order.budgetType || "",
    urgency_level: order.urgency_level || order.urgencyLevel || "",
    created_at: order.created_at || order.createdAt || "",
    updated_at: order.updated_at || order.updatedAt || "",
    status_order_customer:
      order.status_order_customer || order.status || "",
    insurance_required: Boolean(
      order.insurance_required ?? order.insuranceRequired,
    ),
  };
}

/**
 * Универсальный просмотр информации о заказе (заказчик и исполнитель).
 */
export default function OrderInfo({
  order,
  embedded = false,
  footer,
  badge = "Информация о заказе",
  emptyMessage = "Информация о заказе недоступна",
}) {
  const data = normalizeOrder(order);

  if (!data) {
    return (
      <div className="order-info order-info--empty">{emptyMessage}</div>
    );
  }

  const {
    id,
    title,
    category_work,
    budget,
    currency,
    budget_type,
    urgency_level,
    deadline,
    status_order_customer,
    created_at,
  } = data;

  const statusStyle = status_order_customer
    ? getStatusColor(status_order_customer)
    : null;

  const showHero = !embedded;

  return (
    <div
      className={`order-info ${showHero ? "" : "order-info--embedded"}`.trim()}
    >
      {showHero && (
        <header className="order-info__hero">
          <div className="order-info__hero-top">
            <span className="order-info__badge">{badge}</span>
            {category_work && (
              <span className="order-info__meta">{category_work}</span>
            )}
            {status_order_customer && statusStyle && (
              <span
                className="order-info__status"
                style={{
                  color: statusStyle.text,
                  backgroundColor: statusStyle.bg,
                  borderColor: statusStyle.border,
                }}
              >
                <span className="order-info__status-icon" aria-hidden="true">
                  {statusStyle.icon}
                </span>
                {status_order_customer}
              </span>
            )}
          </div>
          <h2 className="order-info__title">{title || `Заказ #${id}`}</h2>
          <p className="order-info__subtitle">
            <span className="order-info__order-id">№{id}</span>
            {created_at && (
              <span className="order-info__created">
                · создан {formatDateTime(created_at)}
              </span>
            )}
          </p>
          <OrderInfoHighlights
            budget={budget}
            currency={currency}
            budget_type={budget_type}
            urgency_level={urgency_level}
            deadline={deadline}
          />
        </header>
      )}

      <OrderDetailsGrid order={data} embedded={embedded} />

      {footer && <div className="order-info__footer">{footer}</div>}
    </div>
  );
}
