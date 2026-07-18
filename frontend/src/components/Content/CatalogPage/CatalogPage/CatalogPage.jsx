import React, { useState, useEffect } from "react";
import { API, apiFetch, buildApiUrl, resolveMediaUrl } from "../../../../utils/api.js";
import { Link, useNavigate, useLocation } from "react-router-dom";
import CatalogPagination from "../../shared/CatalogPagination";
import FiltersShell from "../../shared/FiltersShell";
import { CATALOG_PAGE_SIZE, getCatalogPageFromSearch } from "../../../../utils/pagination";
import "../../shared/public_content_layout.css";
import "./catalog_page.css";
function Catalog() {
  const [totalPages, setTotalPages] = useState(0);

  return (
    <div id="catalog" className="catalog-page public-content-narrow">
      <div className="catalog-container">
        <div className="catalog-top">
          <header className="catalog-hero">
            <span className="catalog-hero__badge">Каталог</span>
            <h1 className="catalog-title">Исполнители</h1>
            <p className="catalog-hero__text">
              Фильтруйте по категории, рейтингу, цене и городу — выберите
              подходящего мастера
            </p>
          </header>
          <Filters />
        </div>
        <ExecutorsGrid onTotalPagesChange={setTotalPages} />
        <CatalogPagination totalPages={totalPages} />
      </div>
    </div>
  );
}

// ✅ ЧИСТЫЙ MainFilters БЕЗ ТРАНСЛИТЕРАЦИИ
function MainFilters() {
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = useState("Все категории");
  const [minRating, setMinRating] = useState("Любой");
  const [maxPrice, setMaxPrice] = useState("");
  const [categoriesData, setCategoriesData] = useState([]); // Полные объекты {name, slug}
  const [categoriesWorks, setCategoriesWorks] = useState([]);
  const [isUserInteraction, setIsUserInteraction] = useState(false);

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
        console.log("✅ Категория из URL:", categoryData.name);
      } else {
        setSelectedCategory("Все категории");
      }
    } else {
      setSelectedCategory("Все категории");
    }
  }, [location.search, location.state, categoriesData, isUserInteraction]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const ratingParam = params.get("min_rating");
    const ratingMap = {
      4.5: "4.5★ и выше",
      "4.0": "4.0★ и выше",
      3.5: "3.5★ и выше",
    };
    if (ratingParam && ratingMap[ratingParam])
      setMinRating(ratingMap[ratingParam]);

    const priceParam = params.get("max_price");
    if (priceParam) setMaxPrice(priceParam);
  }, [location.search]);

  useEffect(() => {
    if (!isUserInteraction) return;
    const timer = setTimeout(() => setIsUserInteraction(false), 100);
    return () => clearTimeout(timer);
  }, [selectedCategory]);

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
        console.log("✅ Slug в URL:", categoryData.slug);
      }
    }
    params.delete("page");
    navigate(`?${params.toString()}`, { replace: true, state: null });
  };

  const handleRatingChange = (rating) => {
    setMinRating(rating);
    const params = new URLSearchParams(location.search);
    if (rating === "Любой") {
      params.delete("min_rating");
    } else {
      const ratingMap = {
        "4.5★ и выше": "4.5",
        "4.0★ и выше": "4.0",
        "3.5★ и выше": "3.5",
      };
      params.set("min_rating", ratingMap[rating]);
    }
    params.delete("page");
    navigate(`?${params.toString()}`, { replace: true });
  };

  const handlePriceChange = (value) => {
    setMaxPrice(value);
    const params = new URLSearchParams(location.search);
    if (!value || value === "") {
      params.delete("max_price");
    } else {
      params.set("max_price", value);
    }
    params.delete("page");
    navigate(`?${params.toString()}`, { replace: true });
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
        <FilterSelect
          label="Рейтинг от"
          options={["Любой", "4.5★ и выше", "4.0★ и выше", "3.5★ и выше"]}
          value={minRating}
          onChange={handleRatingChange}
        />
        <div className="filter-field filter-price">
          <label className="input-label">Цена до</label>
          <input
            type="number"
            placeholder="Укажите бюджет"
            className="input-field"
            value={maxPrice}
            onChange={(e) => handlePriceChange(e.target.value)}
          />
        </div>
      </div>
    </div>
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

function Filters() {
  return (
    <FiltersShell>
      <MainFilters />
      <GeographyFilters />
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

function executorProfileSlug(executor) {
  return `${executor.first_name}-${executor.last_name}`
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 50);
}

function ExecutorsGrid({ onTotalPagesChange }) {
  const location = useLocation();
  const [executors, setExecutors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchProfilesExecutorsForCards = async () => {
    try {
      setLoading(true);
      const frontendParams = new URLSearchParams(location.search);
      const backendParams = new URLSearchParams();

      const categorySlug = frontendParams.get("category_work");
      if (categorySlug) backendParams.set("category_work_slug", categorySlug);

      if (frontendParams.get("country"))
        backendParams.set("country", frontendParams.get("country"));
      if (frontendParams.get("region"))
        backendParams.set("region", frontendParams.get("region"));
      if (frontendParams.get("town"))
        backendParams.set("town", frontendParams.get("town"));
      if (frontendParams.get("max_price"))
        backendParams.set("max_cost", frontendParams.get("max_price"));
      if (frontendParams.get("min_rating"))
        backendParams.set("min_rating", frontendParams.get("min_rating"));

      backendParams.set("page", String(getCatalogPageFromSearch(location.search)));
      backendParams.set("page_size", String(CATALOG_PAGE_SIZE));

      const url = buildApiUrl("/profiles_executors_for_cards", backendParams);
      console.log("📡 Backend запрос:", url);

      const response = await apiFetch(url);
      if (!response.ok)
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const data = await response.json();
      setExecutors(Array.isArray(data.items) ? data.items : []);
      onTotalPagesChange?.(data.total_pages || 0);
      setError(null);
    } catch (error) {
      console.error("Ошибка загрузки исполнителей:", error);
      setError("Не удалось загрузить исполнителей");
      setExecutors([]);
      onTotalPagesChange?.(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfilesExecutorsForCards();
  }, [location.search]);

  if (loading) {
    return (
      <div className="catalog-state catalog-state--loading">
        <div className="catalog-state__spinner" aria-hidden="true" />
        <p>Загрузка исполнителей…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="catalog-state catalog-state--error">
        <p>{error}</p>
        <button
          type="button"
          onClick={fetchProfilesExecutorsForCards}
          className="catalog-state__retry"
        >
          Попробовать снова
        </button>
      </div>
    );
  }

  return (
    <div className="executors-grid">
      {executors.length === 0 ? (
        <div className="catalog-state catalog-state--empty">
          <p>Исполнители не найдены</p>
          <span>Измените фильтры или выберите другую категорию</span>
        </div>
      ) : (
        executors.map((executor) => {
          const slug = executorProfileSlug(executor);
          return (
          <Link
            key={executor.id}
            to={`/profile/${slug}?id=${executor.id}`}
            state={{
              executorId: executor.id,
              first_name: executor.first_name,
              last_name: executor.last_name,
              short_review_master: executor.short_review_master,
              country: executor.country,
              region: executor.region,
              town: executor.town,
              operating_mode: executor.operating_mode,
            }}
            className="executor-card catalog-card"
          >
            <div className="executor-content">
              <div className="executor-header">
                <div className="executor-avatar-wrapper">
                  {executor.avatar_url ? (
                    <img
                      src={resolveMediaUrl(executor.avatar_url)}
                      alt={`${executor.first_name} ${executor.last_name}`}
                      className="executor-avatar-img"
                      loading="lazy"
                    />
                  ) : (
                    <div className="executor-avatar-placeholder">
                      <i className="fas fa-user" aria-hidden="true" />
                    </div>
                  )}
                </div>
                <div className="executor-info">
                  <h3 className="executor-name">
                    {executor.first_name} {executor.last_name}
                  </h3>
                  <p className="executor-description">
                    {executor.short_review_master || "Опытный исполнитель"}
                  </p>
                </div>
              </div>
              <div className="executor-location">
                <span className="executor-location__icon" aria-hidden="true">
                  📍
                </span>
                {executor.town}, {executor.region}
              </div>
              <div className="executor-rating">
                <div className="stars" aria-hidden="true">
                  ★★★★☆
                </div>
                <span className="rating-text">4.8 · 12 отзывов</span>
              </div>
              <div className="executor-footer">
                <div className="executor-price">
                  {executor.operating_mode || "Договорная"}
                </div>
                <span className="executor-card__cta catalog-card__cta">Выбрать</span>
              </div>
            </div>
          </Link>
        );
        })
      )}
    </div>
  );
}

export default Catalog;
