import React, { useEffect, useMemo, useState } from "react";
import { apiFetch, buildApiUrl } from "../../../utils/api.js";
import OrderInfoAnswerExecutor from "../Profile/Services/CommonComponent/CustomerOrderInfo/OrderInfoAnswerExecutor";
import "../Profile/Services/CommonComponent/CustomerOrderInfo/customer_order_info.css";
import "./order_customer.css";
function formatUserName(user) {
  if (!user) return "Пользователь";
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");
  return fullName || "Пользователь";
}

function formatUserLocation(user) {
  if (!user) return "";
  return [user.country, user.region, user.town].filter(Boolean).join(", ");
}

export default function OrderCustomer({ order, onBack, openModal }) {
  const userId = localStorage.getItem("user_id");
  const isLoggedIn = Boolean(localStorage.getItem("access_token"));

  const [customer, setCustomer] = useState(null);
  const [customerAvatarOk, setCustomerAvatarOk] = useState(false);
  const [customerLoading, setCustomerLoading] = useState(false);

  const isOwnOrder = useMemo(() => {
    if (!userId || !order?.customer_id) return false;
    return String(order.customer_id) === String(userId);
  }, [order?.customer_id, userId]);

  const canOfferService = isLoggedIn && Boolean(userId) && !isOwnOrder;
  const showGuestOfferHint = !isLoggedIn && !isOwnOrder;

  useEffect(() => {
    if (!order?.customer_id) {
      setCustomer(null);
      setCustomerAvatarOk(false);
      return;
    }

    let cancelled = false;

    const loadCustomer = async () => {
      setCustomerLoading(true);
      try {
        const [profileRes, avatarRes] = await Promise.all([
          apiFetch(
            buildApiUrl(`/information_about_user/${order.customer_id}`),
          ),
          apiFetch(
            buildApiUrl(`/avatar/${order.customer_id}`, { t: Date.now() }),
          ),
        ]);

        if (cancelled) return;

        if (profileRes.ok) {
          setCustomer(await profileRes.json());
        } else {
          setCustomer(null);
        }

        setCustomerAvatarOk(avatarRes.ok);
      } catch {
        if (!cancelled) {
          setCustomer(null);
          setCustomerAvatarOk(false);
        }
      } finally {
        if (!cancelled) {
          setCustomerLoading(false);
        }
      }
    };

    loadCustomer();

    return () => {
      cancelled = true;
    };
  }, [order?.customer_id]);

  if (!order) return null;

  const customerLocation = formatUserLocation(customer);

  return (
    <div className="order-customer-wrapper">
      <button type="button" className="order-customer-back" onClick={onBack}>
        ← Назад к списку
      </button>

      <div className="order-customer-card">
        <div className="order-customer-header">
          <h2 className="order-customer-title">{order.title}</h2>
          <span className="order-customer-id">№ {order.id}</span>
          <span className="order-customer-category">
            🏷️ {order.category_work || "Без категории"}
          </span>
        </div>

        <p className="order-customer-description">{order.description}</p>

        <div className="order-customer-section order-customer-user">
          <h3>Заказчик</h3>
          {customerLoading ? (
            <p className="order-customer-user__loading">Загрузка данных…</p>
          ) : customer ? (
            <div className="order-customer-user__card">
              <div className="order-customer-user__avatar-wrap">
                {customerAvatarOk ? (
                  <img
                    src={buildApiUrl(`/avatar/${order.customer_id}`, {
                      t: Date.now(),
                    })}
                    alt=""
                    className="order-customer-user__avatar"
                    onError={() => setCustomerAvatarOk(false)}
                  />
                ) : (
                  <div
                    className="order-customer-user__avatar order-customer-user__avatar--placeholder"
                    aria-hidden="true"
                  >
                    👤
                  </div>
                )}
              </div>
              <div className="order-customer-user__info">
                <p className="order-customer-user__name">
                  {formatUserName(customer)}
                </p>
                {customerLocation ? (
                  <p className="order-customer-user__location">
                    📍 {customerLocation}
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="order-customer-user__empty">
              Информация о заказчике недоступна
            </p>
          )}
        </div>

        <div className="order-customer-section">
          <h3>География</h3>
          <p>
            📍 {order.country}, {order.region}, {order.town}
          </p>
          {order.location && <p>Адрес / место выполнения: {order.location}</p>}
        </div>

        <div className="order-customer-section">
          <h3>Условия</h3>
          <p>Срочность: {order.urgency_level || "Не указана"}</p>
          <p>Срок выполнения: {order.deadline || "Не указан"}</p>
          <p>
            Примерная сумма:{" "}
            {order.budget
              ? `${order.budget} ${order.currency || "BYN"}`
              : "Договорная"}
          </p>
          {order.insurance_required && <p>Требуется страховка исполнителя</p>}
        </div>

        <div className="order-customer-section">
          <h3>Дополнительно</h3>
          <p>
            Создан:{" "}
            {order.created_at
              ? new Date(order.created_at).toLocaleString()
              : "—"}
          </p>
        </div>

        {showGuestOfferHint && (
          <div className="order-customer-actions order-customer-guest-cta">
            <p className="order-customer-guest-cta__text">
              Чтобы взять этот заказ, зарегистрируйтесь или войдите в аккаунт.
            </p>
            <div className="order-customer-guest-cta__buttons">
              <button
                type="button"
                className="order-customer-guest-cta__btn order-customer-guest-cta__btn--primary"
                onClick={() => openModal?.("loginModal")}
              >
                Войти
              </button>
              <button
                type="button"
                className="order-customer-guest-cta__btn order-customer-guest-cta__btn--secondary"
                onClick={() => openModal?.("registerModal")}
              >
                Зарегистрироваться
              </button>
            </div>
          </div>
        )}

        {canOfferService && (
          <div className="order-customer-actions">
            <OrderInfoAnswerExecutor
              order={order}
              buttonOnly
              primaryActionLabel="Предложить услугу"
              createModalTitle="Предложить услугу заказчику"
            />
          </div>
        )}
      </div>
    </div>
  );
}
