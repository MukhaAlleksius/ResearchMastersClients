import React, { useState, useEffect, useCallback } from "react";
import { API, apiFetch, buildApiUrl, normalizeListResponse, readApiError } from "../../../../../../../utils/api.js";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import OrdersScientist from "./UserServicesScientist/UserServicesScientist";
import {
  AupFiltersPanel,
  AupFilterBlock,
  AupFilterSelect,
  AupFilterInput,
  AupListState,
  AupServiceCard,
  AupListPagination,
} from "../AdminUserProfileListUi.jsx";
import "../user_profile_admin.css";
import "../../manage_users.css";

export default function UserServicesProfileAdmin() {
  const { userId } = useParams();
  const [showAnalysis, setShowAnalysis] = useState(false);

  return (
    <div className="admin-user-profile__section">
      <div className="admin-user-profile__section-head">
        <div>
          <h2 className="admin-user-profile__section-title">Услуги пользователя</h2>
          <p className="admin-user-profile__section-desc">
            Заказы, где пользователь выступает исполнителем
          </p>
        </div>
        <button
          type="button"
          className="manage-users-btn manage-users-btn--ghost"
          onClick={() => setShowAnalysis(!showAnalysis)}
        >
          {showAnalysis ? "Список услуг" : "Аналитика услуг"}
        </button>
      </div>

      {!showAnalysis ? (
        <>
          <Filters userId={userId} />
          <ServicesGrid userId={userId} />
          <AupListPagination />
        </>
      ) : (
        <OrdersScientist userId={userId} />
      )}
    </div>
  );
}

function Filters() {
  return (
    <AupFiltersPanel>
      <MainFilters />
      <GeographyFilters />
      <ServiceFilters />
    </AupFiltersPanel>
  );
}

function MainFilters() {
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = useState("Все категории");
  const [categoriesData, setCategoriesData] = useState([]);
  const [categoriesWorks, setCategoriesWorks] = useState([]);

  const fetchCategoriesWorks = async () => {
    try {
      const response = await apiFetch(
        buildApiUrl("/categories_works_for_users"),
      );
      if (!response.ok) throw new Error("Ошибка получения данных");
      const categories_data = await response.json();
      setCategoriesData(categories_data);
      const categoryNames = [
        "Все категории",
        ...categories_data.map((cat) => cat.name || "Без названия"),
      ];
      setCategoriesWorks(categoryNames);
    } catch (error) {
      console.error("Ошибка ", error);
      setCategoriesWorks(["Все категории"]);
    }
  };

  useEffect(() => {
    fetchCategoriesWorks();
  }, []);

  const handleCategoryChange = (categoryName) => {
    const params = new URLSearchParams(location.search);
    if (categoryName === "Все категории") {
      params.delete("category_work_slug");
    } else {
      const categoryData = categoriesData.find(
        (cat) => cat.name === categoryName,
      );
      if (categoryData?.slug) {
        params.set("category_work_slug", categoryData.slug);
      }
    }
    params.delete("page");
    navigate(`?${params.toString()}`, { replace: true });
  };

  return (
    <AupFilterBlock title="Основные фильтры" icon="⚙">
      <AupFilterSelect
        label="Категория работ"
        options={categoriesWorks}
        value={selectedCategory}
        onChange={handleCategoryChange}
      />
    </AupFilterBlock>
  );
}

function GeographyFilters() {
  const location = useLocation();
  const navigate = useNavigate();
  const [countries, setCountries] = useState([]);
  const [regions, setRegions] = useState([]);
  const [towns, setTowns] = useState([]);
  const [geoCountry, setGeoCountry] = useState(null);
  const [geoRegion, setGeoRegion] = useState(null);
  const [geoTown, setGeoTown] = useState(null);

  const fetchCountries = async () => {
    try {
      const response = await apiFetch(buildApiUrl("/countries"));
      if (!response.ok) throw new Error("Не получили данных с сервера");
      const countries_data = await response.json();
      const formattedCountries = countries_data.map((country) => ({
        value: country.country_id || country.id,
        label: country.name_country || country.name,
      }));
      setCountries(formattedCountries);
    } catch (error) {
      console.log("Ошибка: ", error);
      setCountries([]);
    }
  };

  const fetchRegionsCountry = async (countryId) => {
    try {
      const response = await apiFetch(
        buildApiUrl(`/countries/${countryId}/regions`),
      );
      if (!response.ok) throw new Error("Не получили данных с сервера");
      const regions_data = await response.json();
      const formattedRegions = regions_data.map((region) => ({
        value: region.region_id || region.id,
        label: region.name_region || region.name,
      }));
      setRegions(formattedRegions);
    } catch (error) {
      console.log("Ошибка: ", error);
      setRegions([]);
      setTowns([]);
    }
  };

  const fetchTownsRegion = async (regionId) => {
    if (!regionId) {
      setTowns([]);
      return;
    }
    try {
      const response = await apiFetch(
        buildApiUrl(`/regions/${regionId}/towns`),
      );
      if (!response.ok) throw new Error("Не получили данных с сервера");
      const towns_data = await response.json();
      const formattedTowns = towns_data.map((town) => ({
        value: town.town_id || town.id || town,
        label: town.name_town || town.name || town,
      }));
      setTowns(formattedTowns);
    } catch (error) {
      setTowns([]);
      console.log("Ошибка: ", error);
    }
  };

  const handleSelectCountry = async (selectedOption) => {
    setGeoCountry(selectedOption);
    setGeoRegion(null);
    setGeoTown(null);
    setRegions([]);
    setTowns([]);

    const params = new URLSearchParams(location.search);
    if (!selectedOption?.value) {
      params.delete("country");
    } else {
      params.set("country", selectedOption.label);
    }
    params.delete("region");
    params.delete("town");
    params.delete("page");
    navigate(`?${params.toString()}`, { replace: true });

    if (selectedOption?.value) {
      await fetchRegionsCountry(selectedOption.value);
    }
  };

  const handleSelectRegion = async (selectedOption) => {
    setGeoRegion(selectedOption);
    setGeoTown(null);
    setTowns([]);

    const params = new URLSearchParams(location.search);
    if (!selectedOption?.value) {
      params.delete("region");
    } else {
      params.set("region", selectedOption.label);
    }
    params.delete("town");
    params.delete("page");
    navigate(`?${params.toString()}`, { replace: true });

    if (selectedOption?.value) {
      await fetchTownsRegion(selectedOption.value);
    }
  };

  const handleSelectTown = (selectedOption) => {
    setGeoTown(selectedOption);

    const params = new URLSearchParams(location.search);
    if (!selectedOption?.value) {
      params.delete("town");
    } else {
      params.set("town", selectedOption.label);
    }
    params.delete("page");
    navigate(`?${params.toString()}`, { replace: true });
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const countryName = params.get("country");

    if (!countryName && countries.length > 0) {
      setGeoCountry(null);
      setGeoRegion(null);
      setGeoTown(null);
      setRegions([]);
      setTowns([]);
      return;
    }

    if (countryName && countries.length > 0) {
      const country = countries.find((c) =>
        c.label.toLowerCase().includes(countryName.toLowerCase()),
      );
      if (country) {
        setGeoCountry(country);
        fetchRegionsCountry(country.value);
      }
    }
  }, [location.search, countries]);

  useEffect(() => {
    fetchCountries();
  }, []);

  return (
    <AupFilterBlock title="География" icon="📍">
      <div className="aup-field">
        <label className="aup-field__label">Страна</label>
        <select
          className="aup-field__input"
          value={geoCountry?.value || ""}
          onChange={(e) =>
            handleSelectCountry({
              value: e.target.value,
              label: e.target.options[e.target.selectedIndex].text,
            })
          }
        >
          <option value="">Любая</option>
          {countries.map((country) => (
            <option key={country.value} value={country.value}>
              {country.label}
            </option>
          ))}
        </select>
      </div>
      <div className="aup-field">
        <label className="aup-field__label">Область</label>
        <select
          className="aup-field__input"
          value={geoRegion?.value || ""}
          onChange={(e) =>
            handleSelectRegion({
              value: e.target.value,
              label: e.target.options[e.target.selectedIndex].text,
            })
          }
          disabled={!geoCountry}
        >
          <option value="">Любая</option>
          {regions.map((region) => (
            <option key={region.value} value={region.value}>
              {region.label}
            </option>
          ))}
        </select>
      </div>
      <div className="aup-field">
        <label className="aup-field__label">Город</label>
        <select
          className="aup-field__input"
          value={geoTown?.value || ""}
          onChange={(e) =>
            handleSelectTown({
              value: e.target.value,
              label: e.target.options[e.target.selectedIndex].text,
            })
          }
          disabled={!geoRegion}
        >
          <option value="">Любой</option>
          {towns.map((town) => (
            <option key={town.value} value={town.value}>
              {town.label}
            </option>
          ))}
        </select>
      </div>
    </AupFilterBlock>
  );
}

function ServiceFilters() {
  const location = useLocation();
  const navigate = useNavigate();

  const [statusOptions] = useState([
    "Все статусы",
    "Предложения заказчиков",
    "На рассмотрении заказчика",
    "Ожидают выполнения",
    "В процессе выполнения",
    "Выполнен",
    "Самостоятельное выполнение",
    "Отказано заказчиком",
    "Отказ от заказа",
  ]);
  const [selectedStatus, setSelectedStatus] = useState("Все статусы");

  const [budgetFrom, setBudgetFrom] = useState("");
  const [budgetTo, setBudgetTo] = useState("");

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const handleStatusChange = (status) => {
    setSelectedStatus(status);
    const params = new URLSearchParams(location.search);
    if (status && status !== "Все статусы") {
      params.set("status_service", status);
    } else {
      params.delete("status_service");
    }
    params.delete("page");
    navigate(`?${params.toString()}`, { replace: true });
  };

  const handleBudgetChange = (type, value) => {
    if (type === "from") {
      setBudgetFrom(value);
    } else {
      setBudgetTo(value);
    }

    const params = new URLSearchParams(location.search);

    if (type === "from") {
      if (value) {
        params.set("budget_from", value);
      } else {
        params.delete("budget_from");
      }
    }

    if (type === "to") {
      if (value) {
        params.set("budget_to", value);
      } else {
        params.delete("budget_to");
      }
    }

    params.delete("page");
    navigate(`?${params.toString()}`, { replace: true });
  };

  const handleDateChange = (type, value) => {
    if (type === "start") {
      setStartDate(value);
    } else {
      setEndDate(value);
    }

    const params = new URLSearchParams(location.search);

    if (type === "start") {
      if (value) {
        params.set("start_date_orders", value);
      } else {
        params.delete("start_date_orders");
      }
    }

    if (type === "end") {
      if (value) {
        params.set("end_date_orders", value);
      } else {
        params.delete("end_date_orders");
      }
    }

    params.delete("page");
    navigate(`?${params.toString()}`, { replace: true });
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setSelectedStatus(params.get("status_service") || "Все статусы");
    setBudgetFrom(params.get("budget_from") || "");
    setBudgetTo(params.get("budget_to") || "");
    setStartDate(params.get("start_date_orders") || "");
    setEndDate(params.get("end_date_orders") || "");
  }, [location.search]);

  return (
    <AupFilterBlock title="Параметры услуги" icon="🛠">
      <AupFilterSelect
        label="Статус услуги"
        options={statusOptions}
        value={selectedStatus}
        onChange={handleStatusChange}
      />
      <AupFilterInput
        label="Бюджет от"
        type="number"
        value={budgetFrom}
        onChange={(v) => handleBudgetChange("from", v)}
        placeholder="0"
      />
      <AupFilterInput
        label="Бюджет до"
        type="number"
        value={budgetTo}
        onChange={(v) => handleBudgetChange("to", v)}
        placeholder="∞"
      />
      <AupFilterInput
        label="Дата с"
        type="date"
        value={startDate}
        onChange={(v) => handleDateChange("start", v)}
      />
      <AupFilterInput
        label="Дата по"
        type="date"
        value={endDate}
        onChange={(v) => handleDateChange("end", v)}
      />
    </AupFilterBlock>
  );
}

function ServicesGrid({ userId }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [orders, setOrders] = useState([]); // Исправил на orders
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchServicesForAdmin = useCallback(async () => {
    if (!userId) {
      setOrders([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const frontendParams = new URLSearchParams(location.search);
      const backendParams = new URLSearchParams({ user_id: String(userId) });

      const paramMap = [
        ["category_work_slug", "category_work_slug"],
        ["country", "country"],
        ["region", "region"],
        ["town", "town"],
        ["status_service", "status_service"],
        ["budget_from", "budget_from"],
        ["budget_to", "budget_to"],
        ["start_date_orders", "start_date_orders"],
        ["end_date_orders", "end_date_orders"],
      ];

      paramMap.forEach(([frontKey, backKey]) => {
        const value = frontendParams.get(frontKey);
        if (value) backendParams.set(backKey, value);
      });

      const url = buildApiUrl("/services_executor_admin", backendParams);
      const response = await apiFetch(url);

      if (!response.ok) {
        const detail = (await readApiError(response)) || `HTTP ${response.status}`;
        if (response.status === 403) {
          throw new Error(
            detail ||
              "Нет прав для просмотра услуг. Войдите под учётной записью с ролью admin или moderator.",
          );
        }
        throw new Error(detail);
      }

      const data = await response.json();
      setOrders(normalizeListResponse(data));
    } catch (err) {
      console.error("Ошибка загрузки услуг:", err);
      setError(err.message || "Не удалось загрузить услуги");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [location.search, userId]);

  useEffect(() => {
    fetchServicesForAdmin();
  }, [fetchServicesForAdmin]);

  const openServiceProfile = (service) => {
    console.log("Заказ до передачи ", service);
    navigate(`/admin/manage_users/${userId}/services/${service.id}`, {
      state: {
        serviceId: service.id,
        userId: userId,
      },
    });
  };

  if (loading) {
    return (
      <div className="aup-list-grid">
        <AupListState variant="loading" message="Загрузка услуг пользователя…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="aup-list-grid">
        <AupListState
          variant="error"
          message={error}
          onRetry={fetchServicesForAdmin}
        />
      </div>
    );
  }

  return (
    <>
      <p className="aup-list-count">
        Найдено: <strong>{orders.length}</strong> услуг(и)
      </p>
      <div className="aup-list-grid">
        {orders.length === 0 ? (
          <AupListState
            variant="empty"
            emptyTitle="Услуги не найдены"
            message="У пользователя нет услуг по выбранным фильтрам"
          />
        ) : (
          orders.map((service) => (
            <AupServiceCard
              key={service.id}
              service={service}
              onClick={() => openServiceProfile(service)}
            />
          ))
        )}
      </div>
    </>
  );
}
