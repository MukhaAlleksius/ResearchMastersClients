import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  apiFetch,
  buildApiUrl,
  normalizeListResponse,
  readApiError,
} from "../../../../utils/api.js";
import UserOrdersScientist from "../ManageUsers/Users/UserProfileAdmin/UserOrdersProfileAdmin/UserOrdersScientist/UserOrdersScientist.jsx";
import {
  AupFiltersToolbar,
  AupFiltersPanel,
  AupFilterBlock,
  AupFilterSelect,
  AupFilterInput,
  AupListState,
  AupOrderCard,
  AupListPagination,
  countActiveFiltersFromSearch,
} from "../ManageUsers/Users/UserProfileAdmin/AdminUserProfileListUi.jsx";
import "../ManageUsers/Users/manage_users.css";
import "../ManageUsers/Users/UserProfileAdmin/user_profile_admin.css";
import "./manage_orders.css";

const ORDER_STATUS_OPTIONS = [
  "Все статусы",
  "Не предложенные исполнителям",
  "В поиске исполнителя",
  "Самостоятельное выполнение",
  "Ожидают выполнения",
  "В процессе выполнения",
  "Выполнен",
  "Отменен",
];

export default function ManageOrdersAdmin() {
  const navigate = useNavigate();
  const location = useLocation();
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [totalOrders, setTotalOrders] = useState(0);

  const activeFilterCount = useMemo(
    () => countActiveFiltersFromSearch(location.search),
    [location.search],
  );

  const handleClearFilters = useCallback(() => {
    navigate("/admin/manage_orders", { replace: true });
  }, [navigate]);

  return (
    <div className="manage-orders-page">
      <header className="manage-orders-hero">
        <div className="manage-orders-hero__text">
          <span className="manage-orders-hero__badge">Админ · Заказы</span>
          <h1 className="manage-orders-hero__title">Управление заказами</h1>
          <p className="manage-orders-hero__subtitle">
            Просмотр, фильтрация и аналитика заказов платформы
          </p>
        </div>
        <div className="manage-orders-hero__stats">
          <div className="manage-orders-stat">
            <span className="manage-orders-stat__value">{totalOrders}</span>
            <span className="manage-orders-stat__label">найдено</span>
          </div>
          <div className="manage-orders-stat">
            <span className="manage-orders-stat__value">{activeFilterCount}</span>
            <span className="manage-orders-stat__label">фильтров</span>
          </div>
        </div>
      </header>

      <div className="manage-orders-toolbar">
        <div className="manage-orders-toolbar__left">
          {!showAnalysis && (
            <AupFiltersToolbar
              filtersOpen={filtersOpen}
              onToggleFilters={() => setFiltersOpen((open) => !open)}
              activeFilterCount={activeFilterCount}
              onClearFilters={handleClearFilters}
            />
          )}
        </div>
        <div className="manage-orders-view-toggle" role="tablist" aria-label="Режим просмотра">
          <button
            type="button"
            role="tab"
            aria-selected={!showAnalysis}
            className={`manage-orders-view-toggle__btn ${!showAnalysis ? "is-active" : ""}`}
            onClick={() => setShowAnalysis(false)}
          >
            Список
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={showAnalysis}
            className={`manage-orders-view-toggle__btn ${showAnalysis ? "is-active" : ""}`}
            onClick={() => setShowAnalysis(true)}
          >
            Аналитика
          </button>
        </div>
      </div>

      {!showAnalysis ? (
        <>
          {filtersOpen && <Filters />}
          <OrdersGrid onTotalChange={setTotalOrders} />
          <AupListPagination />
        </>
      ) : (
        <UserOrdersScientist
          title="Анализ заказов платформы"
          emptyLabel="заказов"
          emptyMessage="На платформе пока нет заказов"
        />
      )}
    </div>
  );
}

function Filters() {
  return (
    <AupFiltersPanel>
      <MainFilters />
      <GeographyFilters />
      <OrderFilters />
    </AupFiltersPanel>
  );
}

function MainFilters() {
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = useState("Все категории");
  const [categoriesData, setCategoriesData] = useState([]);
  const [categoriesWorks, setCategoriesWorks] = useState([]);

  useEffect(() => {
    const fetchCategoriesWorks = async () => {
      try {
        const response = await apiFetch(buildApiUrl("/categories_works_for_users"));
        if (!response.ok) throw new Error("Ошибка получения данных");
        const categories_data = await response.json();
        setCategoriesData(categories_data);
        setCategoriesWorks([
          "Все категории",
          ...categories_data.map((cat) => cat.name || "Без названия"),
        ]);
      } catch (error) {
        console.error("Ошибка ", error);
        setCategoriesWorks(["Все категории"]);
      }
    };
    fetchCategoriesWorks();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const slug = params.get("category_work_slug");
    if (slug && categoriesData.length > 0) {
      const category = categoriesData.find((cat) => cat.slug === slug);
      setSelectedCategory(category?.name || "Все категории");
    } else {
      setSelectedCategory("Все категории");
    }
  }, [location.search, categoriesData]);

  const handleCategoryChange = (categoryName) => {
    setSelectedCategory(categoryName);
    const params = new URLSearchParams(location.search);
    if (categoryName === "Все категории") {
      params.delete("category_work_slug");
    } else {
      const categoryData = categoriesData.find((cat) => cat.name === categoryName);
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

  const fetchRegionsCountry = async (countryId) => {
    try {
      const response = await apiFetch(buildApiUrl(`/countries/${countryId}/regions`));
      if (!response.ok) throw new Error("Не получили данных с сервера");
      const regions_data = await response.json();
      setRegions(
        regions_data.map((region) => ({
          value: region.region_id || region.id,
          label: region.name_region || region.name,
        })),
      );
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
      const response = await apiFetch(buildApiUrl(`/regions/${regionId}/towns`));
      if (!response.ok) throw new Error("Не получили данных с сервера");
      const towns_data = await response.json();
      setTowns(
        towns_data.map((town) => ({
          value: town.town_id || town.id || town,
          label: town.name_town || town.name || town,
        })),
      );
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
    const fetchCountries = async () => {
      try {
        const response = await apiFetch(buildApiUrl("/countries"));
        if (!response.ok) throw new Error("Не получили данных с сервера");
        const countries_data = await response.json();
        setCountries(
          countries_data.map((country) => ({
            value: country.country_id || country.id,
            label: country.name_country || country.name,
          })),
        );
      } catch (error) {
        console.log("Ошибка: ", error);
        setCountries([]);
      }
    };
    fetchCountries();
  }, []);

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

function OrderFilters() {
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedStatus, setSelectedStatus] = useState("Все статусы");
  const [budgetFrom, setBudgetFrom] = useState("");
  const [budgetTo, setBudgetTo] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const handleStatusChange = (status) => {
    setSelectedStatus(status);
    const params = new URLSearchParams(location.search);
    if (status && status !== "Все статусы") {
      params.set("status_order", status);
    } else {
      params.delete("status_order");
    }
    params.delete("page");
    navigate(`?${params.toString()}`, { replace: true });
  };

  const handleBudgetChange = (type, value) => {
    if (type === "from") setBudgetFrom(value);
    else setBudgetTo(value);

    const params = new URLSearchParams(location.search);
    if (type === "from") {
      if (value) params.set("budget_from", value);
      else params.delete("budget_from");
    } else if (value) {
      params.set("budget_to", value);
    } else {
      params.delete("budget_to");
    }
    params.delete("page");
    navigate(`?${params.toString()}`, { replace: true });
  };

  const handleDateChange = (type, value) => {
    if (type === "start") setStartDate(value);
    else setEndDate(value);

    const params = new URLSearchParams(location.search);
    if (type === "start") {
      if (value) params.set("start_date_orders", value);
      else params.delete("start_date_orders");
    } else if (value) {
      params.set("end_date_orders", value);
    } else {
      params.delete("end_date_orders");
    }
    params.delete("page");
    navigate(`?${params.toString()}`, { replace: true });
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setSelectedStatus(params.get("status_order") || "Все статусы");
    setBudgetFrom(params.get("budget_from") || "");
    setBudgetTo(params.get("budget_to") || "");
    setStartDate(params.get("start_date_orders") || "");
    setEndDate(params.get("end_date_orders") || "");
  }, [location.search]);

  return (
    <AupFilterBlock title="Параметры заказа" icon="📋">
      <AupFilterSelect
        label="Статус заказа"
        options={ORDER_STATUS_OPTIONS}
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

function OrdersGrid({ onTotalChange }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchOrdersForAdmin = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const frontendParams = new URLSearchParams(location.search);
      const backendParams = new URLSearchParams();

      const paramMap = [
        ["category_work_slug", "category_work_slug"],
        ["country", "country"],
        ["region", "region"],
        ["town", "town"],
        ["status_order", "status_order"],
        ["budget_from", "budget_from"],
        ["budget_to", "budget_to"],
        ["start_date_orders", "start_date_orders"],
        ["end_date_orders", "end_date_orders"],
      ];

      paramMap.forEach(([frontKey, backKey]) => {
        const value = frontendParams.get(frontKey);
        if (value) backendParams.set(backKey, value);
      });

      const url = buildApiUrl("/orders_customer_admin", backendParams);
      const response = await apiFetch(url);

      if (!response.ok) {
        const detail = (await readApiError(response)) || `HTTP ${response.status}`;
        if (response.status === 403) {
          throw new Error(
            detail ||
              "Нет прав для просмотра заказов. Войдите под учётной записью с ролью admin или moderator.",
          );
        }
        throw new Error(detail);
      }

      const data = await response.json();
      const items = normalizeListResponse(data);
      setOrders(items);
      onTotalChange?.(items.length);
    } catch (err) {
      console.error("Ошибка загрузки заказов:", err);
      setError(err.message || "Не удалось загрузить заказы");
      setOrders([]);
      onTotalChange?.(0);
    } finally {
      setLoading(false);
    }
  }, [location.search, onTotalChange]);

  useEffect(() => {
    fetchOrdersForAdmin();
  }, [fetchOrdersForAdmin]);

  const openOrderProfile = (order) => {
    navigate(`/admin/manage_orders/${order.id}`, {
      state: { orderId: order.id },
    });
  };

  if (loading) {
    return (
      <div className="aup-list-grid">
        <AupListState variant="loading" message="Загрузка заказов…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="aup-list-grid">
        <AupListState variant="error" message={error} onRetry={fetchOrdersForAdmin} />
      </div>
    );
  }

  return (
    <>
      <p className="aup-list-count">
        Найдено: <strong>{orders.length}</strong> заказ(ов)
      </p>
      <div className="aup-list-grid">
        {orders.length === 0 ? (
          <AupListState
            variant="empty"
            emptyTitle="Заказы не найдены"
            message="Попробуйте изменить фильтры или сбросить параметры поиска"
          />
        ) : (
          orders.map((order) => (
            <AupOrderCard
              key={order.id}
              order={order}
              onClick={() => openOrderProfile(order)}
            />
          ))
        )}
      </div>
    </>
  );
}
