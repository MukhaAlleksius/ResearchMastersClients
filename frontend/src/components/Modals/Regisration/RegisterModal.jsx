import React, { useState, useEffect, useCallback } from "react"; // хуки React
import Select from "react-select"; // Select страны/региона
import CreatableSelect from "react-select/creatable"; // город: список + свой ввод
import { API, apiFetch, formatApiDetail } from "../../../utils/api.js"; // baseURL + fetch + detail
import { Link } from "react-router-dom"; // ссылки на /legal/*
import { createPortal } from "react-dom"; // модалка в body
import {
  canCreateTownInRegion,
  createTownByUser,
  fetchRegionsList, // регионы по countryId
  fetchTownsList, // города по regionId
  getFallbackRegistrationGeography, // дефолт без API
  isCityAsRegion,
  loadDefaultRegistrationGeography, // дефолт с API
} from "../../../utils/geographyApi";
import {
  normalizeTownName,
  validateTownName,
} from "../../../utils/townNameValidation.js";
import "./registration_modal.css"; // стили формы
import PasswordField from "./PasswordField.jsx"; // пароль + глаз
import RulesDisclosure from "./RulesDisclosure.jsx";

import { uiAlert, uiWarn } from "../../UiDialog/uiDialog.js"; // всплывающие предупреждения / успех

/** Строка формы: label + control + hint. */
function FieldRow({ label, htmlFor, hint, children }) {
  return (
    <div className="reg-modal__row">
      {" "}
      {/* одна строка сетки */}
      <label className="reg-modal__label" htmlFor={htmlFor}>
        {" "}
        {/* связка с inputId */}
        {label}
      </label>
      <div className="reg-modal__control">{children}</div>{" "}
      {/* поле ввода / Select */}
      {hint ? <span className="reg-modal__hint">{hint}</span> : <span />}{" "}
      {/* подсказка или пустой слот */}
    </div>
  );
}

/** Найти option по id для controlled Select. */
function findOption(options, id) {
  if (id === "" || id == null) return null; // пустой выбор
  return options.find((item) => String(item.value) === String(id)) || null; // option или null
}

/** Стили react-select: меню поверх overlay, фиксированная высота (без дёрганья). */
function buildGeoSelectStyles(invalid = false) {
  return {
    menuPortal: (base) => ({ ...base, zIndex: 4000 }), // портал меню
    control: (base, state) => ({
      ...base,
      minHeight: 34,
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
    menu: (base) => ({ ...base, zIndex: 4000 }),
  };
}

export default function RegisterModal({ isOpen, onClose }) {
  const [firstName, setFirstName] = useState(""); // имя
  const [lastName, setLastName] = useState(""); // фамилия
  const [email, setEmail] = useState(""); // логин
  const [password, setPassword] = useState(""); // пароль (≥8, буква + цифра)
  const [agreeTerms, setAgreeTerms] = useState(false); // согласие с офертой
  const [loading, setLoading] = useState(false); // идёт POST /register
  const [invalidFields, setInvalidFields] = useState({}); // подсветка пустых полей

  const [countries, setCountries] = useState([]); // options стран
  const [regions, setRegions] = useState([]); // options регионов
  const [towns, setTowns] = useState([]); // options городов
  const [countryId, setCountryId] = useState(""); // value страны
  const [regionId, setRegionId] = useState(""); // value региона
  const [townId, setTownId] = useState(""); // value города
  const [geoLoading, setGeoLoading] = useState(false); // загрузка справочников

  /** Подтянуть дефолтную географию при открытии. */
  const loadGeographyDefaults = useCallback(async () => {
    try {
      setGeoLoading(true); // спиннер Select
      const geo = await loadDefaultRegistrationGeography(); // API
      setCountries(geo.countries);
      setRegions(geo.regions);
      setTowns(geo.towns);
      setCountryId(geo.countryId); // предвыбор
      setRegionId(geo.regionId);
      setTownId(geo.townId);
    } catch {
      const geo = getFallbackRegistrationGeography(); // офлайн-заглушка
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
      // только когда модалка открыта
      setInvalidFields({});
      loadGeographyDefaults();
    }
  }, [isOpen, loadGeographyDefaults]);

  if (!isOpen) return null; // не рендерить portal

  const clearInvalid = (key) => {
    setInvalidFields((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const fieldClass = (key) =>
    invalidFields[key]
      ? "reg-modal__input reg-modal__input--invalid"
      : "reg-modal__input";

  /** Сброс полей после успешной регистрации. */
  const resetForm = () => {
    setFirstName("");
    setLastName("");
    setCountryId(""); // сброс гео-выбора
    setRegionId("");
    setTownId("");
    setRegions([]); // списки тоже чистим
    setTowns([]);
    setEmail("");
    setPassword("");
    setAgreeTerms(false);
    setInvalidFields({});
  };

  /** Страна → сброс региона/города → fetch регионов (+ авто 1). */
  const handleCountryChange = async (option) => {
    const nextCountryId = option ? String(option.value) : "";
    setCountryId(nextCountryId);
    clearInvalid("countryId");
    setRegionId(""); // каскадный сброс
    setTownId("");
    setRegions([]);
    setTowns([]);
    setInvalidFields((prev) => {
      const next = { ...prev };
      delete next.regionId;
      delete next.townId;
      return next;
    });

    if (!nextCountryId) return; // очистили — стоп

    try {
      setGeoLoading(true);
      const nextRegions = await fetchRegionsList(nextCountryId);
      setRegions(nextRegions);
      if (nextRegions.length === 1) {
        // единственный регион
        const onlyRegionId = String(nextRegions[0].value);
        setRegionId(onlyRegionId);
        clearInvalid("regionId");
        const nextTowns = await fetchTownsList(onlyRegionId);
        setTowns(nextTowns);
        if (nextTowns.length === 1) {
          // единственный город
          setTownId(String(nextTowns[0].value));
          clearInvalid("townId");
        }
      }
    } catch {
      setRegions([]);
    } finally {
      setGeoLoading(false);
    }
  };

  /** Регион → сброс города → fetch городов (+ авто 1). */
  const handleRegionChange = async (option) => {
    const nextRegionId = option ? String(option.value) : "";
    setRegionId(nextRegionId);
    clearInvalid("regionId");
    setTownId("");
    setTowns([]);
    clearInvalid("townId");

    if (!nextRegionId) return;

    try {
      setGeoLoading(true);
      const nextTowns = await fetchTownsList(nextRegionId);
      setTowns(nextTowns);
      if (nextTowns.length === 1) {
        setTownId(String(nextTowns[0].value));
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
    const regionOption = findOption(regions, regionId);
    if (!canCreateTownInRegion(regionOption?.label)) {
      await uiWarn(
        "Для выбранного региона город задаётся только из справочника",
      );
      return;
    }
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

  /** Валидация → POST /register → reset + alert «войдите». */
  const handleSubmit = async (e) => {
    e.preventDefault(); // не перезагружать страницу

    const nextInvalid = {};
    if (!firstName.trim()) nextInvalid.firstName = true;
    if (!lastName.trim()) nextInvalid.lastName = true;
    if (!countryId) nextInvalid.countryId = true;
    if (!regionId) nextInvalid.regionId = true;
    if (!townId) nextInvalid.townId = true;
    if (!email.trim()) nextInvalid.email = true;
    if (!password) nextInvalid.password = true;
    if (!agreeTerms) nextInvalid.agreeTerms = true;

    setInvalidFields(nextInvalid);

    const missingGeo =
      nextInvalid.countryId || nextInvalid.regionId || nextInvalid.townId;
    const missingOther =
      nextInvalid.firstName || nextInvalid.lastName || nextInvalid.email;
    const missingPassword = nextInvalid.password;

    if (missingPassword || missingGeo || missingOther) {
      if (missingPassword && !missingGeo && !missingOther) {
        await uiWarn("Заполните поле «Пароль»");
      } else if (missingGeo && !missingOther && !missingPassword) {
        await uiWarn(
          "Выберите страну, регион и город. Город можно выбрать из списка или ввести свой.",
        );
      } else if (missingGeo) {
        await uiWarn(
          "Заполните все обязательные поля. Город можно выбрать из списка или ввести свой.",
        );
      } else {
        await uiWarn("Заполните все обязательные поля.");
      }
      return;
    }

    if (nextInvalid.agreeTerms) {
      // чекбокс обязателен
      await uiWarn(
        "Подтвердите согласие с условиями и политикой конфиденциальности.",
      );
      return;
    }

    if (!email.includes("@") || email.trim().length < 5) {
      // грубая проверка email
      setInvalidFields({ email: true });
      await uiWarn("Укажите корректный email, например name@example.com");
      return;
    }

    if (password.length < 8 || password.length > 128) {
      setInvalidFields({ password: true });
      await uiWarn("Пароль должен содержать от 8 до 128 символов");
      return;
    }

    const hasLetter = /\p{L}/u.test(password);
    const hasDigit = /\d/.test(password);
    if (!hasLetter || !hasDigit) {
      setInvalidFields({ password: true });
      await uiWarn("Пароль должен содержать и буквы, и цифры");
      return;
    }

    setInvalidFields({});
    setLoading(true); // disabled полей

    try {
      const response = await apiFetch(`${API.baseURL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName.trim(), // схема Register на бэке
          last_name: lastName.trim(),
          town_id: Number(townId),
          email: email.trim(),
          password: password, // уйдёт в hash на сервере
        }),
      });

      const data = await response.json().catch(() => ({})); // JSON или {}

      if (!response.ok) {
        // email занят и т.п.
        throw new Error(
          formatApiDetail(data.detail, "Не удалось зарегистрироваться"),
        );
      }

      resetForm(); // очистить форму
      onClose(); // закрыть модалку
      await uiAlert("Регистрация успешна! Теперь войдите в аккаунт."); // без авто-логина
    } catch (err) {
      await uiAlert(err.message || "Ошибка регистрации");
    } finally {
      setLoading(false);
    }
  };

  const fieldsDisabled = loading; // блокировка на время запроса

  return createPortal(
    <div className="reg-modal-overlay" onClick={onClose} role="presentation">
      {" "}
      {/* фон = закрыть */}
      <div
        className="reg-modal"
        onClick={(e) => e.stopPropagation()} // клик по карточке не закрывает
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
            disabled={loading} // во время регистрации крестик off
          >
            ×
          </button>
        </header>

        <form
          className="reg-modal__form"
          onSubmit={handleSubmit}
          noValidate
          autoComplete="off"
        >
          <div className="reg-modal__body">
            {/* Ловушка для менеджера паролей Firefox/Chrome — не трогать */}
            <div className="reg-modal__autofill-trap" aria-hidden="true">
              <input
                type="text"
                tabIndex={-1}
                autoComplete="username"
                defaultValue=""
                readOnly
              />
              <input
                type="password"
                tabIndex={-1}
                autoComplete="current-password"
                defaultValue=""
                readOnly
              />
            </div>
            <div className="reg-modal__fields">
              <FieldRow label="Имя *" htmlFor="reg-first-name">
                <input
                  id="reg-first-name"
                  type="text"
                  className={fieldClass("firstName")}
                  value={firstName} // controlled
                  onChange={(e) => {
                    setFirstName(e.target.value);
                    clearInvalid("firstName");
                  }}
                  autoComplete="given-name"
                  disabled={fieldsDisabled}
                  placeholder="Иван"
                  aria-invalid={Boolean(invalidFields.firstName)}
                />
              </FieldRow>

              <FieldRow label="Фамилия *" htmlFor="reg-last-name">
                <input
                  id="reg-last-name"
                  type="text"
                  className={fieldClass("lastName")}
                  value={lastName}
                  onChange={(e) => {
                    setLastName(e.target.value);
                    clearInvalid("lastName");
                  }}
                  autoComplete="family-name"
                  disabled={fieldsDisabled}
                  placeholder="Иванов"
                  aria-invalid={Boolean(invalidFields.lastName)}
                />
              </FieldRow>

              <FieldRow
                label="Страна *"
                htmlFor="reg-country"
              >
                <Select
                  inputId="reg-country"
                  classNamePrefix="reg-geo"
                  options={countries}
                  value={findOption(countries, countryId)}
                  onChange={handleCountryChange} // каскад регионов
                  isDisabled={fieldsDisabled || countries.length === 0}
                  isLoading={geoLoading && countries.length === 0}
                  isClearable={false}
                  placeholder={
                    countries.length === 0
                      ? geoLoading
                        ? "Загрузка…" // ещё грузим
                        : "Нет стран в справочнике" // API пустой
                      : "Выберите страну"
                  }
                  noOptionsMessage={() => "Нет вариантов"}
                  menuPortalTarget={document.body} // меню вне overflow
                  menuPosition="fixed"
                  styles={buildGeoSelectStyles(Boolean(invalidFields.countryId))}
                  aria-invalid={Boolean(invalidFields.countryId)}
                />
              </FieldRow>

              <FieldRow
                label="Регион *"
                htmlFor="reg-region"
                hint={!countryId ? "сначала страна" : "\u00a0"}
              >
                <Select
                  inputId="reg-region"
                  classNamePrefix="reg-geo"
                  options={regions}
                  value={findOption(regions, regionId)}
                  onChange={handleRegionChange}
                  isDisabled={
                    fieldsDisabled || !countryId || geoLoading || regions.length === 0
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
                  aria-invalid={Boolean(invalidFields.regionId)}
                />
              </FieldRow>

              <FieldRow
                label="Город *"
                htmlFor="reg-town"
                hint={
                  !regionId
                    ? "сначала регион"
                    : isCityAsRegion(findOption(regions, regionId)?.label)
                      ? "только из справочника"
                      : "см. правила"
                }
              >
                {isCityAsRegion(findOption(regions, regionId)?.label) ? (
                  <Select
                    inputId="reg-town"
                    classNamePrefix="reg-geo"
                    options={towns}
                    value={findOption(towns, townId)}
                    onChange={(option) => {
                      setTownId(option ? String(option.value) : "");
                      clearInvalid("townId");
                    }}
                    isDisabled={fieldsDisabled || !regionId || geoLoading}
                    isClearable={false}
                    placeholder={
                      !regionId
                        ? "Сначала выберите регион"
                        : "Выберите город"
                    }
                    noOptionsMessage={() => "Нет городов в справочнике"}
                    menuPortalTarget={document.body}
                    menuPosition="fixed"
                    styles={buildGeoSelectStyles(Boolean(invalidFields.townId))}
                    aria-invalid={Boolean(invalidFields.townId)}
                  />
                ) : (
                  <CreatableSelect
                    inputId="reg-town"
                    classNamePrefix="reg-geo"
                    options={towns}
                    value={findOption(towns, townId)}
                    onChange={(option) => {
                      setTownId(option ? String(option.value) : "");
                      clearInvalid("townId");
                    }}
                    onCreateOption={handleCreateTown}
                    isValidNewOption={(inputValue) =>
                      Boolean(regionId) &&
                      canCreateTownInRegion(
                        findOption(regions, regionId)?.label,
                      ) &&
                      Boolean(normalizeTownName(inputValue))
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
                    aria-describedby="reg-town-rules"
                    aria-invalid={Boolean(invalidFields.townId)}
                  />
                )}
              </FieldRow>

              <RulesDisclosure id="reg-town-rules" title="Правила названия города">
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

              <FieldRow label="Email *" htmlFor="reg-email" hint="для входа">
                <input
                  id="reg-email"
                  name="fixer_reg_contact"
                  type="text"
                  inputMode="email"
                  className={fieldClass("email")}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearInvalid("email");
                  }}
                  autoComplete="new-password"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-bwignore="true"
                  data-form-type="other"
                  disabled={fieldsDisabled}
                  placeholder="name@example.com"
                  aria-invalid={Boolean(invalidFields.email)}
                />
              </FieldRow>

              <FieldRow
                label="Пароль *"
                htmlFor="reg-password"
                hint="см. правила"
              >
                <PasswordField
                  id="reg-password"
                  name="fixer_reg_secret"
                  className={fieldClass("password")}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    clearInvalid("password");
                  }}
                  autoComplete="new-password"
                  disabled={fieldsDisabled}
                  maxLength={128}
                  aria-describedby="reg-password-rules"
                />
              </FieldRow>

              <RulesDisclosure
                id="reg-password-rules"
                title="Требования к паролю"
              >
                <ul>
                  <li>Пароль должен содержать от 8 до 128 символов.</li>
                  <li>Пароль должен содержать и буквы, и цифры.</li>
                  <li>
                    Можно использовать латинские и кириллические буквы, цифры и
                    специальные символы.
                  </li>
                </ul>
              </RulesDisclosure>
            </div>

            <label
              className={
                invalidFields.agreeTerms
                  ? "reg-modal__terms reg-modal__terms--invalid"
                  : "reg-modal__terms"
              }
            >
              {" "}
              {/* чекбокс оферты */}
              <input
                type="checkbox"
                checked={agreeTerms}
                onChange={(e) => {
                  setAgreeTerms(e.target.checked);
                  clearInvalid("agreeTerms");
                }}
                disabled={loading}
              />
              <span>
                Согласен с{" "}
                <Link
                  to="/legal/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {" "}
                  {/* новая вкладка */}
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
              disabled={loading || geoLoading} // пока грузится гео — не слать
            >
              {loading ? "Регистрируем…" : "Зарегистрироваться"}
            </button>
          </footer>
        </form>
      </div>
    </div>,
    document.body, // корень портала
  );
}
