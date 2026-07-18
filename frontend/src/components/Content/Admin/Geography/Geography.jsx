import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  FaGlobeAmericas,
  FaMapMarkedAlt,
  FaCity,
  FaSearch,
  FaPen,
  FaMap,
} from "react-icons/fa";
import { API, apiFetch } from "../../../../utils/api.js";
import "./geography.css";

function useFlashMessage(timeout = 3500) {
  const [message, setMessage] = useState({ type: "", text: "" });

  const show = useCallback(
    (type, text) => {
      setMessage({ type, text });
      if (text) {
        setTimeout(() => setMessage({ type: "", text: "" }), timeout);
      }
    },
    [timeout],
  );

  return [message, show];
}

export default function AdminCountriesRegionsTowns() {
  const [countries, setCountries] = useState([]);
  const [selectedCountryId, setSelectedCountryId] = useState(null);
  const [selectedRegionId, setSelectedRegionId] = useState(null);
  const [towns, setTowns] = useState([]);

  const [loadingCountries, setLoadingCountries] = useState(true);
  const [loadingRegions, setLoadingRegions] = useState(false);
  const [loadingTowns, setLoadingTowns] = useState(false);
  const [saving, setSaving] = useState(false);

  const [inputCountry, setInputCountry] = useState("");
  const [inputRegion, setInputRegion] = useState("");
  const [inputTown, setInputTown] = useState("");

  const [editCountryId, setEditCountryId] = useState(null);
  const [editRegionId, setEditRegionId] = useState(null);
  const [editTownId, setEditTownId] = useState(null);

  const [searchCountry, setSearchCountry] = useState("");
  const [searchRegion, setSearchRegion] = useState("");
  const [searchTown, setSearchTown] = useState("");

  const [flash, showFlash] = useFlashMessage();

  const selectedCountry = useMemo(
    () => countries.find((c) => c.country_id === selectedCountryId) || null,
    [countries, selectedCountryId],
  );

  const regions = selectedCountry?.regions || [];

  const selectedRegion = useMemo(
    () => regions.find((r) => r.region_id === selectedRegionId) || null,
    [regions, selectedRegionId],
  );

  const fetchCountries = useCallback(async () => {
    try {
      setLoadingCountries(true);
      const res = await apiFetch(`${API.baseURL}/countries`);
      if (!res.ok) throw new Error("Не удалось загрузить список стран");
      const data = await res.json();
      setCountries(Array.isArray(data) ? data : []);
    } catch (e) {
      showFlash("error", e.message);
    } finally {
      setLoadingCountries(false);
    }
  }, [showFlash]);

  const fetchRegions = useCallback(
    async (countryId) => {
      if (!countryId) return;
      try {
        setLoadingRegions(true);
        const res = await apiFetch(
          `${API.baseURL}/countries/${countryId}/regions`,
        );
        if (!res.ok) throw new Error("Не удалось загрузить регионы");
        const data = await res.json();
        setCountries((prev) =>
          prev.map((c) =>
            c.country_id === countryId ? { ...c, regions: data } : c,
          ),
        );
      } catch (e) {
        showFlash("error", e.message);
      } finally {
        setLoadingRegions(false);
      }
    },
    [showFlash],
  );

  const fetchTowns = useCallback(
    async (regionId) => {
      if (!regionId) return;
      try {
        setLoadingTowns(true);
        const res = await apiFetch(
          `${API.baseURL}/regions/${regionId}/towns`,
        );
        if (!res.ok) throw new Error("Не удалось загрузить города");
        const data = await res.json();
        setTowns(Array.isArray(data) ? data : []);
      } catch (e) {
        showFlash("error", e.message);
      } finally {
        setLoadingTowns(false);
      }
    },
    [showFlash],
  );

  useEffect(() => {
    fetchCountries();
  }, [fetchCountries]);

  const selectCountry = (countryId) => {
    setSelectedCountryId(countryId);
    setSelectedRegionId(null);
    setTowns([]);
    setInputRegion("");
    setInputTown("");
    setEditRegionId(null);
    setEditTownId(null);
    setSearchRegion("");
    setSearchTown("");
    const country = countries.find((c) => c.country_id === countryId);
    if (!country?.regions) fetchRegions(countryId);
  };

  const selectRegion = (regionId) => {
    setSelectedRegionId(regionId);
    setInputTown("");
    setEditTownId(null);
    setSearchTown("");
    fetchTowns(regionId);
  };

  const resetCountryForm = () => {
    setInputCountry("");
    setEditCountryId(null);
  };

  const resetRegionForm = () => {
    setInputRegion("");
    setEditRegionId(null);
  };

  const resetTownForm = () => {
    setInputTown("");
    setEditTownId(null);
  };

  const startEditCountry = (country, e) => {
    e.stopPropagation();
    setEditCountryId(country.country_id);
    setInputCountry(country.name_country);
  };

  const startEditRegion = (region, e) => {
    e.stopPropagation();
    setEditRegionId(region.region_id);
    setInputRegion(region.name_region);
  };

  const startEditTown = (town) => {
    setEditTownId(town.town_id);
    setInputTown(town.name_town);
  };

  const saveCountry = async (e) => {
    e.preventDefault();
    const name = inputCountry.trim();
    if (!name) return;

    try {
      setSaving(true);
      const isEdit = editCountryId !== null;
      const res = await apiFetch(
        `${API.baseURL}/${isEdit ? "edit_country" : "add_country"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isEdit
              ? { country_id: editCountryId, name_country: name }
              : { name_country: name },
          ),
        },
      );
      if (!res.ok) throw new Error("Не удалось сохранить страну");
      await fetchCountries();
      resetCountryForm();
      showFlash("success", isEdit ? "Страна обновлена" : "Страна добавлена");
    } catch (err) {
      showFlash("error", err.message);
    } finally {
      setSaving(false);
    }
  };

  const saveRegion = async (e) => {
    e.preventDefault();
    const name = inputRegion.trim();
    if (!name || !selectedCountryId) return;

    try {
      setSaving(true);
      const isEdit = editRegionId !== null;
      const res = await apiFetch(
        `${API.baseURL}/${isEdit ? "edit_region" : "add_region"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isEdit
              ? {
                  region_id: editRegionId,
                  name_region: name,
                  country_id: selectedCountryId,
                }
              : { name_region: name, country_id: selectedCountryId },
          ),
        },
      );
      if (!res.ok) throw new Error("Не удалось сохранить регион");
      await fetchRegions(selectedCountryId);
      resetRegionForm();
      showFlash("success", isEdit ? "Регион обновлён" : "Регион добавлен");
    } catch (err) {
      showFlash("error", err.message);
    } finally {
      setSaving(false);
    }
  };

  const saveTown = async (e) => {
    e.preventDefault();
    const name = inputTown.trim();
    if (!name || !selectedRegionId) return;

    try {
      setSaving(true);
      const isEdit = editTownId !== null;
      const res = await apiFetch(
        `${API.baseURL}/${isEdit ? "edit_town" : "add_town"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isEdit
              ? {
                  town_id: editTownId,
                  name_town: name,
                  region_id: selectedRegionId,
                }
              : { name_town: name, region_id: selectedRegionId },
          ),
        },
      );
      if (!res.ok) throw new Error("Не удалось сохранить город");
      await fetchTowns(selectedRegionId);
      resetTownForm();
      showFlash("success", isEdit ? "Город обновлён" : "Город добавлен");
    } catch (err) {
      showFlash("error", err.message);
    } finally {
      setSaving(false);
    }
  };

  const filteredCountries = useMemo(() => {
    const q = searchCountry.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter((c) =>
      c.name_country.toLowerCase().includes(q),
    );
  }, [countries, searchCountry]);

  const filteredRegions = useMemo(() => {
    const q = searchRegion.trim().toLowerCase();
    if (!q) return regions;
    return regions.filter((r) => r.name_region.toLowerCase().includes(q));
  }, [regions, searchRegion]);

  const filteredTowns = useMemo(() => {
    const q = searchTown.trim().toLowerCase();
    if (!q) return towns;
    return towns.filter((t) => t.name_town.toLowerCase().includes(q));
  }, [towns, searchTown]);

  return (
    <div className="geo-page">
      <header className="geo-hero">
        <div className="geo-hero__text">
          <span className="geo-hero__badge">Админ · География</span>
          <h1 className="geo-hero__title">Страны, области и города</h1>
          <p className="geo-hero__subtitle">
            Управление справочником географии для фильтров, профилей и заказов
          </p>
        </div>
        <div className="geo-hero__stats">
          <div className="geo-stat">
            <span className="geo-stat__value">{countries.length}</span>
            <span className="geo-stat__label">стран</span>
          </div>
          <div className="geo-stat">
            <span className="geo-stat__value">{regions.length}</span>
            <span className="geo-stat__label">регионов</span>
          </div>
          <div className="geo-stat">
            <span className="geo-stat__value">{towns.length}</span>
            <span className="geo-stat__label">городов</span>
          </div>
        </div>
      </header>

      <nav className="geo-breadcrumb" aria-label="Навигация по географии">
        <button
          type="button"
          className={`geo-breadcrumb__item ${!selectedCountry ? "geo-breadcrumb__item--active" : ""}`}
          onClick={() => {
            setSelectedCountryId(null);
            setSelectedRegionId(null);
            setTowns([]);
          }}
        >
          Все страны
        </button>
        {selectedCountry && (
          <>
            <span className="geo-breadcrumb__sep" aria-hidden="true">
              /
            </span>
            <button
              type="button"
              className={`geo-breadcrumb__item ${!selectedRegion ? "geo-breadcrumb__item--active" : ""}`}
              onClick={() => {
                setSelectedRegionId(null);
                setTowns([]);
              }}
            >
              {selectedCountry.name_country}
            </button>
          </>
        )}
        {selectedRegion && (
          <>
            <span className="geo-breadcrumb__sep" aria-hidden="true">
              /
            </span>
            <span className="geo-breadcrumb__item geo-breadcrumb__item--active">
              {selectedRegion.name_region}
            </span>
          </>
        )}
      </nav>

      {flash.text && (
        <div
          className={`geo-alert geo-alert--${flash.type}`}
          role="alert"
        >
          {flash.text}
        </div>
      )}

      <div className="geo-grid">
        {/* Countries */}
        <section className="geo-panel" aria-label="Страны">
          <div className="geo-panel__head">
            <h2 className="geo-panel__title">
              <span className="geo-panel__icon" aria-hidden="true">
                <FaGlobeAmericas />
              </span>{" "}
              Страны
            </h2>
            <span className="geo-panel__count">{filteredCountries.length}</span>
          </div>

          <form className="geo-panel__form" onSubmit={saveCountry}>
            <input
              className="geo-input"
              placeholder={editCountryId ? "Новое название страны" : "Добавить страну…"}
              value={inputCountry}
              onChange={(e) => setInputCountry(e.target.value)}
              aria-label="Название страны"
            />
            <div className="geo-panel__form-actions">
              {editCountryId && (
                <button
                  type="button"
                  className="geo-btn geo-btn--ghost"
                  onClick={resetCountryForm}
                >
                  Отмена
                </button>
              )}
              <button
                type="submit"
                className="geo-btn geo-btn--primary"
                disabled={saving || !inputCountry.trim()}
              >
                {editCountryId ? "Сохранить" : "Добавить"}
              </button>
            </div>
          </form>

          <div className="geo-panel__search">
            <div className="geo-search-wrap">
              <span className="geo-search-wrap__icon" aria-hidden="true">
                <FaSearch />
              </span>
              <input
                className="geo-input geo-input--search"
                placeholder="Поиск страны…"
                value={searchCountry}
                onChange={(e) => setSearchCountry(e.target.value)}
                aria-label="Поиск страны"
              />
            </div>
          </div>

          <div className="geo-list">
            {loadingCountries ? (
              <div className="geo-loading">
                <span className="geo-spinner" />
                Загрузка…
              </div>
            ) : filteredCountries.length === 0 ? (
              <div className="geo-empty">
                <span className="geo-empty__icon" aria-hidden="true">
                  <FaMap />
                </span>
                <p className="geo-empty__text">
                  {searchCountry
                    ? "Ничего не найдено"
                    : "Добавьте первую страну"}
                </p>
              </div>
            ) : (
              filteredCountries.map((c) => (
                <button
                  key={c.country_id}
                  type="button"
                  className={`geo-item ${selectedCountryId === c.country_id ? "geo-item--active" : ""}`}
                  onClick={() => selectCountry(c.country_id)}
                >
                  <div className="geo-item__body">
                    <span className="geo-item__name">{c.name_country}</span>
                  </div>
                  <div className="geo-item__actions">
                    <button
                      type="button"
                      className="geo-item__edit"
                      title="Редактировать"
                      onClick={(e) => startEditCountry(c, e)}
                    >
                      <FaPen />
                    </button>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        {/* Regions */}
        <section
          className={`geo-panel ${!selectedCountryId ? "geo-panel--dimmed" : ""}`}
          aria-label="Регионы"
        >
          {!selectedCountryId ? (
            <div className="geo-panel__placeholder">
              <span className="geo-panel__placeholder-icon" aria-hidden="true">
                <FaMapMarkedAlt />
              </span>
              <p className="geo-panel__placeholder-text">
                Выберите страну слева, чтобы управлять регионами
              </p>
            </div>
          ) : (
            <>
              <div className="geo-panel__head">
                <h2 className="geo-panel__title">
                  <span className="geo-panel__icon" aria-hidden="true">
                    <FaMapMarkedAlt />
                  </span>{" "}
                  Регионы
                </h2>
                <span className="geo-panel__count">{filteredRegions.length}</span>
              </div>

              <form className="geo-panel__form" onSubmit={saveRegion}>
                <input
                  className="geo-input"
                  placeholder={
                    editRegionId ? "Новое название региона" : "Добавить регион…"
                  }
                  value={inputRegion}
                  onChange={(e) => setInputRegion(e.target.value)}
                  aria-label="Название региона"
                />
                <div className="geo-panel__form-actions">
                  {editRegionId && (
                    <button
                      type="button"
                      className="geo-btn geo-btn--ghost"
                      onClick={resetRegionForm}
                    >
                      Отмена
                    </button>
                  )}
                  <button
                    type="submit"
                    className="geo-btn geo-btn--primary"
                    disabled={saving || !inputRegion.trim()}
                  >
                    {editRegionId ? "Сохранить" : "Добавить"}
                  </button>
                </div>
              </form>

              <div className="geo-panel__search">
                <div className="geo-search-wrap">
                  <span className="geo-search-wrap__icon" aria-hidden="true">
                    <FaSearch />
                  </span>
                  <input
                    className="geo-input geo-input--search"
                    placeholder="Поиск региона…"
                    value={searchRegion}
                    onChange={(e) => setSearchRegion(e.target.value)}
                    aria-label="Поиск региона"
                  />
                </div>
              </div>

              <div className="geo-list">
                {loadingRegions ? (
                  <div className="geo-loading">
                    <span className="geo-spinner" />
                    Загрузка…
                  </div>
                ) : filteredRegions.length === 0 ? (
                  <div className="geo-empty">
                    <span className="geo-empty__icon" aria-hidden="true">
                      <FaMapMarkedAlt />
                    </span>
                    <p className="geo-empty__text">
                      {searchRegion
                        ? "Ничего не найдено"
                        : "Добавьте первый регион"}
                    </p>
                  </div>
                ) : (
                  filteredRegions.map((r) => (
                    <button
                      key={r.region_id}
                      type="button"
                      className={`geo-item ${selectedRegionId === r.region_id ? "geo-item--active" : ""}`}
                      onClick={() => selectRegion(r.region_id)}
                    >
                      <div className="geo-item__body">
                        <span className="geo-item__name">{r.name_region}</span>
                      </div>
                      <div className="geo-item__actions">
                        <button
                          type="button"
                          className="geo-item__edit"
                          title="Редактировать"
                          onClick={(e) => startEditRegion(r, e)}
                        >
                          <FaPen />
                        </button>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </section>

        {/* Towns */}
        <section
          className={`geo-panel ${!selectedRegionId ? "geo-panel--dimmed" : ""}`}
          aria-label="Города"
        >
          {!selectedRegionId ? (
            <div className="geo-panel__placeholder">
              <span className="geo-panel__placeholder-icon" aria-hidden="true">
                <FaCity />
              </span>
              <p className="geo-panel__placeholder-text">
                Выберите регион, чтобы управлять городами
              </p>
            </div>
          ) : (
            <>
              <div className="geo-panel__head">
                <h2 className="geo-panel__title">
                  <span className="geo-panel__icon" aria-hidden="true">
                    <FaCity />
                  </span>{" "}
                  Города
                </h2>
                <span className="geo-panel__count">{filteredTowns.length}</span>
              </div>

              <form className="geo-panel__form" onSubmit={saveTown}>
                <input
                  className="geo-input"
                  placeholder={
                    editTownId ? "Новое название города" : "Добавить город…"
                  }
                  value={inputTown}
                  onChange={(e) => setInputTown(e.target.value)}
                  aria-label="Название города"
                />
                <div className="geo-panel__form-actions">
                  {editTownId && (
                    <button
                      type="button"
                      className="geo-btn geo-btn--ghost"
                      onClick={resetTownForm}
                    >
                      Отмена
                    </button>
                  )}
                  <button
                    type="submit"
                    className="geo-btn geo-btn--primary"
                    disabled={saving || !inputTown.trim()}
                  >
                    {editTownId ? "Сохранить" : "Добавить"}
                  </button>
                </div>
              </form>

              <div className="geo-panel__search">
                <div className="geo-search-wrap">
                  <span className="geo-search-wrap__icon" aria-hidden="true">
                    <FaSearch />
                  </span>
                  <input
                    className="geo-input geo-input--search"
                    placeholder="Поиск города…"
                    value={searchTown}
                    onChange={(e) => setSearchTown(e.target.value)}
                    aria-label="Поиск города"
                  />
                </div>
              </div>

              <div className="geo-list">
                {loadingTowns ? (
                  <div className="geo-loading">
                    <span className="geo-spinner" />
                    Загрузка…
                  </div>
                ) : filteredTowns.length === 0 ? (
                  <div className="geo-empty">
                    <span className="geo-empty__icon" aria-hidden="true">
                      <FaCity />
                    </span>
                    <p className="geo-empty__text">
                      {searchTown
                        ? "Ничего не найдено"
                        : "Добавьте первый город"}
                    </p>
                  </div>
                ) : (
                  filteredTowns.map((t) => (
                    <div
                      key={t.town_id}
                      className={`geo-item geo-item--static ${editTownId === t.town_id ? "geo-item--active" : ""}`}
                    >
                      <div className="geo-item__body">
                        <span className="geo-item__name">{t.name_town}</span>
                      </div>
                      <div className="geo-item__actions">
                        <button
                          type="button"
                          className="geo-item__edit"
                          title="Редактировать"
                          onClick={() => startEditTown(t)}
                        >
                          <FaPen />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
