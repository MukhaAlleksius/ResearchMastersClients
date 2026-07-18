import React, { useState, useEffect, useCallback, useMemo } from "react";
import { API, apiFetch, normalizeListResponse, readApiError, resolveMediaUrl } from "../../../../../utils/api.js";
import CreatableSelect from "react-select/creatable";
import { useNavigate, useLocation } from "react-router-dom";
import {
  CATALOG_PAGE_SIZE,
  getCatalogPageFromSearch,
  getVisiblePageNumbers,
} from "../../../../../utils/pagination.js";
import "./manage_users.css";

const ROLE_LABELS = {
  admin: "Администратор",
  moderator: "Модератор",
  user: "Пользователь",
};

function useSearchParams() {
  const location = useLocation();
  return useMemo(() => new URLSearchParams(location.search), [location.search]);
}

function getInitials(firstName, lastName) {
  const a = (firstName || "").trim()[0] || "";
  const b = (lastName || "").trim()[0] || "";
  return (a + b).toUpperCase() || "?";
}

function formatRole(role) {
  return ROLE_LABELS[role] || role || "Пользователь";
}

export default function ManageUsersAdmin() {
  const [totalPages, setTotalPages] = useState(0);
  const [totalUsers, setTotalUsers] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(true);

  const handleTotalChange = useCallback((total, pages) => {
    setTotalUsers(total);
    setTotalPages(pages);
  }, []);

  const params = useSearchParams();
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (params.get("category_work")) count += 1;
    if (params.get("business_form")) count += 1;
    if (params.get("role")) count += 1;
    if (params.get("blocked")) count += 1;
    if (params.get("country")) count += 1;
    if (params.get("region")) count += 1;
    if (params.get("town")) count += 1;
    if (params.get("search")) count += 1;
    return count;
  }, [params]);

  return (
    <div className="manage-users-page">
      <header className="manage-users-hero">
        <div className="manage-users-hero__text">
          <span className="manage-users-hero__badge">Админ · Пользователи</span>
          <h1 className="manage-users-hero__title">Управление пользователями</h1>
          <p className="manage-users-hero__subtitle">
            Поиск, фильтрация и просмотр профилей зарегистрированных пользователей
          </p>
        </div>
        <div className="manage-users-hero__stats">
          <div className="manage-users-stat">
            <span className="manage-users-stat__value">{totalUsers}</span>
            <span className="manage-users-stat__label">найдено</span>
          </div>
          <div className="manage-users-stat">
            <span className="manage-users-stat__value">{activeFilterCount}</span>
            <span className="manage-users-stat__label">фильтров</span>
          </div>
        </div>
      </header>

      <UsersToolbar
        filtersOpen={filtersOpen}
        onToggleFilters={() => setFiltersOpen((v) => !v)}
        activeFilterCount={activeFilterCount}
      />

      {filtersOpen && <FiltersPanel />}

      <UsersGrid onTotalChange={handleTotalChange} />

      <UsersPagination totalPages={totalPages} />
    </div>
  );
}

function UsersToolbar({ filtersOpen, onToggleFilters, activeFilterCount }) {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useSearchParams();
  const [searchInput, setSearchInput] = useState(params.get("search") || "");

  useEffect(() => {
    setSearchInput(params.get("search") || "");
  }, [params]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = new URLSearchParams(location.search);
      const trimmed = searchInput.trim();
      if (trimmed) {
        next.set("search", trimmed);
      } else {
        next.delete("search");
      }
      next.delete("page");
      const current = params.get("search") || "";
      if (trimmed !== current) {
        navigate(`?${next.toString()}`, { replace: true });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput, location.search, navigate, params]);

  const clearFilters = () => {
    navigate("/admin/manage_users", { replace: true });
    setSearchInput("");
  };

  return (
    <div className="manage-users-toolbar">
      <div className="manage-users-search">
        <span className="manage-users-search__icon" aria-hidden="true">
          ⌕
        </span>
        <input
          type="search"
          className="manage-users-search__input"
          placeholder="Поиск по имени или email…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          aria-label="Поиск пользователей"
        />
      </div>

      <div className="manage-users-toolbar__actions">
        <button
          type="button"
          className={`manage-users-btn manage-users-btn--ghost ${filtersOpen ? "is-active" : ""}`}
          onClick={onToggleFilters}
        >
          Фильтры
          {activeFilterCount > 0 && (
            <span className="manage-users-btn__count">{activeFilterCount}</span>
          )}
        </button>
        {activeFilterCount > 0 && (
          <button
            type="button"
            className="manage-users-btn manage-users-btn--outline"
            onClick={clearFilters}
          >
            Сбросить
          </button>
        )}
      </div>
    </div>
  );
}

function FiltersPanel() {
  return (
    <section className="manage-users-filters" aria-label="Фильтры пользователей">
      <MainFilters />
      <GeographyFilters />
    </section>
  );
}

function MainFilters() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useSearchParams();

  const [selectedCategory, setSelectedCategory] = useState("Все категории");
  const [businessForms, setBusinessForms] = useState([]);
  const [categoriesData, setCategoriesData] = useState([]);
  const [categoriesWorks, setCategoriesWorks] = useState(["Все категории"]);
  const [businessFormName, setBusinessFormName] = useState(null);
  const [descriptionBusinessFormName, setDescriptionBusinessFormName] = useState("");
  const [roleUser, setRoleUser] = useState("");

  const updateParams = useCallback(
    (mutator) => {
      const next = new URLSearchParams(location.search);
      mutator(next);
      next.delete("page");
      navigate(`?${next.toString()}`, { replace: true });
    },
    [location.search, navigate],
  );

  useEffect(() => {
    const load = async () => {
      try {
        const [catRes, bfRes] = await Promise.all([
          apiFetch(`${API.baseURL}/categories_works_for_users`),
          apiFetch(`${API.baseURL}/business_form`),
        ]);
        if (catRes.ok) {
          const categories_data = await catRes.json();
          setCategoriesData(categories_data);
          setCategoriesWorks([
            "Все категории",
            ...categories_data.map((cat) => cat.name || "Без названия"),
          ]);
        }
        if (bfRes.ok) {
          setBusinessForms(await bfRes.json());
        }
      } catch (error) {
        console.error("Ошибка загрузки фильтров:", error);
      }
    };
    load();
  }, []);

  useEffect(() => {
    const categorySlug = params.get("category_work");
    if (categorySlug && categoriesData.length > 0) {
      const categoryData = categoriesData.find((cat) => cat.slug === categorySlug);
      setSelectedCategory(categoryData?.name || "Все категории");
    } else {
      setSelectedCategory("Все категории");
    }

    const businessForm = params.get("business_form");
    if (businessForm && businessForms.length > 0) {
      const bf = businessForms.find((b) => b.name === businessForm);
      if (bf) {
        setBusinessFormName({ value: bf.name, label: bf.name });
        setDescriptionBusinessFormName(bf.description || "");
      }
    } else {
      setBusinessFormName(null);
      setDescriptionBusinessFormName("");
    }

    setRoleUser(params.get("role") || "");
  }, [params, categoriesData, businessForms]);

  const businessFormOptions = businessForms.map((form) => ({
    value: form.name,
    label: form.name,
  }));

  const selectStyles = {
    control: (base, state) => ({
      ...base,
      minHeight: 42,
      borderRadius: 10,
      borderColor: state.isFocused ? "#2563eb" : "#e2e8f0",
      boxShadow: state.isFocused ? "0 0 0 3px rgba(37, 99, 235, 0.12)" : "none",
      "&:hover": { borderColor: "#cbd5e1" },
    }),
    menu: (base) => ({ ...base, borderRadius: 10, overflow: "hidden" }),
  };

  return (
    <div className="manage-users-filter-block">
      <h3 className="manage-users-filter-block__title">Основные</h3>
      <div className="manage-users-filter-grid">
        <FilterSelect
          label="Категория работ"
          options={categoriesWorks}
          value={selectedCategory}
          onChange={(categoryName) => {
            setSelectedCategory(categoryName);
            updateParams((next) => {
              if (categoryName === "Все категории") {
                next.delete("category_work");
              } else {
                const categoryData = categoriesData.find(
                  (cat) => cat.name === categoryName,
                );
                if (categoryData?.slug) next.set("category_work", categoryData.slug);
              }
            });
          }}
        />

        <div className="manage-users-field">
          <label className="manage-users-field__label">Форма бизнеса</label>
          <CreatableSelect
            options={businessFormOptions}
            value={businessFormName}
            onChange={(selectedOption) => {
              setBusinessFormName(selectedOption);
              const bf = businessForms.find((b) => b.name === selectedOption?.value);
              setDescriptionBusinessFormName(bf?.description || "");
              updateParams((next) => {
                if (!selectedOption?.value) next.delete("business_form");
                else next.set("business_form", selectedOption.value);
              });
            }}
            isClearable
            styles={selectStyles}
            placeholder="Любая форма"
            classNamePrefix="manage-users-select"
          />
          {descriptionBusinessFormName && (
            <p className="manage-users-field__hint">{descriptionBusinessFormName}</p>
          )}
        </div>

        <FilterSelect
          label="Тип пользователя"
          options={[
            "Любой",
            "Исполнитель",
            "Заказчик",
            "Ни исполнитель, ни заказчик",
          ]}
          value={roleUser || "Любой"}
          onChange={(value) => {
            setRoleUser(value === "Любой" ? "" : value);
            updateParams((next) => {
              if (!value || value === "Любой") next.delete("role");
              else next.set("role", value);
            });
          }}
        />

        <div className="manage-users-field manage-users-field--switch">
          <label className="manage-users-field__label">Только заблокированные</label>
          <label className="manage-users-switch">
            <input
              type="checkbox"
              checked={params.get("blocked") === "true"}
              onChange={() =>
                updateParams((next) => {
                  if (next.get("blocked") === "true") next.delete("blocked");
                  else next.set("blocked", "true");
                })
              }
            />
            <span className="manage-users-switch__slider" />
          </label>
        </div>
      </div>
    </div>
  );
}

function GeographyFilters() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useSearchParams();

  const [countries, setCountries] = useState([]);
  const [regions, setRegions] = useState([]);
  const [towns, setTowns] = useState([]);

  const updateParams = useCallback(
    (mutator) => {
      const next = new URLSearchParams(location.search);
      mutator(next);
      next.delete("page");
      navigate(`?${next.toString()}`, { replace: true });
    },
    [location.search, navigate],
  );

  const fetchRegions = async (countryId) => {
    const response = await apiFetch(`${API.baseURL}/countries/${countryId}/regions`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.map((region) => ({
      value: String(region.region_id || region.id),
      label: region.name_region || region.name,
    }));
  };

  const fetchTowns = async (regionId) => {
    const response = await apiFetch(`${API.baseURL}/regions/${regionId}/towns`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.map((town) => ({
      value: String(town.town_id || town.id || town),
      label: town.name_town || town.name || town,
    }));
  };

  useEffect(() => {
    apiFetch(`${API.baseURL}/countries`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) =>
        setCountries(
          data.map((country) => ({
            value: String(country.country_id || country.id),
            label: country.name_country || country.name,
          })),
        ),
      )
      .catch(() => setCountries([]));
  }, []);

  useEffect(() => {
    const countryName = params.get("country");
    const regionName = params.get("region");

    if (!countryName || countries.length === 0) {
      setRegions([]);
      setTowns([]);
      return;
    }

    const country = countries.find((c) => c.label === countryName);
    if (!country) return;

    fetchRegions(country.value).then(async (loadedRegions) => {
      setRegions(loadedRegions);
      if (!regionName) {
        setTowns([]);
        return;
      }
      const region = loadedRegions.find((r) => r.label === regionName);
      if (region) {
        setTowns(await fetchTowns(region.value));
      } else {
        setTowns([]);
      }
    });
  }, [params, countries]);

  const selectedCountry = countries.find((c) => c.label === params.get("country"));
  const selectedRegion = regions.find((r) => r.label === params.get("region"));
  const selectedTown = towns.find((t) => t.label === params.get("town"));

  return (
    <div className="manage-users-filter-block manage-users-filter-block--geo">
      <h3 className="manage-users-filter-block__title">География</h3>
      <div className="manage-users-filter-grid">
        <FilterSelect
          label="Страна"
          options={["Любая", ...countries.map((c) => c.label)]}
          value={selectedCountry?.label || "Любая"}
          onChange={async (label) => {
            const country = countries.find((c) => c.label === label);
            updateParams((next) => {
              next.delete("region");
              next.delete("town");
              if (!country) next.delete("country");
              else next.set("country", country.label);
            });
            if (country) setRegions(await fetchRegions(country.value));
            else {
              setRegions([]);
              setTowns([]);
            }
          }}
        />

        <FilterSelect
          label="Область"
          options={["Любая", ...regions.map((r) => r.label)]}
          value={selectedRegion?.label || "Любая"}
          disabled={!selectedCountry}
          onChange={async (label) => {
            const region = regions.find((r) => r.label === label);
            updateParams((next) => {
              next.delete("town");
              if (!region) next.delete("region");
              else next.set("region", region.label);
            });
            if (region) setTowns(await fetchTowns(region.value));
            else setTowns([]);
          }}
        />

        <FilterSelect
          label="Город"
          options={["Любой", ...towns.map((t) => t.label)]}
          value={selectedTown?.label || "Любой"}
          disabled={!selectedRegion}
          onChange={(label) => {
            const town = towns.find((t) => t.label === label);
            updateParams((next) => {
              if (!town) next.delete("town");
              else next.set("town", town.label);
            });
          }}
        />
      </div>
    </div>
  );
}

function FilterSelect({ label, options, value, onChange, disabled = false }) {
  return (
    <div className="manage-users-field">
      <label className="manage-users-field__label">{label}</label>
      <select
        className="manage-users-field__select"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((option) => (
          <option key={`${label}-${option}`} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

function UsersGrid({ onTotalChange }) {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useSearchParams();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const backendParams = new URLSearchParams();

      const mapKeys = [
        ["category_work", "category_work_slug"],
        ["country", "country"],
        ["region", "region"],
        ["town", "town"],
        ["business_form", "business_form"],
        ["role", "role_user"],
        ["search", "search"],
      ];

      mapKeys.forEach(([front, back]) => {
        const val = params.get(front);
        if (val) backendParams.set(back, val);
      });

      if (params.get("blocked") === "true") {
        backendParams.set("blocked", "true");
      }

      backendParams.set("page", String(getCatalogPageFromSearch(location.search)));
      backendParams.set("page_size", String(CATALOG_PAGE_SIZE));

      const response = await apiFetch(
        `${API.baseURL}/users_for_admin?${backendParams.toString()}`,
      );

      if (!response.ok) {
        const detail = (await readApiError(response)) || `HTTP ${response.status}`;
        if (response.status === 401) {
          throw new Error("Требуется вход в аккаунт");
        }
        if (response.status === 403) {
          throw new Error(
            detail ||
              "Недостаточно прав для просмотра пользователей. Войдите под учётной записью с ролью admin или moderator.",
          );
        }
        throw new Error(detail);
      }

      const data = await response.json();
      const items = normalizeListResponse(data);
      const total = Array.isArray(data) ? data.length : data?.total ?? items.length;
      const pages = Array.isArray(data)
        ? Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE))
        : data?.total_pages ?? 0;

      setUsers(items);
      onTotalChange?.(total, pages);
      setError(null);
    } catch (err) {
      console.error("Ошибка загрузки пользователей:", err);
      setError(err?.message || "Не удалось загрузить пользователей");
      setUsers([]);
      onTotalChange?.(0, 0);
    } finally {
      setLoading(false);
    }
  }, [location.search, onTotalChange]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  if (loading) {
    return (
      <div className="manage-users-state">
        <div className="manage-users-spinner" aria-hidden="true" />
        <p>Загрузка пользователей…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="manage-users-state manage-users-state--error">
        <p>{error}</p>
        <button type="button" className="manage-users-btn manage-users-btn--primary" onClick={fetchUsers}>
          Повторить
        </button>
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="manage-users-state">
        <div className="manage-users-state__icon" aria-hidden="true">
          👤
        </div>
        <h3>Пользователи не найдены</h3>
        <p>Попробуйте изменить фильтры или поисковый запрос</p>
      </div>
    );
  }

  return (
    <div className="manage-users-grid">
      {users.map((user) => (
        <article
          key={user.id}
          className="manage-users-card"
          onClick={() => navigate(`/admin/manage_users/${user.id}`)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              navigate(`/admin/manage_users/${user.id}`);
            }
          }}
          role="button"
          tabIndex={0}
          aria-label={`Профиль ${user.first_name} ${user.last_name}`}
        >
          <div className="manage-users-card__top">
            <div className="manage-users-card__avatar">
              {user.avatar_url ? (
                <img
                  src={resolveMediaUrl(user.avatar_url)}
                  alt=""
                  loading="lazy"
                />
              ) : (
                <span>{getInitials(user.first_name, user.last_name)}</span>
              )}
            </div>
            <div className="manage-users-card__meta">
              <h3 className="manage-users-card__name">
                {user.first_name} {user.last_name}
              </h3>
              {user.email && (
                <p className="manage-users-card__email">{user.email}</p>
              )}
            </div>
          </div>

          <div className="manage-users-card__location">
            {[user.town, user.region].filter(Boolean).join(", ") || "—"}
          </div>

          <div className="manage-users-card__badges">
            <span className="manage-users-badge manage-users-badge--role">
              {formatRole(user.role)}
            </span>
            <span
              className={`manage-users-badge ${
                user.blocked
                  ? "manage-users-badge--blocked"
                  : user.is_active === false
                    ? "manage-users-badge--inactive"
                    : "manage-users-badge--active"
              }`}
            >
              {user.blocked
                ? "Заблокирован"
                : user.is_active === false
                  ? "Неактивен"
                  : "Активен"}
            </span>
          </div>

          <div className="manage-users-card__footer">
            <span>ID {user.id}</span>
            <span className="manage-users-card__link">Открыть профиль →</span>
          </div>
        </article>
      ))}
    </div>
  );
}

function UsersPagination({ totalPages }) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPage = getCatalogPageFromSearch(location.search);
  const visiblePages = getVisiblePageNumbers(currentPage, totalPages);

  if (totalPages <= 1) return null;

  const handlePageChange = (page) => {
    const next = new URLSearchParams(location.search);
    next.set("page", String(page));
    navigate(`?${next.toString()}`, { replace: true });
  };

  return (
    <nav className="manage-users-pagination" aria-label="Пагинация пользователей">
      <button
        type="button"
        className="manage-users-page-btn"
        disabled={currentPage === 1}
        onClick={() => currentPage > 1 && handlePageChange(currentPage - 1)}
        aria-label="Предыдущая страница"
      >
        ←
      </button>
      {visiblePages.map((page) => (
        <button
          key={page}
          type="button"
          className={`manage-users-page-btn ${currentPage === page ? "is-active" : ""}`}
          onClick={() => handlePageChange(page)}
          aria-current={currentPage === page ? "page" : undefined}
        >
          {page}
        </button>
      ))}
      <button
        type="button"
        className="manage-users-page-btn"
        disabled={currentPage >= totalPages}
        onClick={() => currentPage < totalPages && handlePageChange(currentPage + 1)}
        aria-label="Следующая страница"
      >
        →
      </button>
    </nav>
  );
}
