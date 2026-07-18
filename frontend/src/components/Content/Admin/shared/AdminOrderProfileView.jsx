import React from "react";
import { Link } from "react-router-dom";
import {
  formatBudget,
  getStatusTone,
} from "../ManageUsers/Users/UserProfileAdmin/AdminUserProfileListUi.jsx";
import { getCustomerProfileLink } from "../../../../utils/executorProfile.js";
import "./admin_order_profile.css";

function formatDateTime(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("ru-RU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function getDisplayName(name, userId) {
  if (typeof name === "object") {
    const fullName = [name?.first_name, name?.last_name].filter(Boolean).join(" ");
    if (fullName) return fullName;
  } else if (name) {
    return name;
  }
  return userId ? `Пользователь #${userId}` : "Не назначен";
}

function UserProfileLink({ userId, name }) {
  if (!userId) {
    return (
      <span className="admin-order-profile__field-value--muted">Не назначен</span>
    );
  }

  const profileLink = getCustomerProfileLink(userId, name);
  const displayName = getDisplayName(name, userId);

  if (!profileLink) {
    return <span>{displayName}</span>;
  }

  return (
    <Link
      to={{
        pathname: profileLink.pathname,
        search: profileLink.search,
      }}
      state={profileLink.state}
      className="admin-order-profile__link"
    >
      {displayName}
    </Link>
  );
}

function statusPillClass(status) {
  const tone = getStatusTone(status || "");
  const map = {
    success: "success",
    danger: "danger",
    warning: "warning",
    info: "info",
    muted: "muted",
    default: "status",
  };
  return map[tone] || "status";
}

function InfoField({ label, value, muted = false, children }) {
  return (
    <div>
      <span className="admin-order-profile__field-label">{label}</span>
      <div
        className={`admin-order-profile__field-value ${
          muted || (!value && !children)
            ? "admin-order-profile__field-value--muted"
            : ""
        }`}
      >
        {children || value || "—"}
      </div>
    </div>
  );
}

function ProfileCard({
  icon,
  iconClass = "blue",
  title,
  subtitle,
  children,
  wide = false,
}) {
  return (
    <section
      className={`admin-order-profile__card ${
        wide ? "admin-order-profile__card--wide" : ""
      }`}
    >
      <div className="admin-order-profile__card-head">
        <span
          className={`admin-order-profile__card-icon admin-order-profile__card-icon--${iconClass}`}
          aria-hidden="true"
        >
          {icon}
        </span>
        <div>
          <h2 className="admin-order-profile__card-title">{title}</h2>
          {subtitle && (
            <p className="admin-order-profile__card-subtitle">{subtitle}</p>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

function OrderProfileContent({ order, variant = "order" }) {
  const status =
    variant === "service"
      ? order.status_order_executor || "Без статуса"
      : order.status_order_customer || "Без статуса";
  const entityLabel = variant === "service" ? "Услуга" : "Заказ";

  const locationLine = [order.town, order.region, order.country]
    .filter(Boolean)
    .join(", ");

  const contractBudget =
    order.budget_contract != null
      ? formatBudget(order.budget_contract, order.currency_contract)
      : null;

  return (
    <>
      <header className="admin-order-profile__hero">
        <div className="admin-order-profile__hero-glow" aria-hidden="true" />
        <div className="admin-order-profile__hero-inner">
          <div>
            <div className="admin-order-profile__badge-row">
              <span className="admin-order-profile__pill admin-order-profile__pill--muted">
                {entityLabel} № {order.id}
              </span>
              {order.category_work && (
                <span className="admin-order-profile__pill admin-order-profile__pill--category">
                  {order.category_work}
                </span>
              )}
              <span
                className={`admin-order-profile__pill admin-order-profile__pill--${statusPillClass(status)}`}
              >
                {status}
              </span>
            </div>

            <h1 className="admin-order-profile__title">
              {order.title || "Без названия"}
            </h1>

            {order.description && order.description.length <= 160 && (
              <p className="admin-order-profile__desc">{order.description}</p>
            )}
          </div>

          <div className="admin-order-profile__hero-stats">
            <div className="admin-order-profile__stat">
              <span className="admin-order-profile__stat-value">
                {formatBudget(order.budget, order.currency)}
              </span>
              <span className="admin-order-profile__stat-label">Прим. сумма</span>
            </div>
            {contractBudget && (
              <div className="admin-order-profile__stat">
                <span className="admin-order-profile__stat-value">
                  {contractBudget}
                </span>
                <span className="admin-order-profile__stat-label">Контракт</span>
              </div>
            )}
            <div className="admin-order-profile__stat">
              <span className="admin-order-profile__stat-value">
                {order.deadline || "—"}
              </span>
              <span className="admin-order-profile__stat-label">Срок</span>
            </div>
          </div>
        </div>
      </header>

      <div className="admin-order-profile__grid">
        {order.description && order.description.length > 160 && (
          <ProfileCard
            icon="📝"
            iconClass="blue"
            title="Описание"
            wide
          >
            <p className="admin-order-profile__description">
              {order.description}
            </p>
          </ProfileCard>
        )}

        <ProfileCard
          icon="👥"
          iconClass="violet"
          title="Участники"
        >
          <div className="admin-order-profile__fields">
            <InfoField label="Заказчик">
              <UserProfileLink
                userId={order.customer_id}
                name={order.customer_name}
              />
            </InfoField>
            <InfoField label="Исполнитель">
              <UserProfileLink
                userId={order.executor_id}
                name={order.executor_name}
              />
            </InfoField>
          </div>
        </ProfileCard>

        <ProfileCard
          icon="💰"
          iconClass="green"
          title="Финансы"
          subtitle="Бюджет и условия оплаты"
        >
          <div className="admin-order-profile__fields">
            <InfoField
              label="Примерная сумма"
              value={formatBudget(order.budget, order.currency)}
            />
            <InfoField
              label="Тип бюджета"
              value={order.budget_type}
              muted={!order.budget_type}
            />
            <InfoField
              label="Сумма по контракту"
              value={contractBudget}
              muted={!contractBudget}
            />
            <InfoField
              label="Страховка"
              value={order.insurance_required ? "Требуется" : "Не требуется"}
            />
          </div>
        </ProfileCard>

        <ProfileCard
          icon="📍"
          iconClass="amber"
          title="География"
          subtitle="Место выполнения работ"
        >
          <div className="admin-order-profile__fields">
            <InfoField label="Страна" value={order.country} muted={!order.country} />
            <InfoField label="Регион" value={order.region} muted={!order.region} />
            <InfoField label="Город" value={order.town} muted={!order.town} />
            <InfoField
              label="Адрес / локация"
              value={order.location}
              muted={!order.location}
            />
            {locationLine && (
              <InfoField label="Полный адрес" value={locationLine} />
            )}
          </div>
        </ProfileCard>

        <ProfileCard
          icon="📅"
          iconClass="blue"
          title="Сроки"
          subtitle="Даты создания и выполнения"
        >
          <div className="admin-order-profile__fields">
            <InfoField
              label="Создан"
              value={formatDateTime(order.created_at)}
            />
            <InfoField
              label="Обновлён"
              value={formatDateTime(order.updated_at)}
            />
            <InfoField label="Дедлайн" value={order.deadline} muted={!order.deadline} />
            <InfoField
              label="Начало работ"
              value={order.date_start_work}
              muted={!order.date_start_work}
            />
            <InfoField
              label="Окончание работ"
              value={order.date_end_work}
              muted={!order.date_end_work}
            />
            <InfoField
              label="Срочность"
              value={order.urgency_level}
              muted={!order.urgency_level}
            />
          </div>
        </ProfileCard>
      </div>
    </>
  );
}

export default function AdminOrderProfileView({
  order,
  loading,
  error,
  orderId,
  onBack,
  backLabel = "← Назад к заказам",
  breadcrumb,
  onRetry,
  variant = "order",
}) {
  if (!orderId) {
    return (
      <div className="admin-order-profile">
        <div className="admin-order-profile__state">
          <p>{variant === "service" ? "Услуга не найдена" : "Заказ не найден"}</p>
          <button
            type="button"
            className="admin-order-profile__back"
            onClick={onBack}
          >
            {backLabel}
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="admin-order-profile">
        <div className="admin-order-profile__state">
          <div className="admin-order-profile__spinner" aria-hidden="true" />
          <p>{variant === "service" ? "Загрузка услуги…" : "Загрузка заказа…"}</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="admin-order-profile">
        <div className="admin-order-profile__state admin-order-profile__state--error">
          <p>{error || "Не удалось загрузить данные"}</p>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {onRetry && (
              <button
                type="button"
                className="admin-order-profile__back"
                onClick={onRetry}
              >
                Повторить
              </button>
            )}
            <button
              type="button"
              className="admin-order-profile__back"
              onClick={onBack}
            >
              {backLabel}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-order-profile">
      <div className="admin-order-profile__topbar">
        <button
          type="button"
          className="admin-order-profile__back"
          onClick={onBack}
        >
          {backLabel}
        </button>
        {breadcrumb && (
          <p className="admin-order-profile__breadcrumb">{breadcrumb}</p>
        )}
      </div>

      <OrderProfileContent order={order} variant={variant} />
    </div>
  );
}
