import React, { useState, useEffect, useCallback } from "react";
import { API, apiFetch } from "../../../../../../utils/api.js";
import CreatableSelect from "react-select/creatable";
import Select from "react-select";
import DeleteOrderButton from "../DeleteOrder/DeleteOrderButton";
import { formatDateTime } from "../../../Services/CommonComponent/CustomerOrderInfo/OrderInfoContent";
import "../AddOrder/add_order_for_draft.css";
const ORDER_STATUS = {
  DRAFT: "Не предложенные исполнителям",
  SEARCH: "В поиске исполнителя",
  SELF: "Самостоятельное выполнение",
};

const budgetTypes = ["Фиксированная цена", "Почасовая оплата", "Договорная цена"];
const urgencyLevels = ["Низкий", "Средний", "Высокий"];
const currencies = ["BYN", "Dollar USA", "Euro"];

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

const selectProps = {
  styles: customStyles,
  menuPortalTarget: typeof document !== "undefined" ? document.body : null,
  menuPosition: "fixed",
};

function normalizeOrder(order) {
  if (!order) return null;
  return {
    ...order,
    category_work:
      order.category_work || order.category_work_name || order.category || "",
    budget_type: order.budget_type || order.budgetType || "",
    urgency_level: order.urgency_level || order.urgencyLevel || "",
    created_at: order.created_at || order.createdAt || "",
    updated_at: order.updated_at || order.updatedAt || "",
    status_order_customer:
      order.status_order_customer || order.status || "",
    insurance_required: Boolean(
      order.insurance_required ?? order.insuranceRequired,
    ),
  };
}

function geoOption(value, label) {
  if (!label && !value) return null;
  return {
    value: value ?? label,
    label: label || String(value),
  };
}

export default function CustomerOrderInfo({
  order,
  onOrderUpdated,
  onOrderDeleted,
}) {
  const normalized = normalizeOrder(order);

  if (!normalized) {
    return (
      <div className="aod-page">
        <p className="aod-form-message aod-form-message--error">
          Информация о заказе недоступна
        </p>
      </div>
    );
  }

  return (
    <CustomerOrderEditForm
      order={normalized}
      onOrderUpdated={onOrderUpdated}
      onOrderDeleted={onOrderDeleted}
    />
  );
}

function CustomerOrderEditForm({
  order,
  onOrderUpdated,
  onOrderDeleted,
}) {
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

  const [geoCountry, setGeoCountry] = useState(null);
  const [geoRegion, setGeoRegion] = useState(null);
  const [geoTown, setGeoTown] = useState(null);
  const [countries, setCountries] = useState([]);
  const [regions, setRegions] = useState([]);
  const [towns, setTowns] = useState([]);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const isSearchStatus = order?.status_order_customer?.includes(
    ORDER_STATUS.SEARCH,
  );
  const pageBadge = isSearchStatus ? "В поиске исполнителя" : "Черновик";
  const pageTitle = "Редактирование заказа";

  const fetchCountries = useCallback(async () => {
    try {
      const response = await apiFetch(`${API.baseURL}/countries`);
      if (!response.ok) throw new Error("Не получили данных с сервера");
      const countriesData = await response.json();
      setCountries(
        countriesData.map((country) => ({
          value: country.country_id || country.id,
          label: country.name_country || country.name,
        })),
      );
    } catch (error) {
      console.error(error);
      setCountries([]);
    }
  }, []);

  const fetchRegionsCountry = useCallback(async (countryId) => {
    if (!countryId) {
      setRegions([]);
      return;
    }
    try {
      const response = await apiFetch(
        `${API.baseURL}/countries/${countryId}/regions`,
      );
      if (!response.ok) throw new Error("Не получили данных с сервера");
      const regionsData = await response.json();
      setRegions(
        regionsData.map((region) => ({
          value: region.region_id || region.id,
          label: region.name_region || region.name,
        })),
      );
    } catch (error) {
      console.error(error);
      setRegions([]);
    }
  }, []);

  const fetchTownsRegion = useCallback(async (regionId) => {
    if (!regionId) {
      setTowns([]);
      return;
    }
    try {
      const response = await apiFetch(`${API.baseURL}/regions/${regionId}/towns`);
      if (!response.ok) throw new Error("Не получили данных с сервера");
      const townsData = await response.json();
      setTowns(
        townsData.map((town) => ({
          value: town.town_id || town.id || town,
          label: town.name_town || town.name || town,
        })),
      );
    } catch (error) {
      console.error(error);
      setTowns([]);
    }
  }, []);

  const fetchCategoriesWorks = useCallback(async () => {
    try {
      const response = await apiFetch(`${API.baseURL}/categories_works`);
      if (!response.ok) throw new Error("Не получили данных с сервера");
      const categoriesData = await response.json();
      setCategoriesWorks(
        categoriesData.map((categoryWork) => ({
          value: categoryWork.category_work_id || categoryWork.id,
          label: categoryWork.name || categoryWork.name_category_work,
        })),
      );
    } catch (error) {
      console.error(error);
      setCategoriesWorks([]);
    }
  }, []);

  useEffect(() => {
    fetchCategoriesWorks();
    fetchCountries();
  }, [fetchCategoriesWorks, fetchCountries]);

  useEffect(() => {
    if (!order) return;

    setTitle(order.title || "");
    setDescription(order.description || "");
    setBudget(
      order.budget != null && order.budget !== "" ? String(order.budget) : "",
    );
    setCurrency(order.currency || "BYN");
    setBudgetType(order.budget_type || "");
    setUrgencyLevel(order.urgency_level || "");
    setLocation(order.location || "");
    setDeadline(order.deadline || "Как можно скорее");
    setInsuranceRequired(Boolean(order.insurance_required));

    if (order.category_work_id || order.category_work) {
      setCategoryWorkMaster(
        geoOption(
          order.category_work_id || order.category_work,
          order.category_work,
        ),
      );
    } else {
      setCategoryWorkMaster(null);
    }
  }, [order]);

  useEffect(() => {
    if (!order || countries.length === 0) return;

    const countryOption =
      countries.find(
        (item) =>
          String(item.value) === String(order.country_id) ||
          item.label === order.country,
      ) || geoOption(order.country_id || order.country, order.country);

    if (!countryOption) return;

    setGeoCountry(countryOption);
    fetchRegionsCountry(countryOption.value);
  }, [order, countries, fetchRegionsCountry]);

  useEffect(() => {
    if (!order || regions.length === 0) return;

    const regionOption =
      regions.find(
        (item) =>
          String(item.value) === String(order.region_id) ||
          item.label === order.region,
      ) || geoOption(order.region_id || order.region, order.region);

    if (!regionOption) return;

    setGeoRegion(regionOption);
    fetchTownsRegion(regionOption.value);
  }, [order, regions, fetchTownsRegion]);

  useEffect(() => {
    if (!order || towns.length === 0) return;

    const townOption =
      towns.find(
        (item) =>
          String(item.value) === String(order.town_id) ||
          item.label === order.town,
      ) || geoOption(order.town_id || order.town, order.town);

    if (townOption) setGeoTown(townOption);
  }, [order, towns]);

  const handleSelectCountriesAndAddRegions = async (selectedOption) => {
    setGeoCountry(selectedOption);
    setGeoRegion(null);
    setGeoTown(null);
    setRegions([]);
    setTowns([]);
    if (selectedOption) {
      await fetchRegionsCountry(selectedOption.value);
    }
  };

  const handleSelectRegionsAndAddTowns = async (selectedOption) => {
    setGeoRegion(selectedOption);
    setGeoTown(null);
    setTowns([]);
    if (selectedOption) {
      await fetchTownsRegion(selectedOption.value);
    }
  };

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
      return;
    }
    e.preventDefault();
  };

  const validateForm = () => {
    if (!categoryWorkMaster) return "Выберите категорию услуги";
    if (!title.trim()) return "Введите заголовок заказа";
    if (!description.trim()) return "Опишите задачу";
    if (!location.trim()) return "Укажите точную локацию";
    if (!geoCountry) return "Укажите страну";
    if (!geoRegion) return "Укажите область";
    if (!geoTown) return "Укажите населённый пункт";
    return "";
  };

  const buildPayload = () => ({
    title: title.trim(),
    description: description.trim(),
    customer_id: Number(localStorage.getItem("user_id")),
    category_work_id: categoryWorkMaster.value,
    category_work: categoryWorkMaster.label,
    budget: parseFloat(budget) || 0,
    currency,
    budget_type: budgetType,
    urgency_level: urgencyLevel,
    country: geoCountry.label,
    country_id: geoCountry.value,
    region: geoRegion.label,
    region_id: geoRegion.value,
    town: geoTown.label,
    town_id: geoTown.value,
    location: location.trim(),
    deadline,
    insurance_required: insuranceRequired,
  });

  const updateOrderOnServer = async (orderId, payload) => {
    const customerId = Number(localStorage.getItem("user_id"));
    const response = await apiFetch(
      `${API.baseURL}/update_order_customer/${customerId}/${orderId}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      let message = "Не удалось сохранить заказ";
      try {
        const data = await response.json();
        message = data.detail || message;
      } catch {
        /* ignore */
      }
      throw new Error(message);
    }

    return response.json();
  };

  const setCustomerOrderStatus = async (orderId, status) => {
    const customerId = localStorage.getItem("user_id");
    const response = await apiFetch(`${API.baseURL}/add_status_order_customer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_id: orderId,
        customer_id: customerId,
        status,
      }),
    });

    if (!response.ok) {
      throw new Error("Не удалось обновить статус заказа");
    }
  };

  const persistOrder = async (nextStatus) => {
    if (!order?.id) {
      throw new Error("Заказ не найден");
    }

    const validationError = validateForm();
    if (validationError) {
      throw new Error(validationError);
    }

    const payload = buildPayload();
    const updatedOrder = await updateOrderOnServer(order.id, payload);

    if (nextStatus) {
      await setCustomerOrderStatus(order.id, nextStatus);
    }

    const mergedOrder = {
      ...order,
      ...payload,
      ...updatedOrder,
      status_order_customer:
        nextStatus ??
        order.status_order_customer ??
        (isSearchStatus ? ORDER_STATUS.SEARCH : ORDER_STATUS.DRAFT),
    };

    onOrderUpdated?.(mergedOrder);
    return mergedOrder;
  };

  const runAction = async (nextStatus, successMessage) => {
    setSaving(true);
    setFormError("");
    try {
      await persistOrder(nextStatus);
      alert(successMessage);
    } catch (error) {
      console.error(error);
      setFormError(error.message || "Не удалось выполнить действие");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDraft = (e) => {
    e.preventDefault();
    runAction(
      null,
      isSearchStatus ? "Изменения сохранены" : "Черновик сохранён",
    );
  };

  const handlePlaceOrder = () => {
    runAction(
      ORDER_STATUS.SEARCH,
      "Заказ размещён и отправлен в поиск исполнителя",
    );
  };

  const handleSelfExecution = () => {
    runAction(
      ORDER_STATUS.SELF,
      "Заказ переведён в самостоятельное выполнение",
    );
  };

  return (
    <div className="aod-page">
      <header className="aod-hero">
        <span className="aod-hero__badge">{pageBadge}</span>
        <h1 className="aod-hero__title">{pageTitle}</h1>
        <p className="aod-hero__subtitle">
          {order?.id ? (
            <>
              Заказ №{order.id}
              {order.created_at
                ? ` · создан ${formatDateTime(order.created_at)}`
                : ""}
            </>
          ) : (
            "Измените данные и сохраните черновик или опубликуйте заказ"
          )}
        </p>
      </header>

      <form className="aod-form" onSubmit={handleSaveDraft}>
        {formError && (
          <p className="aod-form-message aod-form-message--error" role="alert">
            {formError}
          </p>
        )}

        <section className="aod-section" aria-labelledby="coi-section-main">
          <div className="aod-section__head">
            <span className="aod-section__icon" aria-hidden="true" />
            <h2 id="coi-section-main" className="aod-section__title">
              Основная информация
            </h2>
          </div>

          <div className="aod-field">
            <label htmlFor="coi-category" className="aod-label">
              Категория услуги <span className="aod-required">*</span>
            </label>
            <CreatableSelect
              {...selectProps}
              inputId="coi-category"
              options={categoriesWorks}
              value={categoryWorkMaster}
              onChange={setCategoryWorkMaster}
              isClearable
              placeholder="Выберите категорию работ"
            />
          </div>

          <div className="aod-field">
            <label htmlFor="coi-title" className="aod-label">
              Заголовок заказа <span className="aod-required">*</span>
            </label>
            <input
              type="text"
              id="coi-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Кратко опишите задачу"
              maxLength={200}
              className="aod-input"
              required
            />
          </div>

          <div className="aod-field">
            <label htmlFor="coi-description" className="aod-label">
              Описание задачи <span className="aod-required">*</span>
            </label>
            <textarea
              id="coi-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Опишите подробно, что нужно сделать, объём работ и пожелания..."
              rows={5}
              maxLength={2000}
              className="aod-textarea"
              required
            />
          </div>
        </section>

        <section className="aod-section" aria-labelledby="coi-section-budget">
          <div className="aod-section__head">
            <span className="aod-section__icon" aria-hidden="true" />
            <h2 id="coi-section-budget" className="aod-section__title">
              Сумма и срочность
            </h2>
          </div>

          <div className="aod-grid-2">
            <div className="aod-field">
              <label htmlFor="coi-budget" className="aod-label">
                Примерная сумма
              </label>
              <input
                type="number"
                id="coi-budget"
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
              <label htmlFor="coi-currency" className="aod-label">
                Валюта
              </label>
              <select
                id="coi-currency"
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
              <label htmlFor="coi-budget-type" className="aod-label">
                Тип бюджета
              </label>
              <select
                id="coi-budget-type"
                value={budgetType}
                onChange={(e) => setBudgetType(e.target.value)}
                className="aod-select"
              >
                <option value="">Выберите тип бюджета</option>
                {budgetTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div className="aod-field">
              <label htmlFor="coi-urgency" className="aod-label">
                Уровень срочности
              </label>
              <select
                id="coi-urgency"
                value={urgencyLevel}
                onChange={(e) => setUrgencyLevel(e.target.value)}
                className="aod-select"
              >
                <option value="">Выберите уровень срочности</option>
                {urgencyLevels.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="aod-section" aria-labelledby="coi-section-geo">
          <div className="aod-section__head">
            <span className="aod-section__icon" aria-hidden="true" />
            <h2 id="coi-section-geo" className="aod-section__title">
              Место выполнения
            </h2>
          </div>

          <div className="aod-grid-3">
            <div className="aod-field">
              <label htmlFor="coi-country" className="aod-label">
                Страна <span className="aod-required">*</span>
              </label>
              <Select
                {...selectProps}
                inputId="coi-country"
                options={countries}
                value={geoCountry}
                onChange={handleSelectCountriesAndAddRegions}
                isClearable
                placeholder="Выберите страну"
                isDisabled={countries.length === 0}
                noOptionsMessage={() => "Нет стран в справочнике"}
              />
            </div>
            <div className="aod-field">
              <label htmlFor="coi-region" className="aod-label">
                Область <span className="aod-required">*</span>
              </label>
              <Select
                {...selectProps}
                inputId="coi-region"
                options={regions}
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
              <label htmlFor="coi-town" className="aod-label">
                Город <span className="aod-required">*</span>
              </label>
              <Select
                {...selectProps}
                inputId="coi-town"
                options={towns}
                value={geoTown}
                onChange={setGeoTown}
                isClearable
                placeholder="Выберите город"
                isDisabled={!geoRegion}
                noOptionsMessage={() =>
                  geoRegion
                    ? "Нет городов для выбранной области"
                    : "Выберите город"
                }
              />
            </div>
          </div>

          <div className="aod-field">
            <label htmlFor="coi-location" className="aod-label">
              Точная локация <span className="aod-required">*</span>
            </label>
            <input
              type="text"
              id="coi-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Улица, дом, квартира..."
              className="aod-input"
              required
            />
          </div>
        </section>

        <section className="aod-section" aria-labelledby="coi-section-deadline">
          <div className="aod-section__head">
            <span className="aod-section__icon" aria-hidden="true" />
            <h2 id="coi-section-deadline" className="aod-section__title">
              Сроки и условия
            </h2>
          </div>

          <div className="aod-field">
            <label htmlFor="coi-deadline" className="aod-label">
              Когда нужно выполнить
            </label>
            <select
              id="coi-deadline"
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

          <label className="aod-checkbox" htmlFor="coi-insurance">
            <input
              type="checkbox"
              id="coi-insurance"
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
          <button type="submit" className="aod-btn-secondary" disabled={saving}>
            {saving
              ? "Сохранение…"
              : isSearchStatus
                ? "Сохранить изменения"
                : "Сохранить черновик"}
          </button>
          {!isSearchStatus && (
            <button
              type="button"
              className="aod-submit"
              disabled={saving}
              onClick={handlePlaceOrder}
            >
              {saving ? "Сохранение…" : "Разместить заказ"}
            </button>
          )}
          {!isSearchStatus && (
            <button
              type="button"
              className="aod-btn-self"
              disabled={saving}
              onClick={handleSelfExecution}
            >
              {saving ? "Сохранение…" : "Самостоятельное выполнение"}
            </button>
          )}
          <DeleteOrderButton
            orderId={order.id}
            orderTitle={title}
            statusOrderCustomer={order.status_order_customer}
            onDeleted={onOrderDeleted}
            className="aod-btn-delete"
          />
          <p className="aod-legal">
            Нажимая кнопку, вы соглашаетесь с условиями использования сервиса
          </p>
        </div>
      </form>
    </div>
  );
}
