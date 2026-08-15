import React, { useState, useEffect, useCallback } from "react";
import { API, apiFetch, buildApiUrl, formatApiDetail } from "../../../../utils/api.js";
import CreatableSelect from "react-select/creatable";
import Select from "react-select";
import EstimateWorks from "../../Profile/Services/CommonComponent/EstimateWorksMaterials/EstimateWorks";
import DeadlineField, { isValidDeadline } from "../../Common/DeadlineField.jsx";
import "./add_order_for_all_executors.css";
import "./order.css";

import { uiAlert } from "../../../UiDialog/uiDialog.js";
import {
  budgetTypeHint,
  BUDGET_TYPE_OPTIONS,
  BUDGET_TYPE_PLACEHOLDER,
  isFixedBudgetType,
} from "../../../../utils/budgetTypes.js";

export default function AddOrderForAllExecutors({
  showAuthBanner = false,
  openModal,
}) {
  const [categoryWork, setCategoryWork] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const currency = "BYN";
  const [budgetType, setBudgetType] = useState("");
  const [location, setLocation] = useState("");
  const [deadline, setDeadline] = useState("Как можно скорее");
  const [insuranceRequired, setInsuranceRequired] = useState(false);

  const [categoryWorkMaster, setCategoryWorkMaster] = useState(null);
  const [categoriesWorks, setCategoriesWorks] = useState([]);

  const categoriesWorksOptions = categoriesWorks;

  const [geoCountry, setGeoCountry] = useState(null);
  const [geoRegion, setGeoRegion] = useState(null);
  const [geoTown, setGeoTown] = useState(null);

  const [countries, setCountries] = useState([]);
  const [regions, setRegions] = useState([]);
  const [towns, setTowns] = useState([]);

  const countryOptions = countries;
  const areaOptions = regions;
  const townOptions = towns;

  const [orderId, setOrderId] = useState(null);

  // Загрузка стран
  const fetchCountries = useCallback(async () => {
    try {
      const response_countries = await apiFetch(buildApiUrl("/countries"));
      if (!response_countries.ok) {
        throw new Error("Не получили данных с сервера");
      }
      const countries_data = await response_countries.json();
      const formattedCountries = countries_data.map((country) => ({
        value: country.country_id || country.id,
        label: country.name_country || country.name,
      }));
      setCountries(formattedCountries);
    } catch (error) {
      console.log("Ошибка: ", error);
      setCountries([]);
    }
  }, []);

  // Загрузка регионов
  const fetchRegionsCountry = useCallback(async (countryId) => {
    try {
      const response_regions = await apiFetch(
        buildApiUrl(`/countries/${countryId}/regions`),
      );
      if (!response_regions.ok) {
        throw new Error("Не получили данных с сервера");
      }
      const regions_data = await response_regions.json();
      const formattedRegions = regions_data.map((region) => ({
        value: region.region_id || region.id,
        label: region.name_region || region.name,
      }));
      setRegions(formattedRegions);
    } catch (error) {
      console.log("Ошибка: ", error);
      setRegions([]);
    }
  }, []);

  // Загрузка городов
  const fetchTownsRegion = useCallback(async (regionId) => {
    if (!regionId) {
      setTowns([]);
      return;
    }
    try {
      const response_towns = await apiFetch(
        buildApiUrl(`/regions/${regionId}/towns`),
      );
      if (!response_towns.ok) throw new Error("Не получили данных с сервера");
      const towns_data = await response_towns.json();
      const formattedTowns = towns_data.map((town) => ({
        value: town.town_id || town.id || town,
        label: town.name_town || town.name || town,
      }));
      setTowns(formattedTowns);
    } catch (error) {
      setTowns([]);
      console.log("Ошибка: ", error);
    }
  }, []);

  // Обработчик выбора страны
  const handleSelectCountriesAndAddRegions = useCallback(
    async (selectedOption) => {
      setGeoCountry(selectedOption);
      setGeoRegion(null);
      setGeoTown(null);
      setRegions([]);
      setTowns([]);
      if (selectedOption) {
        await fetchRegionsCountry(selectedOption.value);
      }
    },
    [fetchRegionsCountry],
  );

  // Обработчик выбора региона
  const handleSelectRegionsAndAddTowns = useCallback(
    async (selectedOption) => {
      setGeoRegion(selectedOption);
      setGeoTown(null);
      setTowns([]);
      if (selectedOption) {
        await fetchTownsRegion(selectedOption.value);
      }
    },
    [fetchTownsRegion],
  );

  // Загрузка категорий работ
  const fetchCategoriesWorks = useCallback(async () => {
    try {
      const response_categories_works = await apiFetch(
        buildApiUrl("/categories_works"),
      );
      if (!response_categories_works.ok) {
        throw new Error("Не получили данных с сервера");
      }
      const categories_works_data = await response_categories_works.json();
      const formatted_categories_works = categories_works_data.map(
        (category_work) => ({
          value: category_work.category_work_id || category_work.id,
          label: category_work.name || category_work.name_category_work,
        }),
      );
      setCategoriesWorks(formatted_categories_works);
    } catch (error) {
      console.log("Ошибка: ", error);
      setCategoriesWorks([]);
    }
  }, []);

  const handleSelectCategoryWorkMaster = (selectedCategoryWork) => {
    setCategoryWorkMaster(selectedCategoryWork);
  };

  // Отправка заказа на сервер
  const handleAddOrderUser = async (e) => {
    e.preventDefault();

    // ✅ Валидация
    if (!categoryWorkMaster) {
      await uiAlert("Выберите категорию услуги");
      return;
    }
    if (!title.trim()) {
      await uiAlert("Введите заголовок заказа");
      return;
    }
    if (!description.trim()) {
      await uiAlert("Опишите задачу");
      return;
    }
    if (!location.trim()) {
      await uiAlert("Укажите локацию");
      return;
    }
    if (!geoTown) {
      await uiAlert("Укажите населённый пункт");
      return;
    }
    if (!geoRegion) {
      await uiAlert("Укажите регион");
      return;
    }
    if (!geoCountry) {
      await uiAlert("Укажите страну");
      return;
    }
    if (!isValidDeadline(deadline)) {
      await uiAlert("Выберите точную дату выполнения");
      return;
    }
    if (!budgetType) {
      await uiAlert("Выберите тип бюджета");
      return;
    }
    if (isFixedBudgetType(budgetType)) {
      const amount = parseFloat(budget);
      if (!budget || Number.isNaN(amount) || amount <= 0) {
        await uiAlert("Укажите сумму для договорной цены");
        return;
      }
    }

    const orderUserData = {
      title: title,
      description: description,
      customer_id: localStorage.getItem("user_id"),
      category_work_id: categoryWorkMaster.value,
      category_work: categoryWorkMaster.label,
      budget: isFixedBudgetType(budgetType) ? parseFloat(budget) || 0 : 0,
      currency: currency,
      budget_type: budgetType,
      urgency_level: "",
      country: geoCountry.label,
      country_id: geoCountry.value,
      region: geoRegion.label,
      region_id: geoRegion.value,
      town: geoTown.label,
      town_id: geoTown.value,
      location: location,
      deadline: deadline,
      insurance_required: insuranceRequired,
    };

    try {
      // ✅ Создание заказа
      const response = await apiFetch(buildApiUrl("/add_order_user"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderUserData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Ошибка добавления заказа:", errorData);
        await uiAlert(
          `Ошибка: ${formatApiDetail(errorData.detail, "Не удалось разместить заказ")}`,
        );
        return;
      }

      const data = await response.json();
      console.log("Заказ успешно создан:", data);

      // ✅ Создание статуса заказа
      const statusOrderCustomer = {
        order_id: data.id,
        customer_id: localStorage.getItem("user_id"),
        status: "В поиске исполнителя",
      };

      const response_status_order_customer = await apiFetch(
        buildApiUrl("/add_status_order_customer"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(statusOrderCustomer),
        },
      );

      if (!response_status_order_customer.ok) {
        console.error("Ошибка создания статуса заказа");
      }

      // ✅ Сохранение в localStorage
      localStorage.setItem("recent_order_id", data.id.toString());
      localStorage.setItem(
        "recent_category_work_id",
        data.category_work_id?.toString() || categoryWorkMaster.value,
      );

      // ✅ Обновление списка заказов (важно для вкладок статусов!)
      // if (typeof fetchOrdersCustomer === "function") {
      //   await fetchOrdersCustomer(); // Перезагружаем список заказов
      // }

      console.log("Order_id:", data.id);

      // ✅ Авто-переход на детали заказа
      setOrderId(data.id);

      resetForm();
      await uiAlert("✅ Заказ размещён! Переходим к смете...");
    } catch (error) {
      console.error("Ошибка: ", error);
      await uiAlert("❌ Произошла ошибка при размещении заказа");
    }
  };

  // Функция очистки формы
  const resetForm = () => {
    setCategoryWorkMaster(null);
    setTitle("");
    setDescription("");
    setBudget("");
    setBudgetType("");
    setGeoCountry(null);
    setGeoRegion(null);
    setGeoTown(null);
    setLocation("");
    setDeadline("Как можно скорее");
    setInsuranceRequired(false);
    setRegions([]);
    setTowns([]);
  };

  const showBudgetAmount = isFixedBudgetType(budgetType);

  const handleBudgetTypeChange = (value) => {
    setBudgetType(value);
    if (!isFixedBudgetType(value)) {
      setBudget("");
    }
  };

  // Блокировка клавиш кроме цифр и точки
  const handleKeyDown = (e) => {
    const allowedKeys = [
      "Backspace",
      "Tab",
      "ArrowLeft",
      "ArrowRight",
      "Delete",
      "Home",
      "End",
      "Escape",
    ];

    if (allowedKeys.includes(e.key)) return;

    if (e.key >= "0" && e.key <= "9") return;

    if (
      (e.key === "." || e.key === ",") &&
      !e.currentTarget.value.includes(".")
    ) {
      e.target.value = e.target.value + ".";
      e.preventDefault();
      return;
    }

    e.preventDefault();
  };

  // Инициализация данных
  useEffect(() => {
    const loadData = async () => {
      await Promise.all([fetchCategoriesWorks(), fetchCountries()]);
    };
    loadData();
  }, [fetchCategoriesWorks, fetchCountries]);

  return (
    <div id="order" className="page order-page">
      <div className="order-page__inner">
        {showAuthBanner && (
          <div className="add-order-auth-banner" role="status">
            <div className="add-order-auth-banner__icon" aria-hidden="true">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
            </div>
            <div className="add-order-auth-banner__content">
              <p className="add-order-auth-banner__title">
                Нужен вход в личный кабинет
              </p>
              <p className="add-order-auth-banner__text">
                Размещать заказ можно только после входа в личный кабинет.
              </p>
            </div>
            <button
              type="button"
              className="add-order-auth-banner__btn"
              onClick={() => openModal?.("loginModal")}
            >
              Войти
            </button>
          </div>
        )}
        <header className="order-page__hero">
          <span className="order-page__badge">Новый заказ</span>
          <h1 className="order-page__title">Разместить заказ</h1>
          <p className="order-page__subtitle">
            Опишите задачу — исполнители увидят её в каталоге и смогут откликнуться
          </p>
        </header>
        <div className="order-form-wrapper">
        <form className="form" onSubmit={handleAddOrderUser}>
          {/* Категория */}
          <div>
            <label htmlFor="category" className="label">
              Категория услуги <span className="required">*</span>
            </label>
            <CreatableSelect
              options={categoriesWorksOptions}
              value={categoryWorkMaster}
              onChange={handleSelectCategoryWorkMaster}
              isClearable
              placeholder="Выберите категорию работ"
              styles={customStyles}
            />
          </div>

          {/* Заголовок */}
          <div>
            <label htmlFor="title" className="label">
              Заголовок заказа <span className="required">*</span>
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Введите заголовок"
              maxLength={200}
              className="input"
            />
          </div>

          {/* Описание */}
          <div>
            <label htmlFor="description" className="label">
              Описание задачи <span className="required">*</span>
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Опишите подробно, что нужно сделать..."
              rows={5}
              maxLength={2000}
              className="textarea"
            />
          </div>

          {/* Тип бюджета */}
          <div>
            <label htmlFor="budgetType" className="label">
              Тип бюджета <span className="required">*</span>
            </label>
            <select
              id="budgetType"
              value={budgetType}
              onChange={(e) => handleBudgetTypeChange(e.target.value)}
              className="select"
              required
            >
              <option value="" disabled hidden>
                {BUDGET_TYPE_PLACEHOLDER}
              </option>
              {BUDGET_TYPE_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {showBudgetAmount ? (
            <div className="grid-2cols">
              <div>
                <label htmlFor="budget" className="label">
                  Сумма <span className="required">*</span>
                </label>
                <input
                  type="number"
                  id="budget"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="input"
                />
              </div>
              <div>
                <span className="label">Валюта</span>
                <p className="input input--readonly">BYN</p>
              </div>
            </div>
          ) : budgetType ? (
            <p className="budget-type-hint">{budgetTypeHint(budgetType)}</p>
          ) : null}

          {/* Геолокация */}
          <div className="grid-3cols order-geo-fields">
            <div className="order-geo-field">
              <label className="label" htmlFor="order-geo-country">
                Страна <span className="required">*</span>
              </label>
              <Select
                inputId="order-geo-country"
                classNamePrefix="order-geo-select"
                options={countryOptions}
                value={geoCountry}
                onChange={handleSelectCountriesAndAddRegions}
                isClearable
                styles={customStyles}
                placeholder="Выберите страну"
                isDisabled={countries.length === 0}
                noOptionsMessage={() => "Нет стран в справочнике"}
              />
            </div>
            <div className="order-geo-field">
              <label className="label" htmlFor="order-geo-region">
                Область <span className="required">*</span>
              </label>
              <Select
                inputId="order-geo-region"
                classNamePrefix="order-geo-select"
                options={areaOptions}
                value={geoRegion}
                onChange={handleSelectRegionsAndAddTowns}
                isClearable
                styles={customStyles}
                placeholder="Выберите область"
                isDisabled={!geoCountry || regions.length === 0}
                noOptionsMessage={() =>
                  geoCountry
                    ? "Нет регионов для выбранной страны"
                    : "Сначала выберите страну"
                }
              />
            </div>
            <div className="order-geo-field">
              <label className="label" htmlFor="order-geo-town">
                Город <span className="required">*</span>
              </label>
              <Select
                inputId="order-geo-town"
                classNamePrefix="order-geo-select"
                options={townOptions}
                value={geoTown}
                onChange={setGeoTown}
                isClearable
                styles={customStyles}
                placeholder="Выберите город"
                noOptionsMessage={() =>
                  !geoRegion
                    ? "Сначала выберите область"
                    : "Нет городов для выбранной области"
                }
                isDisabled={!geoRegion}
              />
            </div>
          </div>

          {/* Точная локация */}
          <div>
            <label htmlFor="location" className="label">
              Точная локация <span className="required">*</span>
            </label>
            <input
              type="text"
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Улица, дом, квартира..."
              className="input"
            />
          </div>

          {/* Срок выполнения */}
          <DeadlineField
            id="deadline"
            value={deadline}
            onChange={setDeadline}
            labelClassName="label"
            selectClassName="select"
            inputClassName="input"
          />

          {/* Страхование */}
          <div>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={insuranceRequired}
                onChange={(e) => setInsuranceRequired(e.target.checked)}
                className="checkbox"
              />
              Требуется страхование
            </label>
          </div>

          {/* Кнопка отправки */}
          <div>
            <button type="submit" className="submit-button">
              Разместить заказ
            </button>
            <p className="text-center">
              Нажимая кнопку, вы соглашаетесь с условиями использования
            </p>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
}

const customStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: 42,
    height: 42,
    borderRadius: 10,
    borderColor: state.isFocused ? "#2563eb" : "#e2e8f0",
    boxShadow: state.isFocused ? "0 0 0 3px rgba(37, 99, 235, 0.12)" : "none",
    backgroundColor: "#f8fafc",
    fontSize: "0.9375rem",
    alignItems: "center",
    flexWrap: "nowrap",
    "&:hover": { borderColor: "#94a3b8" },
  }),
  dropdownIndicator: (base) => ({
    ...base,
    padding: "0 8px",
  }),
  clearIndicator: (base) => ({
    ...base,
    padding: "0 4px",
  }),
  indicatorsContainer: (base) => ({
    ...base,
    height: 40,
    alignSelf: "center",
  }),
  valueContainer: (base) => ({
    ...base,
    padding: "0 10px",
    height: 40,
    flexWrap: "nowrap",
    alignItems: "center",
    overflow: "hidden",
  }),
  input: (base) => ({
    ...base,
    margin: 0,
    padding: 0,
  }),
  singleValue: (base) => ({
    ...base,
    margin: 0,
    padding: 0,
    maxWidth: "calc(100% - 8px)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  }),
  placeholder: (base) => ({
    ...base,
    margin: 0,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  }),
  indicatorSeparator: () => ({ display: "none" }),
  menu: (base) => ({
    ...base,
    borderRadius: 10,
    overflow: "hidden",
    boxShadow: "0 10px 28px rgba(15, 23, 42, 0.12)",
    zIndex: 50,
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isFocused ? "#eff6ff" : "white",
    color: "#0f172a",
    cursor: "pointer",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  }),
};
