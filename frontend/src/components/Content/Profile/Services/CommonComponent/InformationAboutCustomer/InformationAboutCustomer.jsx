import React, { useState, useEffect, useCallback, useMemo } from "react";
import { API, apiFetch, buildApiUrl } from "../../../../../../utils/api.js";
import { Link } from "react-router-dom";
import { getCustomerProfileLink } from "../../../../../../utils/executorProfile";
import DeleteExecutorCustomerButton from "../../../MyCustomers/DeleteExecutorCustomerButton";
import "./information_about_customer.css";
const getInitials = (name) => {
  if (!name || name === "—") return "?";
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.charAt(0) || "";
  const b = parts[1]?.charAt(0) || "";
  return (a + b).toUpperCase() || name.charAt(0).toUpperCase();
};

function buildProfileName(profile) {
  if (!profile) return "";
  return `${profile.first_name || ""} ${profile.last_name || ""}`.trim();
}

function buildProfileAddress(profile) {
  if (!profile) return "";
  return [profile.country, profile.region, profile.town].filter(Boolean).join(" ");
}

function CustomerFormModal({
  title,
  phone,
  notification,
  onPhoneChange,
  onNotificationChange,
  onSubmit,
  onClose,
  submitting,
  submitLabel,
}) {
  return (
    <div className="ac-modal-overlay" onClick={onClose} role="presentation">
      <div
        className="ac-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-form-modal-title"
      >
        <header className="ac-modal__header">
          <h3 id="customer-form-modal-title" className="ac-modal__title">
            {title}
          </h3>
          <button
            type="button"
            className="ac-modal__close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </header>

        <div className="ac-modal__body">
          <label className="ac-modal__field">
            <span className="ac-modal__field-label">Телефон</span>
            <input
              type="tel"
              className="ac-modal__input"
              placeholder="+375 (__) ___-__-__"
              value={phone}
              onChange={(e) => onPhoneChange(e.target.value)}
            />
          </label>

          <label className="ac-modal__field">
            <span className="ac-modal__field-label">Заметка / уведомление</span>
            <textarea
              className="ac-modal__textarea"
              placeholder="Контакты, предпочтения, комментарии…"
              value={notification}
              onChange={(e) => onNotificationChange(e.target.value)}
            />
          </label>
        </div>

        <footer className="ac-modal__footer">
          <button
            type="button"
            className="ac-modal__btn-cancel"
            onClick={onClose}
            disabled={submitting}
          >
            Отмена
          </button>
          <button
            type="button"
            className="ac-modal__btn-submit"
            onClick={onSubmit}
            disabled={submitting}
          >
            {submitting ? "Сохранение…" : submitLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}

function CustomerProfileTitle({ name, profileLink }) {
  if (profileLink) {
    return (
      <Link
        to={profileLink.pathname}
        state={profileLink.state}
        className="about-customer__title about-customer__title--link"
      >
        {name}
      </Link>
    );
  }

  return <h2 className="about-customer__title">{name}</h2>;
}

export default function CustomerInfo({
  customerId,
  onSaved,
  showRemoveFromList = false,
  customerName,
  onRemoved,
}) {
  const [savedContacts, setSavedContacts] = useState(null);
  const [customerProfile, setCustomerProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [phone, setPhone] = useState("");
  const [notification, setNotification] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const user_id = localStorage.getItem("user_id");
  const hasExecutorId = Boolean(user_id);

  const displayName = useMemo(() => {
    if (savedContacts?.name_customer) {
      return savedContacts.name_customer;
    }
    const profileName = buildProfileName(customerProfile);
    return profileName || "Заказчик";
  }, [savedContacts, customerProfile]);

  const displayAddress = useMemo(() => {
    if (savedContacts?.address) {
      return savedContacts.address;
    }
    return buildProfileAddress(customerProfile) || "—";
  }, [savedContacts, customerProfile]);

  const profileLink = useMemo(
    () =>
      getCustomerProfileLink(
        customerId,
        savedContacts?.name_customer || customerProfile || displayName,
      ),
    [customerId, savedContacts, customerProfile, displayName],
  );

  const hasPrivateContacts = Boolean(
    savedContacts?.phone || savedContacts?.notification,
  );

  const fetchCustomerData = useCallback(async () => {
    if (!customerId || !user_id) {
      setError("ID заказчика или исполнителя не передан");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [contactsRes, profileRes] = await Promise.all([
        apiFetch(
          buildApiUrl(`/information_about_customer/${user_id}/${customerId}`),
        ),
        apiFetch(buildApiUrl(`/profile/?user_id=${customerId}`)),
      ]);

      if (contactsRes.ok) {
        const contactsData = await contactsRes.json();
        setSavedContacts(contactsData || null);
      } else {
        setSavedContacts(null);
      }

      if (profileRes.ok) {
        setCustomerProfile(await profileRes.json());
      } else {
        setCustomerProfile(null);
      }
    } catch (err) {
      console.error("Ошибка:", err);
      setError("Не удалось загрузить данные заказчика");
    } finally {
      setLoading(false);
    }
  }, [customerId, user_id]);

  const openModal = (prefill = {}) => {
    setPhone(prefill.phone || "");
    setNotification(prefill.notification || "");
    setShowModal(true);
  };

  const saveInformation = async () => {
    if (!phone.trim()) {
      alert("Введите телефон");
      return;
    }

    setSubmitting(true);
    try {
      const response = await apiFetch(
        buildApiUrl("/add_information_about_customer"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            executor_id: user_id,
            customer_id: customerId,
            phone: phone.trim(),
            notification: notification.trim(),
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      setShowModal(false);
      setPhone("");
      setNotification("");
      await fetchCustomerData();
      onSaved?.();
    } catch (err) {
      console.error("Ошибка:", err);
      alert("Не удалось сохранить информацию");
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    fetchCustomerData();
  }, [fetchCustomerData]);

  if (loading) {
    return (
      <div className="about-customer about-customer--loading">
        <div className="about-customer__spinner" aria-hidden="true" />
        <p className="about-customer__state-text">Загрузка данных заказчика…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="about-customer about-customer--error">
        <p className="about-customer__state-text">{error}</p>
      </div>
    );
  }

  const phoneValue = savedContacts?.phone || "—";
  const note = savedContacts?.notification || "—";

  return (
    <div className="about-customer">
      <article className="about-customer__shell">
        <header className="about-customer__hero">
          <div className="about-customer__avatar" aria-hidden="true">
            {getInitials(displayName)}
          </div>
          <div className="about-customer__hero-text">
            <span className="about-customer__badge">Заказчик</span>
            <CustomerProfileTitle name={displayName} profileLink={profileLink} />
          </div>
        </header>

        <div className="about-customer__body">
          <div className="about-customer__grid">
            <div className="about-customer__card about-customer__card--wide">
              <span className="about-customer__label">ФИО</span>
              {profileLink ? (
                <Link
                  to={profileLink.pathname}
                  state={profileLink.state}
                  className="about-customer__value about-customer__value--link"
                >
                  {displayName}
                </Link>
              ) : (
                <span className="about-customer__value">{displayName}</span>
              )}
            </div>
            <div className="about-customer__card about-customer__card--wide">
              <span className="about-customer__label">Адрес</span>
              <span className="about-customer__value">{displayAddress}</span>
            </div>
            <div className="about-customer__card">
              <span className="about-customer__label">Ваш телефон</span>
              <span className="about-customer__value about-customer__value--phone">
                {phoneValue}
              </span>
            </div>
            <div className="about-customer__card about-customer__card--wide">
              <span className="about-customer__label">Ваша заметка</span>
              <span className="about-customer__value about-customer__value--note">
                {note}
              </span>
            </div>
          </div>

          {!hasPrivateContacts && (
            <p className="about-customer__hint">
              Личные контакты видны только вам. Добавьте телефон и заметку для
              быстрой связи по заказу.
            </p>
          )}
        </div>

        <footer className="about-customer__footer">
          {profileLink && (
            <Link
              to={profileLink.pathname}
              state={profileLink.state}
              className="about-customer__btn about-customer__btn--secondary"
            >
              Профиль заказчика
            </Link>
          )}
          <button
            type="button"
            className="about-customer__btn about-customer__btn--primary"
            onClick={() =>
              openModal({
                phone: savedContacts?.phone,
                notification: savedContacts?.notification,
              })
            }
          >
            {hasPrivateContacts ? "Редактировать контакты" : "Добавить контакты"}
          </button>
          {showRemoveFromList && hasExecutorId && (
            <DeleteExecutorCustomerButton
              executorId={Number(user_id)}
              customerId={Number(customerId)}
              customerName={customerName || displayName}
              onDeleted={onRemoved}
              className="about-customer__btn about-customer__btn--danger"
              label="Удалить из списка"
            />
          )}
        </footer>
      </article>

      {showModal && (
        <CustomerFormModal
          title={
            hasPrivateContacts
              ? "Редактировать информацию о заказчике"
              : "Добавить информацию о заказчике"
          }
          phone={phone}
          notification={notification}
          onPhoneChange={setPhone}
          onNotificationChange={setNotification}
          onSubmit={saveInformation}
          onClose={() => setShowModal(false)}
          submitting={submitting}
          submitLabel={hasPrivateContacts ? "Сохранить" : "Добавить"}
        />
      )}
    </div>
  );
}
