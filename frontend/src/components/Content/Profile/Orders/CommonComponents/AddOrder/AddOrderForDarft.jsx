import React, { useState, useEffect, useCallback } from "react";
import CreatableSelect from "react-select/creatable";
import Select from "react-select";
import { API, apiFetch, buildApiUrl } from "../../../../../../utils/api.js";
import "./add_order_for_draft.css";

// сохранение заказа в черновик
export default function AddOrderForDraft({ onSuccess }) {
  const [categoryWork, setCategoryWork] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [currency, setCurrency] = useState("BYN");
  const [budgetType, setBudgetType] = useState("");
  const [urgencyLevel, setUrgencyLevel] = useState("");
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
        buildApiUrl(`/countries/${countryId}/regions`)
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
        buildApiUrl(`/regions/${regionId}/towns`)
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
    [fetchRegionsCountry]
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
    [fetchTownsRegion]
  );

  // Загрузка категорий работ
  const fetchCategoriesWorks = useCallback(async () => {
    try {
      const response_categories_works = await apiFetch(
        buildApiUrl("/categories_works")
      );
      if (!response_categories_works.ok) {
        throw new Error("Не получили данных с сервера");
      }
      const categories_works_data = await response_categories_works.json();
      const formatted_categories_works = categories_works_data.map(
        (category_work) => ({
          value: category_work.category_work_id || category_work.id,
          label: category_work.name || category_work.name_category_work,
        })
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
      alert("Выберите категорию услуги");
      return;
    }
    if (!title.trim()) {
      alert("Введите заголовок заказа");
      return;
    }
    if (!description.trim()) {
      alert("Опишите задачу");
      return;
    }
    if (!location.trim()) {
      alert("Укажите локацию");
      return;
    }
    if (!geoTown) {
      alert("Укажите населённый пункт");
      return;
    }
    if (!geoRegion) {
      alert("Укажите регион");
      return;
    }
    if (!geoCountry) {
      alert("Укажите страну");
      return;
    }

    const orderUserData = {
      title: title,
      description: description,
      customer_id: localStorage.getItem("user_id"),
      category_work_id: categoryWorkMaster.value,
      category_work: categoryWorkMaster.label,
      budget: parseFloat(budget) || 0,
      currency: currency,
      budget_type: budgetType,
      urgency_level: urgencyLevel,
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
        alert(`Ошибка: ${errorData.detail || "Не удалось разместить заказ"}`);
        return;
      }

      const data = await response.json();
      console.log("Заказ успешно создан:", data);

      // ✅ Создание статуса заказа
      const statusOrderCustomer = {
        order_id: data.id,
        customer_id: localStorage.getItem("user_id"),
        status: "Не предложенные исполнителям",
      };

      const response_status_order_customer = await apiFetch(
        buildApiUrl("/add_status_order_customer"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(statusOrderCustomer),
        }
      );

      if (!response_status_order_customer.ok) {
        console.error("Ошибка создания статуса заказа");
      }

      // ✅ Сохранение в localStorage
      localStorage.setItem("recent_order_id", data.id.toString());
      localStorage.setItem(
        "recent_category_work_id",
        data.category_work_id?.toString() || categoryWorkMaster.value
      );

      resetForm();
      onSuccess?.(data);
    } catch (error) {
      console.error("Ошибка: ", error);
      alert("❌ Произошла ошибка при размещении заказа");
    }
  };

  // Функция очистки формы
  const resetForm = () => {
    setCategoryWorkMaster(null);
    setTitle("");
    setDescription("");
    setBudget("");
    setCurrency("BYN");
    setBudgetType("");
    setUrgencyLevel("");
    setGeoCountry(null);
    setGeoRegion(null);
    setGeoTown(null);
    setLocation("");
    setDeadline("Как можно скорее");
    setInsuranceRequired(false);
    setRegions([]);
    setTowns([]);
  };

  const currencies = ["BYN", "Dollar USA", "Euro"];
  const budgetTypes = ["Фиксированная цена", "Почасовая оплата", "Договорная цена"];
  const urgencyLevels = ["Низкий", "Средний", "Высокий"];

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

  const selectProps = {
    styles: customStyles,
    menuPortalTarget: document.body,
    menuPosition: "fixed",
  };

  return (
    <div id="order" className="aod-page">
      <header className="aod-hero">
        <span className="aod-hero__badge">Новый заказ</span>
        <h1 className="aod-hero__title">Добавить заказ в черновик</h1>
        <p className="aod-hero__subtitle">
          Заполните форму — заказ сохранится как черновик
        </p>
      </header>

      <form className="aod-form" onSubmit={handleAddOrderUser}>
        <section className="aod-section" aria-labelledby="aod-section-main">
          <div className="aod-section__head">
            <span className="aod-section__icon" aria-hidden="true" />
            <h2 id="aod-section-main" className="aod-section__title">
              Основная информация
            </h2>
          </div>

          <div className="aod-field">
            <label htmlFor="category" className="aod-label">
              Категория услуги <span className="aod-required">*</span>
            </label>
            <CreatableSelect
              {...selectProps}
              inputId="category"
              options={categoriesWorksOptions}
              value={categoryWorkMaster}
              onChange={handleSelectCategoryWorkMaster}
              isClearable
              placeholder="Выберите категорию работ"
            />
          </div>

          <div className="aod-field">
            <label htmlFor="title" className="aod-label">
              Заголовок заказа <span className="aod-required">*</span>
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Кратко опишите задачу"
              maxLength={200}
              className="aod-input"
            />
          </div>

          <div className="aod-field">
            <label htmlFor="description" className="aod-label">
              Описание задачи <span className="aod-required">*</span>
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Опишите подробно, что нужно сделать, объём работ и пожелания..."
              rows={5}
              maxLength={2000}
              className="aod-textarea"
            />
          </div>
        </section>

        <section className="aod-section" aria-labelledby="aod-section-budget">
          <div className="aod-section__head">
            <span className="aod-section__icon" aria-hidden="true" />
            <h2 id="aod-section-budget" className="aod-section__title">
              Сумма и срочность
            </h2>
          </div>

          <div className="aod-grid-2">
            <div className="aod-field">
              <label htmlFor="budget" className="aod-label">
                Примерная сумма
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
                className="aod-input"
              />
            </div>
            <div className="aod-field">
              <label htmlFor="currency" className="aod-label">
                Валюта
              </label>
              <select
                id="currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="aod-select"
              >
                {currencies.map((cur) => (
                  <option key={cur} value={cur}>
                    {cur}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="aod-grid-2">
            <div className="aod-field">
              <label htmlFor="budgetType" className="aod-label">
                Тип бюджета
              </label>
              <select
                id="budgetType"
                value={budgetType}
                onChange={(e) => setBudgetType(e.target.value)}
                className="aod-select"
              >
                <option value="">Выберите тип бюджета</option>
                {budgetTypes.map((bt) => (
                  <option key={bt} value={bt}>
                    {bt}
                  </option>
                ))}
              </select>
            </div>
            <div className="aod-field">
              <label htmlFor="urgencyLevel" className="aod-label">
                Уровень срочности
              </label>
              <select
                id="urgencyLevel"
                value={urgencyLevel}
                onChange={(e) => setUrgencyLevel(e.target.value)}
                className="aod-select"
              >
                <option value="">Выберите уровень срочности</option>
                {urgencyLevels.map((ul) => (
                  <option key={ul} value={ul}>
                    {ul}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="aod-section" aria-labelledby="aod-section-geo">
          <div className="aod-section__head">
            <span className="aod-section__icon" aria-hidden="true" />
            <h2 id="aod-section-geo" className="aod-section__title">
              Место выполнения
            </h2>
          </div>

          <div className="aod-grid-3">
            <div className="aod-field">
              <label htmlFor="geo-country" className="aod-label">
                Страна <span className="aod-required">*</span>
              </label>
              <Select
                {...selectProps}
                inputId="geo-country"
                options={countryOptions}
                value={geoCountry}
                onChange={handleSelectCountriesAndAddRegions}
                isClearable
                placeholder="Выберите страну"
                isDisabled={countries.length === 0}
                noOptionsMessage={() => "Нет стран в справочнике"}
              />
            </div>
            <div className="aod-field">
              <label htmlFor="geo-region" className="aod-label">
                Область <span className="aod-required">*</span>
              </label>
              <Select
                {...selectProps}
                inputId="geo-region"
                options={areaOptions}
                value={geoRegion}
                onChange={handleSelectRegionsAndAddTowns}
                isClearable
                placeholder="Выберите область"
                isDisabled={!geoCountry || regions.length === 0}
                noOptionsMessage={() =>
                  geoCountry
                    ? "Нет регионов для выбранной страны"
                    : "Сначала выберите страну"
                }
              />
            </div>
            <div className="aod-field">
              <label htmlFor="geo-town" className="aod-label">
                Город <span className="aod-required">*</span>
              </label>
              <Select
                {...selectProps}
                inputId="geo-town"
                options={townOptions}
                value={geoTown}
                onChange={setGeoTown}
                isClearable
                placeholder="Выберите город"
                noOptionsMessage={() =>
                  !geoRegion
                    ? "Выберите город"
                    : "Нет городов для выбранной области"
                }
                isDisabled={!geoRegion}
              />
            </div>
          </div>

          <div className="aod-field">
            <label htmlFor="location" className="aod-label">
              Точная локация <span className="aod-required">*</span>
            </label>
            <input
              type="text"
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Улица, дом, квартира..."
              className="aod-input"
            />
          </div>
        </section>

        <section className="aod-section" aria-labelledby="aod-section-deadline">
          <div className="aod-section__head">
            <span className="aod-section__icon" aria-hidden="true" />
            <h2 id="aod-section-deadline" className="aod-section__title">
              Сроки и условия
            </h2>
          </div>

          <div className="aod-field">
            <label htmlFor="deadline" className="aod-label">
              Когда нужно выполнить
            </label>
            <select
              id="deadline"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="aod-select"
            >
              <option>Как можно скорее</option>
              <option>В течение недели</option>
              <option>В течение месяца</option>
              <option>Точная дата</option>
            </select>
          </div>

          <label className="aod-checkbox">
            <input
              type="checkbox"
              checked={insuranceRequired}
              onChange={(e) => setInsuranceRequired(e.target.checked)}
            />
            <span className="aod-checkbox__text">
              Требуется страхование
              <span className="aod-checkbox__hint">
                Дополнительная защита на время выполнения работ
              </span>
            </span>
          </label>
        </section>

        <div className="aod-actions">
          <button type="submit" className="aod-submit">
            Добавить заказ
          </button>
          <p className="aod-legal">
            Нажимая кнопку, вы соглашаетесь с условиями использования сервиса
          </p>
        </div>
      </form>
    </div>
  );
}

const customStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: 42,
    borderRadius: 10,
    borderColor: state.isFocused ? "#2563eb" : "#e2e8f0",
    boxShadow: state.isFocused ? "0 0 0 3px rgba(37, 99, 235, 0.12)" : "none",
    backgroundColor: "#f8fafc",
    fontSize: "0.9375rem",
    "&:hover": { borderColor: "#94a3b8" },
  }),
  valueContainer: (base) => ({
    ...base,
    padding: "2px 10px",
  }),
  input: (base) => ({
    ...base,
    margin: 0,
    padding: 0,
  }),
  placeholder: (base) => ({
    ...base,
    color: "#94a3b8",
  }),
  indicatorSeparator: () => ({ display: "none" }),
  menu: (base) => ({
    ...base,
    borderRadius: 10,
    overflow: "hidden",
    boxShadow: "0 10px 28px rgba(15, 23, 42, 0.12)",
    zIndex: 50,
  }),
  menuPortal: (base) => ({
    ...base,
    zIndex: 9999,
  }),
  option: (base, state) => ({
    ...base,
    fontSize: "0.875rem",
    backgroundColor: state.isSelected
      ? "#2563eb"
      : state.isFocused
        ? "#eff6ff"
        : "#fff",
    color: state.isSelected ? "#fff" : "#0f172a",
    cursor: "pointer",
  }),
};
