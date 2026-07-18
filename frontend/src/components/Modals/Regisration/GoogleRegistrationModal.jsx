import React, { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { apiFetch, buildApiUrl } from "../../../utils/api.js";
import {
  fetchCountriesList,
  fetchRegionsList,
  fetchTownsList,
} from "../../../utils/geographyApi.js";
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

function getSelectedLabel(options, id) {
  return (
    options.find((item) => String(item.value) === String(id))?.label || ""
  );
}

export default function GoogleRegistrationModal({
  isOpen,
  onClose,
  googleIdToken,
  googleProfile,
  onRegistered,
}) {
  const [countries, setCountries] = useState([]);
  const [regions, setRegions] = useState([]);
  const [towns, setTowns] = useState([]);
  const [countryId, setCountryId] = useState("");
  const [regionId, setRegionId] = useState("");
  const [townId, setTownId] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadCountries = useCallback(async () => {
    try {
      setGeoLoading(true);
      setCountries(await fetchCountriesList());
    } catch {
      setCountries([]);
    } finally {
      setGeoLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setError("");
    setLoading(false);
    setCountryId("");
    setRegionId("");
    setTownId("");
    setRegions([]);
    setTowns([]);
    loadCountries();
  }, [isOpen, loadCountries]);

  const handleCountryChange = async (e) => {
    const nextCountryId = e.target.value;
    setCountryId(nextCountryId);
    setRegionId("");
    setTownId("");
    setRegions([]);
    setTowns([]);

    if (!nextCountryId) return;

    try {
      setGeoLoading(true);
      setRegions(await fetchRegionsList(nextCountryId));
    } catch {
      setRegions([]);
    } finally {
      setGeoLoading(false);
    }
  };

  const handleRegionChange = async (e) => {
    const nextRegionId = e.target.value;
    setRegionId(nextRegionId);
    setTownId("");
    setTowns([]);

    if (!nextRegionId) return;

    try {
      setGeoLoading(true);
      setTowns(await fetchTownsList(nextRegionId));
    } catch {
      setTowns([]);
    } finally {
      setGeoLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!googleIdToken) {
      setError("Google токен отсутствует. Попробуйте ещё раз.");
      return;
    }

    if (!countryId || !regionId || !townId) {
      setError("Выберите страну, регион и город из списка.");
      return;
    }

    setLoading(true);
    try {
      const response = await apiFetch(buildApiUrl("/auth/google/register"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_token: googleIdToken,
          country: getSelectedLabel(countries, countryId),
          region: getSelectedLabel(regions, regionId),
          town: getSelectedLabel(towns, townId),
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const detail = data?.detail;
        throw new Error(
          typeof detail === "string"
            ? detail
            : "Не удалось завершить регистрацию через Google",
        );
      }

      onRegistered?.(data);
      onClose();
    } catch (err) {
      setError(err.message || "Ошибка регистрации");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const fieldsDisabled = loading || geoLoading;
  const inputClass = "reg-modal__input";

  return createPortal(
    <div className="reg-modal-overlay" onClick={onClose} role="presentation">
      <div
        className="reg-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="google-register-modal-title"
      >
        <header className="reg-modal__hero">
          <span className="reg-modal__badge">Fixer</span>
          <h2
            id="google-register-modal-title"
            className="reg-modal__title"
          >
            Регистрация через Google
          </h2>
          <p className="reg-modal__subtitle">
            Осталось указать географию
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

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 600 }}>
                {googleProfile?.firstName || googleProfile?.lastName
                  ? `${googleProfile?.firstName || ""} ${
                      googleProfile?.lastName || ""
                    }`.trim()
                  : "Пользователь"}
              </div>
              {googleProfile?.email && (
                <div style={{ opacity: 0.8 }}>{googleProfile.email}</div>
              )}
            </div>

            <div className="reg-modal__fields">
              <FieldRow
                label="Страна *"
                htmlFor="google-reg-country"
                hint="из справочника"
              >
                <select
                  id="google-reg-country"
                  className={`${inputClass} reg-modal__select`}
                  value={countryId}
                  onChange={handleCountryChange}
                  disabled={fieldsDisabled || countries.length === 0}
                >
                  <option value="">
                    {countries.length === 0
                      ? "Нет стран в справочнике"
                      : "Выберите страну"}
                  </option>
                  {countries.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </FieldRow>

              <FieldRow
                label="Регион *"
                htmlFor="google-reg-region"
                hint={!countryId ? "сначала страна" : ""}
              >
                <select
                  id="google-reg-region"
                  className={`${inputClass} reg-modal__select`}
                  value={regionId}
                  onChange={handleRegionChange}
                  disabled={fieldsDisabled || !countryId || regions.length === 0}
                >
                  <option value="">
                    {!countryId
                      ? "Сначала выберите страну"
                      : regions.length === 0
                        ? "Нет регионов"
                        : "Выберите регион"}
                  </option>
                  {regions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </FieldRow>

              <FieldRow
                label="Город *"
                htmlFor="google-reg-town"
                hint={!regionId ? "сначала регион" : ""}
              >
                <select
                  id="google-reg-town"
                  className={`${inputClass} reg-modal__select`}
                  value={townId}
                  onChange={(e) => setTownId(e.target.value)}
                  disabled={fieldsDisabled || !regionId || towns.length === 0}
                >
                  <option value="">
                    {!regionId
                      ? "Сначала выберите регион"
                      : towns.length === 0
                        ? "Нет городов"
                        : "Выберите город"}
                  </option>
                  {towns.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </FieldRow>
            </div>
          </div>

          <footer className="reg-modal__footer">
            <button
              type="submit"
              className="reg-modal__submit"
              disabled={loading || geoLoading}
            >
              {loading ? "Создаём аккаунт…" : "Продолжить"}
            </button>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  );
}

