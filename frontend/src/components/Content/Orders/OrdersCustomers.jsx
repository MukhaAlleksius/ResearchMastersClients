import React, { useState, useEffect } from "react";
import { apiFetch, buildApiUrl } from "../../../utils/api.js";
import { Link, useNavigate, useLocation } from "react-router-dom";
import CatalogPagination from "../shared/CatalogPagination";
import FiltersShell from "../shared/FiltersShell";
import { CATALOG_PAGE_SIZE, getCatalogPageFromSearch } from "../../../utils/pagination";
import { buildOrderPath } from "../../../utils/orderSlug.js";
import {
  dedupeOrdersById,
  formatExecutorResponses,
  moveOrderToFront,
} from "../../../utils/orders.js";
import { formatMoney } from "../../../utils/currency.js";
import { IconClipboard, IconPin } from "../Profile/ProfileIcons.jsx";
import "../shared/public_content_layout.css";
import "./orders_customers.css";

function isMineOrdersView(search) {
  return new URLSearchParams(search).get("mine") === "1";
}

const SEARCHING_EXECUTOR_STATUS = "В поиске исполнителя";

function CatalogOrdersCustomers({ openModal }) {
  const [totalPages, setTotalPages] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();
  const showMine = isMineOrdersView(location.search);
  const hasActiveFilters = (() => {
    const params = new URLSearchParams(location.search);
    params.delete("page");
    params.delete("mine");
    return [...params.keys()].length > 0;
  })();

  const resetFilters = () => {
    navigate(showMine ? `${location.pathname}?mine=1` : location.pathname, {
      replace: true,
    });
  };

  const handleToggleMine = () => {
    if (showMine) {
      navigate("/orders");
      return;
    }
    navigate("/orders?mine=1");
    if (!localStorage.getItem("access_token")) {
      try {
        sessionStorage.setItem("auth_return_to", "/orders?mine=1");
      } catch {
        // ignore storage errors
      }
      openModal?.("loginModal");
    }
  };

  return (
    <div
      id="catalog-orders"
      className="catalog-page catalog-page--orders public-content-narrow"
    >
      <div className="catalog-container">
        <header className="catalog-hero">
          <span className="catalog-hero__badge">
            {showMine ? "Ваши заказы" : "Для исполнителей"}
          </span>
          <h1 className="catalog-title">
            {showMine ? "Мои заказы" : "Каталог заказов"}
          </h1>
          <p className="catalog-hero__text">
            {showMine
              ? "Ваши заказы в поиске исполнителя"
              : "Найдите подходящие задачи от заказчиков и откликнитесь на интересные предложения"}
          </p>
        </header>
        <div className="catalog-list-toolbar">
          <p className="catalog-list-toolbar__meta">
            {showMine ? "Мои заказы" : "Список заказов"}
          </p>
          <div className="catalog-list-toolbar__actions">
            <button
              type="button"
              className={`catalog-mine-btn${showMine ? " is-active" : ""}`}
              onClick={handleToggleMine}
              aria-pressed={showMine}
            >
              <IconClipboard width={14} height={14} />
              {showMine ? "Все заказы" : "Мои заказы"}
            </button>
            <Link to="/add_order" className="catalog-add-order-btn">
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                aria-hidden="true"
              >
                <path
                  d="M12 5v14M5 12h14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
              </svg>
              Разместить заказ
            </Link>
            {!showMine && hasActiveFilters && (
              <button
                type="button"
                className="catalog-reset-filters"
                onClick={resetFilters}
              >
                Сбросить фильтры
              </button>
            )}
            {!showMine && <FiltersOrders />}
          </div>
        </div>
        <OrdersGrid
          onTotalPagesChange={setTotalPages}
          hasActiveFilters={hasActiveFilters}
          onResetFilters={resetFilters}
          showMine={showMine}
          openModal={openModal}
        />
        {!showMine && <CatalogPagination totalPages={totalPages} />}
      </div>
    </div>
  );
}

// ✅ ИСПРАВЛЕННЫЙ MainFiltersOrders БЕЗ ТРАНСЛИТЕРАЦИИ
function MainFiltersOrders() {
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = useState("Все категории");
  const [categoriesData, setCategoriesData] = useState([]); // ✅ Полные объекты {name, slug}
  const [categoriesWorks, setCategoriesWorks] = useState([]);
  const [isUserInteraction, setIsUserInteraction] = useState(false);

  const fetchCategoriesWorks = async () => {
    try {
      const response = await apiFetch(
        buildApiUrl("/categories_works_for_users"),
      );
      if (!response.ok) throw new Error("Ошибка получения данных");
      const categories_data = await response.json();

      setCategoriesData(categories_data); // ✅ Сохраняем полные объекты
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

  // ✅ Точный поиск по slug из API
  useEffect(() => {
    if (isUserInteraction || categoriesData.length === 0) return;

    const params = new URLSearchParams(location.search);
    const categorySlug = params.get("category_work");

    if (location.state?.categoryTitle) {
      setSelectedCategory(location.state.categoryTitle);
      return;
    }

    if (categorySlug) {
      const categoryData = categoriesData.find(
        (cat) => cat.slug === categorySlug,
      );
      if (categoryData) {
        setSelectedCategory(categoryData.name);
        console.log("✅ Категория заказа из URL:", categoryData.name);
      } else {
        setSelectedCategory("Все категории");
      }
    } else {
      setSelectedCategory("Все категории");
    }
  }, [location.search, location.state, categoriesData, isUserInteraction]);

  useEffect(() => {
    if (!isUserInteraction) return;
    const timer = setTimeout(() => setIsUserInteraction(false), 100);
    return () => clearTimeout(timer);
  }, [selectedCategory]);

  // ✅ Имя категории → slug из API
  const handleCategoryChange = (categoryName) => {
    setIsUserInteraction(true);
    setSelectedCategory(categoryName);

    const params = new URLSearchParams(location.search);

    if (categoryName === "Все категории") {
      params.delete("category_work");
    } else {
      const categoryData = categoriesData.find(
        (cat) => cat.name === categoryName,
      );
      if (categoryData?.slug) {
        params.set("category_work", categoryData.slug);
        console.log("✅ Slug заказа в URL:", categoryData.slug);
      }
    }
    params.delete("page");
    navigate(`?${params.toString()}`, { replace: true, state: null });
  };

  return (
    <div className="filters-section">
      <p className="filters-section__title">Параметры</p>
      <div className="filters-grid">
        <FilterSelect
          key={`category-${categoriesData.length}-${selectedCategory}`}
          label="Категория"
          options={categoriesWorks}
          value={selectedCategory}
          onChange={handleCategoryChange}
        />
      </div>
    </div>
  );
}

function GeographyFiltersOrders() {
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
    <div className="filters-section">
      <p className="filters-section__title">Местоположение</p>
      <div className="filters-grid">
        <div className="filter-field">
          <label className="input-label">Страна</label>
          <select
            className="select-field"
            value={geoCountry?.value || ""}
            onChange={(e) =>
              handleSelectCountry({
                value: e.target.value,
                label: e.target.options[e.target.selectedIndex].text,
              })
            }
          >
            <option value="">Любой</option>
            {countries.map((country) => (
              <option key={country.value} value={country.value}>
                {country.label}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-field">
          <label className="input-label">Область</label>
          <select
            className="select-field"
            value={geoRegion?.value || ""}
            onChange={(e) =>
              handleSelectRegion({
                value: e.target.value,
                label: e.target.options[e.target.selectedIndex].text,
              })
            }
            disabled={!geoCountry}
          >
            <option value="">Любой</option>
            {regions.map((region) => (
              <option key={region.value} value={region.value}>
                {region.label}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-field">
          <label className="input-label">Город</label>
          <select
            className="select-field"
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
      </div>
    </div>
  );
}

function FiltersOrders() {
  return (
    <FiltersShell>
      <MainFiltersOrders />
      <GeographyFiltersOrders />
    </FiltersShell>
  );
}

function FilterSelect({ label, options, value, onChange }) {
  return (
    <div className="filter-field">
      <label className="input-label">{label}</label>
      <select
        className="select-field"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((option, idx) => (
          <option key={`${label}-${idx}`} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

function OrderCatalogCard({
  order,
  returnTo,
  to,
  ctaLabel = "Подробнее",
  highlighted = false,
}) {
  const linkTo = to || buildOrderPath(order);
  const linkState = { orderId: order.id, order, returnTo };

  const locationLabel = [order.country, order.region, order.town]
    .filter(Boolean)
    .join(", ");

  const budgetLabel =
    order.budget != null && Number(order.budget) > 0
      ? formatMoney(order.budget, order.currency || "BYN")
      : "Сумма неизвестна";

  return (
    <Link
      to={linkTo}
      state={linkState}
      className={`order-card catalog-card${highlighted ? " order-card--highlight" : ""}`}
    >
      <div className="order-card__body">
        <div className="order-card__top">
          <span className="order-card__category">
            {order.category_work || "Без категории"}
          </span>
        </div>

        <h3 className="order-card__title" title={order.title}>
          {order.title}
        </h3>

        <p className="order-card__description" title={order.description || undefined}>
          {order.description || "Описание не указано"}
        </p>

        <p className="order-card__location" title={locationLabel || undefined}>
          <IconPin width={14} height={14} />
          <span>{locationLabel || "Локация не указана"}</span>
        </p>

        <div className="order-card__chips">
          {order.insurance_required && (
            <span className="order-card__chip order-card__chip--insurance">
              <span className="order-card__chip-label">Страховка</span>
              <span className="order-card__chip-value">Требуется</span>
            </span>
          )}
          <span className="order-card__chip order-card__chip--responses">
            <span className="order-card__chip-label">Отклики</span>
            <span className="order-card__chip-value">
              {formatExecutorResponses(order.responses_count)}
            </span>
          </span>
        </div>

        <div className="order-card__footer">
          <div className="order-card__budget">
            <span className="order-card__budget-label">Прим. сумма</span>
            <span className="order-card__budget-value">{budgetLabel}</span>
          </div>
          <span className="order-card__cta catalog-card__cta">
            {ctaLabel}
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path
                d="M9 6l6 6-6 6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </div>
      </div>
    </Link>
  );
}

function OrdersGrid({
  onTotalPagesChange,
  hasActiveFilters = false,
  onResetFilters,
  showMine = false,
  openModal,
}) {
  const location = useLocation();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [needsLogin, setNeedsLogin] = useState(false);

  const fetchOrdersCustomers = async () => {
    try {
      setLoading(true);
      setNeedsLogin(false);

      if (showMine) {
        if (!localStorage.getItem("access_token")) {
          setOrders([]);
          setError(null);
          setNeedsLogin(true);
          onTotalPagesChange?.(0);
          return;
        }

        const response = await apiFetch(buildApiUrl("/orders_customer"));
        if (response.status === 401) {
          setOrders([]);
          setError(null);
          setNeedsLogin(true);
          onTotalPagesChange?.(0);
          return;
        }
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        const items = Array.isArray(data) ? data : data.items || [];
        const searching = items.filter(
          (order) => order.status_order_customer === SEARCHING_EXECUTOR_STATUS,
        );
        setOrders(dedupeOrdersById(searching));
        onTotalPagesChange?.(0);
        setError(null);
        return;
      }

      const frontendParams = new URLSearchParams(location.search);
      const backendParams = new URLSearchParams();

      // ✅ category_work → category_work_slug
      const categorySlug = frontendParams.get("category_work");
      if (categorySlug) backendParams.set("category_work_slug", categorySlug);

      if (frontendParams.get("country"))
        backendParams.set("country", frontendParams.get("country"));
      if (frontendParams.get("region"))
        backendParams.set("region", frontendParams.get("region"));
      if (frontendParams.get("town"))
        backendParams.set("town", frontendParams.get("town"));

      backendParams.set("page", String(getCatalogPageFromSearch(location.search)));
      backendParams.set("page_size", String(CATALOG_PAGE_SIZE));

      const url = buildApiUrl("/orders_customers", backendParams);
      console.log("📡 Backend запрос:", url);

      const response = await apiFetch(url);
      if (!response.ok)
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const data = await response.json();
      const items = Array.isArray(data.items) ? data.items : [];
      setOrders(
        moveOrderToFront(dedupeOrdersById(items), location.state?.highlightOrderId),
      );
      onTotalPagesChange?.(data.total_pages || 0);
      setError(null);
    } catch (error) {
      console.error("Ошибка загрузки заказов:", error);
      setError(
        showMine
          ? "Не удалось загрузить ваши заказы"
          : "Не удалось загрузить заказы",
      );
      setOrders([]);
      onTotalPagesChange?.(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrdersCustomers();
  }, [location.search, showMine]);

  const highlightOrderId = location.state?.highlightOrderId;
  const returnTo = `${location.pathname}${location.search}`;

  if (loading) {
    return (
      <div className="orders-grid">
        <div className="loading-placeholder">
          <div className="catalog-order-detail__spinner" aria-hidden="true" />
          <p>Загрузка заказов…</p>
        </div>
      </div>
    );
  }

  if (needsLogin) {
    return (
      <div className="orders-grid">
        <div className="empty-state">
          <div className="empty-state__icon" aria-hidden="true">
            <IconClipboard width={28} height={28} />
          </div>
          <p className="empty-state__title">Войдите, чтобы увидеть свои заказы</p>
          <p className="empty-state__text">
            Карточки ваших заказов доступны после входа в аккаунт
          </p>
          <button
            type="button"
            className="empty-state__reset"
            onClick={() => openModal?.("loginModal")}
          >
            Войти
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="orders-grid">
        <div className="error-placeholder">
          <p>{error}</p>
          <button
            type="button"
            onClick={fetchOrdersCustomers}
            className="retry-button"
          >
            Попробовать снова
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="orders-grid">
      {orders.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon" aria-hidden="true">
            <IconClipboard width={28} height={28} />
          </div>
          <p className="empty-state__title">
            {showMine
              ? "Нет заказов в поиске исполнителя"
              : "Заказы не найдены"}
          </p>
          <p className="empty-state__text">
            {showMine
              ? "Опубликуйте заказ — он появится здесь, пока исполнители могут откликаться"
              : hasActiveFilters
                ? "Измените параметры поиска или сбросьте фильтры"
                : "Пока нет подходящих заказов"}
          </p>
          {showMine ? (
            <Link to="/add_order" className="empty-state__reset">
              Разместить заказ
            </Link>
          ) : (
            hasActiveFilters &&
            onResetFilters && (
              <button
                type="button"
                className="empty-state__reset"
                onClick={onResetFilters}
              >
                Сбросить фильтры
              </button>
            )
          )}
        </div>
      ) : (
        orders.map((order) => (
          <OrderCatalogCard
            key={order.id}
            order={order}
            returnTo={returnTo}
            to={showMine ? `/profile/orders/${order.id}` : undefined}
            ctaLabel={showMine ? "Открыть" : "Подробнее"}
            highlighted={Number(order.id) === Number(highlightOrderId)}
          />
        ))
      )}
    </div>
  );
}

export default CatalogOrdersCustomers;
