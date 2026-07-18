import React, { useState, useCallback, useMemo, useEffect } from "react";
import { API, apiFetch } from "../../../../utils/api.js";
import "./executor_bank_account.css";
const BANK_OPTIONS = [
  "Беларусбанк",
  "Приорбанк",
  "Белагропромбанк",
  "БСБ Банк",
  "Другой",
];

function BankIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M3 10h18M5 10V19M9 10V19M15 10V19M19 10V19M2 19h20M12 3l9 5H3l9-5z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden="true">
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg className="eba-info__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" strokeLinecap="round" />
    </svg>
  );
}

function maskAccountNumber(iban) {
  const clean = (iban || "").replace(/\s/g, "");
  if (clean.length <= 8) return clean;
  return `${clean.slice(0, 4)} •••• •••• ${clean.slice(-4)}`;
}

export default function ExecutorBankAccount() {
  const [executorId, setExecutorId] = useState(null);

  useEffect(() => {
    const userId = localStorage.getItem("user_id");
    if (userId) {
      setExecutorId(parseInt(userId, 10));
    }
  }, []);

  const [formData, setFormData] = useState({
    executor_id: null,
    bank_name: "",
    account_number: "",
    inn: "",
    bank_bic: "",
    bank_account: "",
    agreed_to_processing: true,
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [isVerified, setIsVerified] = useState(false);

  useEffect(() => {
    if (executorId) {
      setFormData((prev) => ({ ...prev, executor_id: executorId }));
    }
  }, [executorId]);

  const validateIBAN = useCallback((iban) => {
    const clean = iban.replace(/\s/g, "").toUpperCase();
    return /^BY\d{2}[A-Z]{4}[0-9]{20}$/.test(clean) && clean.length === 28;
  }, []);

  const validateForm = useCallback(() => {
    const newErrors = {};

    if (!formData.bank_name.trim()) {
      newErrors.bank_name = "Выберите банк";
    }
    if (!formData.account_number.trim()) {
      newErrors.account_number = "Введите счёт";
    } else if (!validateIBAN(formData.account_number)) {
      newErrors.account_number = "Неверный IBAN (формат BY13BLBB...)";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData.bank_name, formData.account_number, validateIBAN]);

  const handleInputChange = useCallback((e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: "" }));
  }, []);

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();

      if (!validateForm() || !executorId) {
        alert(
          executorId
            ? "Исправьте ошибки в форме"
            : "Пользователь не авторизован",
        );
        return;
      }

      setLoading(true);
      try {
        const response = await apiFetch(
          `${API.baseURL}/executor/${executorId}/bank-account`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${localStorage.getItem("access_token")}`,
            },
            body: JSON.stringify(formData),
          },
        );

        if (response.ok) {
          setIsVerified(true);
        } else {
          const error = await response.json();
          alert(`Ошибка: ${error.detail || "Неизвестная ошибка сервера"}`);
        }
      } catch (error) {
        console.error("Network error:", error);
        alert("Ошибка сети. Проверьте подключение.");
      } finally {
        setLoading(false);
      }
    },
    [executorId, formData, validateForm],
  );

  const isFormValid = useMemo(() => {
    return (
      formData.bank_name.trim() &&
      formData.account_number.trim() &&
      validateIBAN(formData.account_number)
    );
  }, [formData.bank_name, formData.account_number, validateIBAN]);

  if (isVerified) {
    return (
      <div className="eba-page">
        <div className="eba-success">
          <div className="eba-success__icon">
            <CheckIcon />
          </div>
          <h2 className="eba-success__title">Счёт привязан</h2>
          <p className="eba-success__text">
            Выплаты по подтверждённым заказам будут поступать автоматически на
            указанный расчётный счёт.
          </p>

          <div className="eba-success-card">
            <div className="eba-success-card__row">
              <span className="eba-success-card__label">Банк</span>
              <span className="eba-success-card__value">{formData.bank_name}</span>
            </div>
            <div className="eba-success-card__row">
              <span className="eba-success-card__label">IBAN</span>
              <span className="eba-success-card__value eba-success-card__value--mono">
                {maskAccountNumber(formData.account_number)}
              </span>
            </div>
            <div className="eba-success-card__row">
              <span className="eba-success-card__label">Выплата</span>
              <span className="eba-success-card__value">до 90% от суммы заказа</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!executorId) {
    return (
      <div className="eba-page">
        <div className="eba-loading">
          <span className="eba-loading__spinner" aria-hidden="true" />
          Загрузка данных…
        </div>
      </div>
    );
  }

  return (
    <div className="eba-page">
      <header className="eba-header">
        <div className="eba-header__icon">
          <BankIcon />
        </div>
        <div className="eba-header__text">
          <h1 className="eba-header__title">Счёт для выплат</h1>
          <p className="eba-header__subtitle">
            Укажите реквизиты один раз — дальше переводы будут проходить
            автоматически после подтверждения заказа
          </p>
        </div>
      </header>

      <div className="eba-features">
        <div className="eba-feature">
          <span className="eba-feature__label">Автовыплаты</span>
          <span className="eba-feature__text">Без ручных заявок на вывод</span>
        </div>
        <div className="eba-feature">
          <span className="eba-feature__label">Один раз</span>
          <span className="eba-feature__text">Реквизиты сохраняются в профиле</span>
        </div>
        <div className="eba-feature">
          <span className="eba-feature__label">IBAN</span>
          <span className="eba-feature__text">Стандартный формат для РБ</span>
        </div>
      </div>

      <div className="eba-panel">
        <div className="eba-info">
          <InfoIcon />
          <div>
            <p className="eba-info__title">Зачем это нужно</p>
            <p className="eba-info__text">
              После подтверждения заказчиком средства переводятся на ваш
              расчётный счёт. Проверьте данные перед сохранением — изменить их
              можно только через поддержку.
            </p>
          </div>
        </div>

        <form className="eba-form" onSubmit={handleSubmit} noValidate>
          <div className="eba-field">
            <label className="eba-label" htmlFor="eba-bank">
              Название банка <span>*</span>
            </label>
            <select
              id="eba-bank"
              name="bank_name"
              value={formData.bank_name}
              onChange={handleInputChange}
              className={`eba-select ${errors.bank_name ? "eba-select--error" : ""}`}
            >
              <option value="">Выберите банк</option>
              {BANK_OPTIONS.map((bank) => (
                <option key={bank} value={bank}>
                  {bank}
                </option>
              ))}
            </select>
            {errors.bank_name && (
              <p className="eba-error" role="alert">
                {errors.bank_name}
              </p>
            )}
          </div>

          <div className="eba-field">
            <label className="eba-label" htmlFor="eba-iban">
              Расчётный счёт (IBAN) <span>*</span>
            </label>
            <input
              id="eba-iban"
              name="account_number"
              value={formData.account_number}
              onChange={handleInputChange}
              placeholder="BY13BLBB30120000510291000001"
              className={`eba-input eba-input--mono ${errors.account_number ? "eba-input--error" : ""}`}
              autoComplete="off"
              spellCheck={false}
            />
            {errors.account_number ? (
              <p className="eba-error" role="alert">
                {errors.account_number}
              </p>
            ) : (
              <p className="eba-hint">28 символов, начинается с BY</p>
            )}
          </div>

          <div className="eba-row">
            <div className="eba-field">
              <label className="eba-label" htmlFor="eba-inn">
                ИНН (для ИП)
              </label>
              <input
                id="eba-inn"
                name="inn"
                value={formData.inn}
                onChange={handleInputChange}
                placeholder="123456789"
                maxLength={9}
                className="eba-input"
                inputMode="numeric"
              />
            </div>
            <div className="eba-field">
              <label className="eba-label" htmlFor="eba-bic">
                БИК банка
              </label>
              <input
                id="eba-bic"
                name="bank_bic"
                value={formData.bank_bic}
                onChange={handleInputChange}
                placeholder="BLBBBY2X"
                maxLength={9}
                className="eba-input eba-input--mono"
                spellCheck={false}
              />
            </div>
          </div>

          <button
            type="submit"
            className="eba-submit"
            disabled={!isFormValid || loading}
          >
            {loading && <span className="eba-submit__spinner" aria-hidden="true" />}
            {loading ? "Сохраняем…" : "Привязать счёт"}
          </button>

          <div className="eba-notice">
            <p className="eba-notice__text">
              После привязки подтверждённые заказы будут автоматически
              выплачиваться на этот счёт.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
