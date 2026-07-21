import React, { useEffect, useState, useCallback } from "react";
import Select from "react-select";
import { createPortal } from "react-dom";
import { apiFetch, buildApiUrl } from "../../../utils/api.js";
import {
  fetchRegionsList,
  fetchTownsList,
  loadDefaultRegistrationGeography,
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
      setCountries([]);
      setRegions([]);
      setTowns([]);
      setCountryId("");
      setRegionId("");
      setTownId("");
    } finally {
      setGeoLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setError("");
    setLoading(false);
    loadGeographyDefaults();
  }, [isOpen, loadGeographyDefaults]);

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
      setRegions(await fetchRegionsList(nextCountryId));
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

  const fieldsDisabled = loading;

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
          <h2 id="google-register-modal-title" className="reg-modal__title">
            Регистрация через Google
          </h2>
          <p className="reg-modal__subtitle">Осталось указать географию</p>
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
                <Select
                  inputId="google-reg-country"
                  classNamePrefix="reg-geo"
                  options={countries}
                  value={findOption(countries, countryId)}
                  onChange={handleCountryChange}
                  isDisabled={fieldsDisabled || countries.length === 0}
                  isLoading={geoLoading && countries.length === 0}
                  isClearable={false}
                  placeholder={
                    countries.length === 0
                      ? "Нет стран в справочнике"
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
                htmlFor="google-reg-region"
                hint={!countryId ? "сначала страна" : ""}
              >
                <Select
                  inputId="google-reg-region"
                  classNamePrefix="reg-geo"
                  options={regions}
                  value={findOption(regions, regionId)}
                  onChange={handleRegionChange}
                  isDisabled={
                    fieldsDisabled || !countryId || regions.length === 0
                  }
                  isLoading={
                    geoLoading && Boolean(countryId) && regions.length === 0
                  }
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
                htmlFor="google-reg-town"
                hint={!regionId ? "сначала регион" : ""}
              >
                <Select
                  inputId="google-reg-town"
                  classNamePrefix="reg-geo"
                  options={towns}
                  value={findOption(towns, townId)}
                  onChange={(option) =>
                    setTownId(option ? String(option.value) : "")
                  }
                  isDisabled={fieldsDisabled || !regionId || towns.length === 0}
                  isLoading={
                    geoLoading && Boolean(regionId) && towns.length === 0
                  }
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
