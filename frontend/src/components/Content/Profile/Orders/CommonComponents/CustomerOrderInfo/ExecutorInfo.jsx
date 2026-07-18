import React, { useState, useEffect, useCallback } from "react";
import {
  apiFetch,
  buildApiUrl,
  ensureStoredUserId,
  getStoredUserId,
} from "../../../../../../utils/api.js";
import { Link } from "react-router-dom";
import { getExecutorProfileLink } from "../../../../../../utils/executorProfile";
import DeleteCustomerExecutorButton from "../../../MyExecutors/DeleteCustomerExecutorButton";
import "../../../Services/CommonComponent/InformationAboutCustomer/information_about_customer.css";

const getInitials = (name) => {
  if (!name || name === "—") return "?";
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.charAt(0) || "";
  const b = parts[1]?.charAt(0) || "";
  return (a + b).toUpperCase() || name.charAt(0).toUpperCase();
};

function ExecutorFormModal({
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
        aria-labelledby="executor-form-modal-title"
      >
        <header className="ac-modal__header">
          <h3 id="executor-form-modal-title" className="ac-modal__title">
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

export default function ExecutorInfo({
  executorId,
  customerId: customerIdProp,
  onSaved,
  showRemoveFromList = false,
  executorName,
  onRemoved,
}) {
  const [informationAboutExecutor, setInformationAboutExecutor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [phone, setPhone] = useState("");
  const [notification, setNotification] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [customerId, setCustomerId] = useState(
    () => customerIdProp ?? getStoredUserId(),
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const resolvedCustomerId =
        customerIdProp ?? (await ensureStoredUserId()) ?? getStoredUserId();
      if (!cancelled) {
        setCustomerId(resolvedCustomerId);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [customerIdProp]);

  const resolvedExecutorId = Number(executorId);
  const hasExecutorId = Number.isFinite(resolvedExecutorId) && resolvedExecutorId > 0;
  const hasCustomerId = Number.isFinite(Number(customerId)) && Number(customerId) > 0;

  const fetchInformationAboutExecutor = useCallback(async () => {
    if (!hasExecutorId) {
      setError("Исполнитель для этого заказа ещё не назначен");
      setLoading(false);
      return;
    }

    if (!hasCustomerId) {
      setError("Не удалось определить заказчика. Войдите в аккаунт снова.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await apiFetch(
        buildApiUrl(
          `/information_about_executor/${Number(customerId)}/${resolvedExecutorId}`,
        ),
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (!data) {
        setError("Исполнитель не найден");
        setInformationAboutExecutor(null);
        return;
      }

      setInformationAboutExecutor(data);
    } catch (err) {
      console.error("Ошибка:", err);
      setError("Не удалось загрузить данные");
    } finally {
      setLoading(false);
    }
  }, [customerId, hasCustomerId, hasExecutorId, resolvedExecutorId]);

  const saveInformation = async () => {
    if (!phone.trim()) {
      alert("Введите телефон");
      return;
    }

    if (!hasExecutorId || !hasCustomerId) {
      alert("Не удалось определить заказчика или исполнителя");
      return;
    }

    setSubmitting(true);
    try {
      const response = await apiFetch(
        buildApiUrl("/add_information_about_executor"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            executor_id: resolvedExecutorId,
            customer_id: Number(customerId),
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
      await fetchInformationAboutExecutor();
      onSaved?.();
    } catch (err) {
      console.error("Ошибка:", err);
      alert("Не удалось сохранить информацию");
    } finally {
      setSubmitting(false);
    }
  };

  const openModal = (prefill = {}) => {
    setPhone(prefill.phone || "");
    setNotification(prefill.notification || "");
    setShowModal(true);
  };

  useEffect(() => {
    fetchInformationAboutExecutor();
  }, [fetchInformationAboutExecutor]);
  if (loading) {
    return (
      <div className="about-customer about-customer--loading">
        <div className="about-customer__spinner" aria-hidden="true" />
        <p className="about-customer__state-text">Загрузка данных исполнителя…</p>
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

  if (!informationAboutExecutor) {
    return null;
  }

  const name = informationAboutExecutor.name_executor || "—";
  const address = informationAboutExecutor.address || "—";
  const phoneValue = informationAboutExecutor.phone || "—";
  const note = informationAboutExecutor.notification || "—";
  const profileLink = getExecutorProfileLink(resolvedExecutorId, name);
  const hasContacts = Boolean(
    informationAboutExecutor.phone || informationAboutExecutor.notification,
  );

  return (
    <div className="about-customer">
      <article className="about-customer__shell">
        <header className="about-customer__hero">
          <div className="about-customer__avatar" aria-hidden="true">
            {getInitials(name)}
          </div>
          <div className="about-customer__hero-text">
            <span className="about-customer__badge">Исполнитель</span>
            <h2 className="about-customer__title">{name}</h2>
          </div>
        </header>

        <div className="about-customer__body">
          <div className="about-customer__grid">
            <div className="about-customer__card about-customer__card--wide">
              <span className="about-customer__label">ФИО</span>
              <span className="about-customer__value">{name}</span>
            </div>
            <div className="about-customer__card">
              <span className="about-customer__label">Телефон</span>
              <span className="about-customer__value about-customer__value--phone">
                {phoneValue}
              </span>
            </div>
            <div className="about-customer__card about-customer__card--wide">
              <span className="about-customer__label">Адрес</span>
              <span className="about-customer__value">{address}</span>
            </div>
            <div className="about-customer__card about-customer__card--wide">
              <span className="about-customer__label">Заметка</span>
              <span className="about-customer__value about-customer__value--note">
                {note}
              </span>
            </div>
          </div>
        </div>

        <footer className="about-customer__footer">
          {profileLink && (
            <Link
              to={profileLink.pathname}
              state={profileLink.state}
              className="about-customer__btn about-customer__btn--secondary"
            >
              Профиль исполнителя
            </Link>
          )}
          <button
            type="button"
            className="about-customer__btn about-customer__btn--primary"
            onClick={() =>
              openModal({
                phone: informationAboutExecutor.phone,
                notification: informationAboutExecutor.notification,
              })
            }
          >
            {hasContacts ? "Редактировать контакты" : "Добавить контакты"}
          </button>
          {showRemoveFromList && hasCustomerId && (
            <DeleteCustomerExecutorButton
              customerId={Number(customerId)}
              executorId={resolvedExecutorId}              executorName={executorName || name}
              onDeleted={onRemoved}
              className="about-customer__btn about-customer__btn--danger"
              label="Удалить из списка"
            />
          )}
        </footer>
      </article>

      {showModal && (
        <ExecutorFormModal
          title={
            hasContacts
              ? "Редактировать информацию об исполнителе"
              : "Добавить информацию об исполнителе"
          }
          phone={phone}
          notification={notification}
          onPhoneChange={setPhone}
          onNotificationChange={setNotification}
          onSubmit={saveInformation}
          onClose={() => setShowModal(false)}
          submitting={submitting}
          submitLabel={hasContacts ? "Сохранить" : "Добавить"}
        />
      )}
    </div>
  );
}
