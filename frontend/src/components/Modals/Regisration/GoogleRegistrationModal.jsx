import React, { useEffect, useState, useCallback } from "react"; // хуки React
import Select from "react-select"; // выпадающие списки страны/региона
import CreatableSelect from "react-select/creatable"; // город: список + свой ввод
import { createPortal } from "react-dom"; // рендер модалки в body
import { apiFetch, buildApiUrl, formatApiDetail } from "../../../utils/api.js"; // HTTP + URL + текст ошибки
import {
  createTownByUser,
  fetchRegionsList, // GET регионов по стране
  fetchTownsList, // GET городов по региону
  getFallbackRegistrationGeography, // локальный дефолт без API
  loadDefaultRegistrationGeography, // дефолт с API (Беларусь и т.д.)
} from "../../../utils/geographyApi.js";
import {
  normalizeTownName,
  validateTownName,
} from "../../../utils/townNameValidation.js";
import RulesDisclosure from "./RulesDisclosure.jsx";
import { uiAlert, uiWarn } from "../../UiDialog/uiDialog.js";
import "./registration_modal.css"; // общие стили reg-modal

/** Строка формы: label + control + hint. */
function FieldRow({ label, htmlFor, hint, children }) {
  return (
    <div className="reg-modal__row"> {/* сетка строки */}
      <label className="reg-modal__label" htmlFor={htmlFor}> {/* подпись к полю */}
        {label}
      </label>
      <div className="reg-modal__control">{children}</div> {/* сюда кладётся Select/input */}
      {hint ? <span className="reg-modal__hint">{hint}</span> : <span />} {/* hint или пустой слот сетки */}
    </div>
  );
}

/** Найти option по id для value у react-select. */
function findOption(options, id) {
  if (id === "" || id == null) return null; // ничего не выбрано
  return options.find((item) => String(item.value) === String(id)) || null; // option или null
}

/** Стили Select: меню выше overlay, фиксированная высота (без дёрганья). */
function buildGeoSelectStyles(invalid = false) {
  return {
    menuPortal: (base) => ({ ...base, zIndex: 4000 }), // портал меню поверх всего
    control: (base, state) => ({
      ...base, // базовые стили control
      minHeight: 34, // высота как у input
      height: 34,
      borderRadius: 8,
      borderColor: invalid
        ? state.isFocused
          ? "#dc2626"
          : "#f87171"
        : state.isFocused
          ? "#2563eb"
          : "#e2e8f0",
      backgroundColor: invalid ? "#fef2f2" : "#f8fafc",
      boxShadow: state.isFocused
        ? invalid
          ? "0 0 0 3px rgba(220, 38, 38, 0.15)"
          : "0 0 0 3px rgba(37, 99, 235, 0.12)"
        : "none",
      "&:hover": {
        borderColor: invalid
          ? "#ef4444"
          : state.isFocused
            ? "#2563eb"
            : "#cbd5e1",
      },
      fontSize: "0.8125rem",
    }),
    valueContainer: (base) => ({
      ...base,
      padding: "0 12px",
      height: 32,
      fontSize: "0.8125rem",
    }),
    indicatorsContainer: (base) => ({
      ...base,
      height: 32,
      paddingRight: 6,
    }),
    dropdownIndicator: (base) => ({ ...base, padding: "0 6px" }),
    loadingIndicator: (base) => ({ ...base, padding: "0 4px" }),
    indicatorSeparator: () => ({ display: "none" }),
    singleValue: (base) => ({
      ...base,
      margin: 0,
      maxWidth: "100%",
      fontSize: "0.8125rem",
    }),
    placeholder: (base) => ({ ...base, margin: 0, fontSize: "0.8125rem" }),
    input: (base) => ({ ...base, margin: 0, padding: 0, fontSize: "0.8125rem" }),
    option: (base) => ({ ...base, fontSize: "0.8125rem" }),
    menu: (base) => ({ ...base, zIndex: 4000 }), // список опций
  };
}

/**
 * Добор географии после Google. Submit → /auth/google/register.
 * Props: isOpen, onClose, googleIdToken, googleProfile, onRegistered.
 */
export default function GoogleRegistrationModal({
  isOpen, // показать модалку
  onClose, // закрыть
  googleIdToken, // JWT credential от Google
  googleProfile, // { email, firstName, lastName } для превью
  onRegistered, // колбэк с токенами после успеха
}) {
  const [countries, setCountries] = useState([]); // options стран { value, label }
  const [regions, setRegions] = useState([]); // options регионов
  const [towns, setTowns] = useState([]); // options городов
  const [countryId, setCountryId] = useState(""); // выбранный value страны
  const [regionId, setRegionId] = useState(""); // выбранный value региона
  const [townId, setTownId] = useState(""); // выбранный value города
  const [geoLoading, setGeoLoading] = useState(false); // грузятся списки гео
  const [loading, setLoading] = useState(false); // идёт POST register
  const [invalidFields, setInvalidFields] = useState({});

  const clearInvalid = (key) => {
    setInvalidFields((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  /** Загрузить дефолтную географию (API → fallback). */
  const loadGeographyDefaults = useCallback(async () => {
    try {
      setGeoLoading(true); // спиннер у Select
      const geo = await loadDefaultRegistrationGeography(); // страны + дефолт id
      setCountries(geo.countries); // список стран
      setRegions(geo.regions); // регионы дефолтной страны
      setTowns(geo.towns); // города дефолтного региона
      setCountryId(geo.countryId); // предвыбор страны
      setRegionId(geo.regionId); // предвыбор региона
      setTownId(geo.townId); // предвыбор города
    } catch {
      const geo = getFallbackRegistrationGeography(); // без сети
      setCountries(geo.countries);
      setRegions(geo.regions);
      setTowns(geo.towns);
      setCountryId(geo.countryId);
      setRegionId(geo.regionId);
      setTownId(geo.townId);
    } finally {
      setGeoLoading(false); // снять спиннер
    }
  }, []); // стабильная функция (нет внешних deps)

  useEffect(() => {
    if (!isOpen) return; // закрыта — ничего не грузим
    setLoading(false); // сброс флага submit
    setInvalidFields({});
    loadGeographyDefaults(); // свежие списки при открытии
  }, [isOpen, loadGeographyDefaults]);

  /** Смена страны → сброс региона/города → fetch регионов (+ автовыбор если 1). */
  const handleCountryChange = async (option) => {
    const nextCountryId = option ? String(option.value) : ""; // id или пусто
    setCountryId(nextCountryId); // запомнить страну
    clearInvalid("countryId");
    setRegionId(""); // сбросить регион
    setTownId(""); // сбросить город
    setRegions([]); // очистить список регионов
    setTowns([]); // очистить список городов
    setInvalidFields((prev) => {
      const next = { ...prev };
      delete next.regionId;
      delete next.townId;
      return next;
    });

    if (!nextCountryId) return; // очистили Select — дальше не грузим

    try {
      setGeoLoading(true);
      const nextRegions = await fetchRegionsList(nextCountryId); // регионы страны
      setRegions(nextRegions);
      if (nextRegions.length === 1) { // один регион — автовыбор
        const onlyRegionId = String(nextRegions[0].value);
        setRegionId(onlyRegionId);
        clearInvalid("regionId");
        const nextTowns = await fetchTownsList(onlyRegionId); // города этого региона
        setTowns(nextTowns);
        if (nextTowns.length === 1) { // один город — автовыбор
          setTownId(String(nextTowns[0].value));
          clearInvalid("townId");
        }
      }
    } catch {
      setRegions([]); // ошибка API — пустой список
    } finally {
      setGeoLoading(false);
    }
  };

  /** Смена региона → сброс города → fetch городов (+ автовыбор если 1). */
  const handleRegionChange = async (option) => {
    const nextRegionId = option ? String(option.value) : "";
    setRegionId(nextRegionId);
    clearInvalid("regionId");
    setTownId(""); // город больше не валиден
    setTowns([]);
    clearInvalid("townId");

    if (!nextRegionId) return;

    try {
      setGeoLoading(true);
      const nextTowns = await fetchTownsList(nextRegionId);
      setTowns(nextTowns);
      if (nextTowns.length === 1) {
        setTownId(String(nextTowns[0].value)); // автовыбор единственного города
        clearInvalid("townId");
      }
    } catch {
      setTowns([]);
    } finally {
      setGeoLoading(false);
    }
  };

  /** Создать город в выбранном регионе (если нет в списке). */
  const handleCreateTown = async (inputValue) => {
    const name = normalizeTownName(inputValue);
    const nameError = validateTownName(name);
    if (nameError) {
      await uiWarn(nameError);
      return;
    }
    if (!regionId || !/^\d+$/.test(String(regionId))) {
      await uiWarn("Сначала выберите регион из справочника");
      return;
    }

    setGeoLoading(true);
    try {
      const created = await createTownByUser(regionId, name);
      setTowns((prev) => {
        if (prev.some((t) => String(t.value) === String(created.value))) {
          return prev;
        }
        return [...prev, created];
      });
      setTownId(String(created.value));
      clearInvalid("townId");
    } catch (err) {
      await uiAlert(err.message || "Не удалось добавить город");
    } finally {
      setGeoLoading(false);
    }
  };

  /** Submit: id_token + town_id → POST /auth/google/register. */
  const handleSubmit = async (e) => {
    e.preventDefault(); // без reload страницы

    if (!googleIdToken) { // без токена бэкенд не примет
      await uiWarn("Google токен отсутствует. Попробуйте ещё раз.");
      return;
    }

    const nextInvalid = {};
    if (!countryId) nextInvalid.countryId = true;
    if (!regionId) nextInvalid.regionId = true;
    if (!townId) nextInvalid.townId = true;
    setInvalidFields(nextInvalid);

    if (nextInvalid.countryId || nextInvalid.regionId || nextInvalid.townId) {
      await uiWarn("Выберите страну, регион и город (из списка или введите свой).");
      return;
    }

    setInvalidFields({});
    setLoading(true); // disabled кнопка/поля
    try {
      const response = await apiFetch(buildApiUrl("/auth/google/register"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_token: googleIdToken, // проверка подписи на бэке
          town_id: Number(townId),
        }),
      });

      const data = await response.json().catch(() => ({})); // тело или {}

      if (!response.ok) { // 4xx/5xx
        throw new Error(
          formatApiDetail(
            data?.detail, // FastAPI detail
            "Не удалось завершить регистрацию через Google", // fallback текст
          ),
        );
      }

      onRegistered?.(data); // сохранить сессию в LoginModal
      onClose(); // закрыть geo-модалку
    } catch (err) {
      await uiAlert(err.message || "Ошибка регистрации");
    } finally {
      setLoading(false); // снять disabled
    }
  };

  if (!isOpen) return null; // ничего не монтируем в DOM

  const fieldsDisabled = loading; // на время POST блокируем Select

  return createPortal( // портал → document.body
    <div className="reg-modal-overlay" onClick={onClose} role="presentation"> {/* клик по фону = закрыть */}
      <div
        className="reg-modal"
        onClick={(e) => e.stopPropagation()} // клик внутри не закрывает
        role="dialog"
        aria-modal="true"
        aria-labelledby="google-register-modal-title"
      >
        <header className="reg-modal__hero">
          <span className="reg-modal__badge">Fixer</span> {/* бренд */}
          <h2 id="google-register-modal-title" className="reg-modal__title">
            Регистрация через Google
          </h2>
          <p className="reg-modal__subtitle">Осталось указать географию</p>
          <button
            type="button"
            className="reg-modal__close"
            onClick={onClose} // крестик = закрыть
            aria-label="Закрыть"
            disabled={loading} // нельзя закрыть во время запроса
          >
            ×
          </button>
        </header>

        <form className="reg-modal__form" onSubmit={handleSubmit} noValidate> {/* валидацию делаем сами */}
          <div className="reg-modal__body">
            <div style={{ marginBottom: 12 }}> {/* превью Google-профиля */}
              <div style={{ fontWeight: 600 }}>
                {googleProfile?.firstName || googleProfile?.lastName
                  ? `${googleProfile?.firstName || ""} ${
                      googleProfile?.lastName || ""
                    }`.trim() // имя + фамилия
                  : "Пользователь"} {/* если в JWT нет имени */}
              </div>
              {googleProfile?.email && ( // email под именем
                <div style={{ opacity: 0.8 }}>{googleProfile.email}</div>
              )}
            </div>

            <div className="reg-modal__fields">
              <FieldRow
                label="Страна *"
                htmlFor="google-reg-country"
              >
                <Select
                  inputId="google-reg-country"
                  classNamePrefix="reg-geo"
                  options={countries} // список стран
                  value={findOption(countries, countryId)} // controlled value
                  onChange={handleCountryChange} // каскад на регионы
                  isDisabled={fieldsDisabled || countries.length === 0} // нет данных / submit
                  isLoading={geoLoading && countries.length === 0} // первая загрузка
                  isClearable={false} // нельзя сбросить в пусто
                  placeholder={
                    countries.length === 0
                      ? "Нет стран в справочнике"
                      : "Выберите страну"
                  }
                  noOptionsMessage={() => "Нет вариантов"}
                  menuPortalTarget={document.body} // меню не режется overflow модалки
                  menuPosition="fixed"
                  styles={buildGeoSelectStyles(Boolean(invalidFields.countryId))}
                />
              </FieldRow>

              <FieldRow
                label="Регион *"
                htmlFor="google-reg-region"
                hint={!countryId ? "сначала страна" : "\u00a0"} // подсказка каскада
              >
                <Select
                  inputId="google-reg-region"
                  classNamePrefix="reg-geo"
                  options={regions}
                  value={findOption(regions, regionId)}
                  onChange={handleRegionChange}
                  isDisabled={
                    fieldsDisabled ||
                    !countryId ||
                    geoLoading ||
                    regions.length === 0 // без страны нельзя
                  }
                  isLoading={false}
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
                  styles={buildGeoSelectStyles(Boolean(invalidFields.regionId))}
                />
              </FieldRow>

              <FieldRow
                label="Город *"
                htmlFor="google-reg-town"
                hint={!regionId ? "сначала регион" : "см. правила"}
              >
                <CreatableSelect
                  inputId="google-reg-town"
                  classNamePrefix="reg-geo"
                  options={towns}
                  value={findOption(towns, townId)}
                  onChange={(option) => {
                    setTownId(option ? String(option.value) : "");
                    clearInvalid("townId");
                  }}
                  onCreateOption={handleCreateTown}
                  isValidNewOption={(inputValue) =>
                    Boolean(regionId) && Boolean(normalizeTownName(inputValue))
                  }
                  formatCreateLabel={(inputValue) =>
                    `Добавить город «${normalizeTownName(inputValue)}»`
                  }
                  isDisabled={fieldsDisabled || !regionId || geoLoading}
                  isLoading={false}
                  isClearable={false}
                  placeholder={
                    !regionId
                      ? "Сначала выберите регион"
                      : "Выберите или введите город"
                  }
                  noOptionsMessage={({ inputValue }) =>
                    inputValue
                      ? "Нет совпадений — проверьте правила названия"
                      : "Нет городов — можно ввести свой"
                  }
                  menuPortalTarget={document.body}
                  menuPosition="fixed"
                  styles={buildGeoSelectStyles(Boolean(invalidFields.townId))}
                  aria-describedby="google-reg-town-rules"
                />
              </FieldRow>

              <RulesDisclosure
                id="google-reg-town-rules"
                title="Правила названия города"
              >
                <ul>
                  <li>название начинается с заглавной буквы (например: Минск);</li>
                  <li>только русский язык (кириллица);</li>
                  <li>пишите название правильно, без опечаток;</li>
                  <li>
                    если города нет в списке — введите название и выберите
                    «Добавить город».
                  </li>
                </ul>
              </RulesDisclosure>
            </div>
          </div>

          <footer className="reg-modal__footer">
            <button
              type="submit"
              className="reg-modal__submit"
              disabled={loading || geoLoading} // не слать, пока грузится гео
            >
              {loading ? "Создаём аккаунт…" : "Продолжить"} {/* текст по состоянию */}
            </button>
          </footer>
        </form>
      </div>
    </div>,
    document.body, // корень портала
  );
}
