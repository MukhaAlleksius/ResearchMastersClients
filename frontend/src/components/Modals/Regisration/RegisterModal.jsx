import React, { useState, useEffect, useCallback } from "react";
import Select from "react-select";
import { API, apiFetch } from "../../../utils/api.js";
import { Link } from "react-router-dom";
import { createPortal } from "react-dom";
import {
  fetchRegionsList,
  fetchTownsList,
  getFallbackRegistrationGeography,
  loadDefaultRegistrationGeography,
} from "../../../utils/geographyApi";
import "./registration_modal.css";

function FieldRow({ label, htmlFor, hint, children }) {
  return (
    <div className="reg-modal__row">
      <label className="reg-modal__label" htmlFor={htmlFor}>
        {label}
      </label>
      <div className="reg-modal__control">{children}</div>
      {hint ? <span className="reg-modal__hint">{hint}</span> : <span />}
    </div>
  );
}

function findOption(options, id) {
  if (id === "" || id == null) return null;
  return options.find((item) => String(item.value) === String(id)) || null;
}

const geoSelectStyles = {
  menuPortal: (base) => ({ ...base, zIndex: 4000 }),
  control: (base, state) => ({
    ...base,
    minHeight: 42,
    borderRadius: 10,
    borderColor: state.isFocused ? "#2563eb" : "#e2e8f0",
    backgroundColor: "#f8fafc",
    boxShadow: state.isFocused ? "0 0 0 3px rgba(37, 99, 235, 0.12)" : "none",
    "&:hover": { borderColor: state.isFocused ? "#2563eb" : "#cbd5e1" },
  }),
  valueContainer: (base) => ({ ...base, padding: "0 12px" }),
  indicatorsContainer: (base) => ({ ...base, paddingRight: 6 }),
  menu: (base) => ({ ...base, zIndex: 4000 }),
};

export default function RegisterModal({ isOpen, onClose }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [countries, setCountries] = useState([]);
  const [regions, setRegions] = useState([]);
  const [towns, setTowns] = useState([]);
  const [countryId, setCountryId] = useState("");
  const [regionId, setRegionId] = useState("");
  const [townId, setTownId] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);

  const loadGeographyDefaults = useCallback(async () => {
    try {
      setGeoLoading(true);
      const geo = await loadDefaultRegistrationGeography();
      setCountries(geo.countries);
      setRegions(geo.regions);
      setTowns(geo.towns);
      setCountryId(geo.countryId);
      setRegionId(geo.regionId);
      setTownId(geo.townId);
    } catch {
      const geo = getFallbackRegistrationGeography();
      setCountries(geo.countries);
      setRegions(geo.regions);
      setTowns(geo.towns);
      setCountryId(geo.countryId);
      setRegionId(geo.regionId);
      setTownId(geo.townId);
    } finally {
      setGeoLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadGeographyDefaults();
    }
  }, [isOpen, loadGeographyDefaults]);

  if (!isOpen) return null;

  const resetForm = () => {
    setFirstName("");
    setLastName("");
    setCountryId("");
    setRegionId("");
    setTownId("");
    setRegions([]);
    setTowns([]);
    setEmail("");
    setPassword("");
    setAgreeTerms(false);
    setError("");
  };

  const handleCountryChange = async (option) => {
    const nextCountryId = option ? String(option.value) : "";
    setCountryId(nextCountryId);
    setRegionId("");
    setTownId("");
    setRegions([]);
    setTowns([]);

    if (!nextCountryId) return;

    try {
      setGeoLoading(true);
      const nextRegions = await fetchRegionsList(nextCountryId);
      setRegions(nextRegions);
      if (nextRegions.length === 1) {
        const onlyRegionId = String(nextRegions[0].value);
        setRegionId(onlyRegionId);
        const nextTowns = await fetchTownsList(onlyRegionId);
        setTowns(nextTowns);
        if (nextTowns.length === 1) {
          setTownId(String(nextTowns[0].value));
        }
      }
    } catch {
      setRegions([]);
    } finally {
      setGeoLoading(false);
    }
  };

  const handleRegionChange = async (option) => {
    const nextRegionId = option ? String(option.value) : "";
    setRegionId(nextRegionId);
    setTownId("");
    setTowns([]);

    if (!nextRegionId) return;

    try {
      setGeoLoading(true);
      const nextTowns = await fetchTownsList(nextRegionId);
      setTowns(nextTowns);
      if (nextTowns.length === 1) {
        setTownId(String(nextTowns[0].value));
      }
    } catch {
      setTowns([]);
    } finally {
      setGeoLoading(false);
    }
  };

  const getSelectedLabel = (options, id) =>
    options.find((item) => String(item.value) === String(id))?.label || "";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (
      !firstName.trim() ||
      !lastName.trim() ||
      !countryId ||
      !regionId ||
      !townId ||
      !email.trim() ||
      !password
    ) {
      setError(
        "Заполните все обязательные поля и выберите местоположение из списка.",
      );
      return;
    }

    if (!agreeTerms) {
      setError(
        "Подтвердите согласие с условиями и политикой конфиденциальности.",
      );
      return;
    }

    setLoading(true);

    try {
      const response = await apiFetch(`${API.baseURL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          country: getSelectedLabel(countries, countryId),
          region: getSelectedLabel(regions, regionId),
          town: getSelectedLabel(towns, townId),
          email: email.trim(),
          password: password,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const detail = data.detail;
        throw new Error(
          typeof detail === "string" ? detail : "Не удалось зарегистрироваться",
        );
      }

      resetForm();
      onClose();
      alert("Регистрация успешна! Теперь войдите в аккаунт.");
    } catch (err) {
      setError(err.message || "Ошибка регистрации");
    } finally {
      setLoading(false);
    }
  };

  const fieldsDisabled = loading;
  const inputClass = "reg-modal__input";

  return createPortal(
    <div className="reg-modal-overlay" onClick={onClose} role="presentation">
      <div
        className="reg-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="registerModalTitle"
      >
        <header className="reg-modal__hero">
          <span className="reg-modal__badge">Fixer</span>
          <h2 id="registerModalTitle" className="reg-modal__title">
            Создать аккаунт
          </h2>
          <p className="reg-modal__subtitle">
            Заказы, услуги и оплата в одном месте
          </p>
          <button
            type="button"
            className="reg-modal__close"
            onClick={onClose}
            aria-label="Закрыть"
            disabled={loading}
          >
            ×
          </button>
        </header>

        <form className="reg-modal__form" onSubmit={handleSubmit} noValidate>
          <div className="reg-modal__body">
            {error && (
              <p className="reg-modal__error" role="alert">
                {error}
              </p>
            )}

            <div className="reg-modal__fields">
              <FieldRow label="Имя *" htmlFor="reg-first-name">
                <input
                  id="reg-first-name"
                  type="text"
                  className={inputClass}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoComplete="given-name"
                  disabled={fieldsDisabled}
                  placeholder="Иван"
                />
              </FieldRow>

              <FieldRow label="Фамилия *" htmlFor="reg-last-name">
                <input
                  id="reg-last-name"
                  type="text"
                  className={inputClass}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  autoComplete="family-name"
                  disabled={fieldsDisabled}
                  placeholder="Иванов"
                />
              </FieldRow>

              <FieldRow
                label="Страна *"
                htmlFor="reg-country"
                hint="из справочника"
              >
                <Select
                  inputId="reg-country"
                  classNamePrefix="reg-geo"
                  options={countries}
                  value={findOption(countries, countryId)}
                  onChange={handleCountryChange}
                  isDisabled={fieldsDisabled || countries.length === 0}
                  isLoading={geoLoading && countries.length === 0}
                  isClearable={false}
                  placeholder={
                    countries.length === 0
                      ? geoLoading
                        ? "Загрузка…"
                        : "Нет стран в справочнике"
                      : "Выберите страну"
                  }
                  noOptionsMessage={() => "Нет вариантов"}
                  menuPortalTarget={document.body}
                  menuPosition="fixed"
                  styles={geoSelectStyles}
                />
              </FieldRow>

              <FieldRow
                label="Регион *"
                htmlFor="reg-region"
                hint={!countryId ? "сначала страна" : ""}
              >
                <Select
                  inputId="reg-region"
                  classNamePrefix="reg-geo"
                  options={regions}
                  value={findOption(regions, regionId)}
                  onChange={handleRegionChange}
                  isDisabled={
                    fieldsDisabled || !countryId || regions.length === 0
                  }
                  isLoading={geoLoading && Boolean(countryId) && regions.length === 0}
                  isClearable={false}
                  placeholder={
                    !countryId
                      ? "Сначала выберите страну"
                      : regions.length === 0
                        ? "Нет регионов"
                        : "Выберите регион"
                  }
                  noOptionsMessage={() => "Нет вариантов"}
                  menuPortalTarget={document.body}
                  menuPosition="fixed"
                  styles={geoSelectStyles}
                />
              </FieldRow>

              <FieldRow
                label="Город *"
                htmlFor="reg-town"
                hint={!regionId ? "сначала регион" : ""}
              >
                <Select
                  inputId="reg-town"
                  classNamePrefix="reg-geo"
                  options={towns}
                  value={findOption(towns, townId)}
                  onChange={(option) =>
                    setTownId(option ? String(option.value) : "")
                  }
                  isDisabled={fieldsDisabled || !regionId || towns.length === 0}
                  isLoading={geoLoading && Boolean(regionId) && towns.length === 0}
                  isClearable={false}
                  placeholder={
                    !regionId
                      ? "Сначала выберите регион"
                      : towns.length === 0
                        ? "Нет городов"
                        : "Выберите город"
                  }
                  noOptionsMessage={() => "Нет вариантов"}
                  menuPortalTarget={document.body}
                  menuPosition="fixed"
                  styles={geoSelectStyles}
                />
              </FieldRow>

              <FieldRow label="Email *" htmlFor="reg-email" hint="для входа">
                <input
                  id="reg-email"
                  type="email"
                  className={inputClass}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  disabled={fieldsDisabled}
                  placeholder="name@example.com"
                />
              </FieldRow>

              <FieldRow
                label="Пароль *"
                htmlFor="reg-password"
                hint="не короче 6 симв."
              >
                <input
                  id="reg-password"
                  type="password"
                  className={inputClass}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  disabled={fieldsDisabled}
                  placeholder="••••••••"
                />
              </FieldRow>
            </div>

            <label className="reg-modal__terms">
              <input
                type="checkbox"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                disabled={loading}
              />
              <span>
                Согласен с{" "}
                <Link to="/legal/terms" target="_blank" rel="noopener noreferrer">
                  пользовательским соглашением
                </Link>{" "}
                и{" "}
                <Link
                  to="/legal/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  политикой конфиденциальности
                </Link>
              </span>
            </label>
          </div>

          <footer className="reg-modal__footer">
            <button
              type="submit"
              className="reg-modal__submit"
              disabled={loading || geoLoading}
            >
              {loading ? "Регистрируем…" : "Зарегистрироваться"}
            </button>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  );
}
