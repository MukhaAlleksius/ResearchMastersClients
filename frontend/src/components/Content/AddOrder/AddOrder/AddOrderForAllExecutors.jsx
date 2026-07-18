import React, { useState, useEffect, useCallback } from "react";
import { API, apiFetch, buildApiUrl } from "../../../../utils/api.js";
import CreatableSelect from "react-select/creatable";
import Select from "react-select";
import EstimateWorks from "../../Profile/Services/CommonComponent/EstimateWorksMaterials/EstimateWorks";
import "./add_order_for_all_executors.css";
import "./order.css";

export default function AddOrderForAllExecutors({
  showAuthBanner = false,
  openModal,
}) {
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
      alert("✅ Заказ размещён! Переходим к смете...");
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

          {/* Бюджет и валюта */}
          <div className="grid-2cols">
            <div>
              <label htmlFor="budget" className="label">
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
                className="input"
              />
            </div>
            <div>
              <label htmlFor="currency" className="label">
                Валюта
              </label>
              <select
                id="currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="select"
              >
                <option value="">Выберите валюту</option>
                {currencies.map((cur) => (
                  <option key={cur} value={cur}>
                    {cur}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Тип бюджета */}
          <div>
            <label htmlFor="budgetType" className="label">
              Тип бюджета
            </label>
            <select
              id="budgetType"
              value={budgetType}
              onChange={(e) => setBudgetType(e.target.value)}
              className="select"
            >
              <option value="">Выберите тип бюджета</option>
              {budgetTypes.map((bt) => (
                <option key={bt} value={bt}>
                  {bt}
                </option>
              ))}
            </select>
          </div>

          {/* Уровень срочности */}
          <div>
            <label htmlFor="urgencyLevel" className="label">
              Уровень срочности
            </label>
            <select
              id="urgencyLevel"
              value={urgencyLevel}
              onChange={(e) => setUrgencyLevel(e.target.value)}
              className="select"
            >
              <option value="">Выберите уровень срочности</option>
              {urgencyLevels.map((ul) => (
                <option key={ul} value={ul}>
                  {ul}
                </option>
              ))}
            </select>
          </div>

          {/* Геолокация */}
          <div className="grid-3cols">
            <div className="profile-settings__field" style={{ minWidth: 200 }}>
              <label className="profile-settings__label">
                Страна <span className="required">*</span>
              </label>
              <Select
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
            <div className="profile-settings__field" style={{ minWidth: 200 }}>
              <label className="profile-settings__label">
                Область <span className="required">*</span>
              </label>
              <Select
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
            <div className="profile-settings__field" style={{ minWidth: 200 }}>
              <label className="profile-settings__label">
                Город <span className="required">*</span>
              </label>
              <Select
                options={townOptions}
                value={geoTown}
                onChange={setGeoTown}
                isClearable
                styles={customStyles}
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
          <div>
            <label htmlFor="deadline" className="label">
              Когда нужно выполнить
            </label>
            <select
              id="deadline"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="select"
            >
              <option>Как можно скорее</option>
              <option>В течение недели</option>
              <option>В течение месяца</option>
              <option>Точная дата</option>
            </select>
          </div>

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
  control: (base) => ({
    ...base,
    minHeight: 40,
    height: 40,
    borderRadius: 6,
    borderColor: "#e2e8f0",
    fontSize: 16, // Шрифты внутри полей тоже чуть меньше
    padding: "0 4px",
  }),
  dropdownIndicator: (base) => ({
    ...base,
    padding: 4,
  }),
  clearIndicator: (base) => ({
    ...base,
    padding: 4,
  }),
  valueContainer: (base) => ({
    ...base,
    padding: "0 6px",
    height: 32,
    display: "flex",
    alignItems: "center",
  }),
  input: (base) => ({
    ...base,
    margin: 0,
    padding: 0,
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isFocused ? "#f0f0f0" : "white",
    color: "black",
    cursor: "pointer",
  }),
};
