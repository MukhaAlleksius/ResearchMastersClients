import React, { useState, useEffect, useCallback, useMemo } from "react";
import { API, apiFetch } from "../../../../utils/api.js";
import { FaSearch } from "react-icons/fa";
import {
  CURRENCY_OPTIONS,
  formatMoney,
} from "../../../../utils/currency";
import {
  FaLaptopCode,
  FaPaintBrush,
  FaHammer,
  FaCut,
  FaTruck,
  FaStethoscope,
  FaUtensils,
  FaMusic,
} from "react-icons/fa";
import { MdWork } from "react-icons/md";
import "./category_works.css";

const iconOptions = [
  { name: "Программист", icon: <FaLaptopCode /> },
  { name: "Художник", icon: <FaPaintBrush /> },
  { name: "Строитель", icon: <FaHammer /> },
  { name: "Парикмахер", icon: <FaCut /> },
  { name: "Водитель", icon: <FaTruck /> },
  { name: "Врач", icon: <FaStethoscope /> },
  { name: "Повар", icon: <FaUtensils /> },
  { name: "Музыкант", icon: <FaMusic /> },
  { name: "Работа", icon: <MdWork /> },
];

const colorOptions = [
  "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F",
  "#BB8FCE", "#F8C471", "#FF9FF3", "#54A0FF", "#5F27CD", "#00D2D3", "#FF9F43", "#00B894",
  "#E17055", "#00CEC9", "#55A3FF", "#FDCB6E", "#2C3E50", "#34495E", "#1A252F", "#4A5568",
  "#2D3748", "#718096", "#1A202C", "#2F855A", "#000000", "#333333", "#555555", "#777777",
  "#999999", "#B91C1C", "#DC2626", "#EA580C", "#D97706", "#15803D", "#047857", "#065F46",
  "#134E3A", "#1E40AF",
];

function useFlashMessage(timeout = 3500) {
  const [message, setMessage] = useState({ type: "", text: "" });
  const show = useCallback(
    (type, text) => {
      setMessage({ type, text });
      if (text) setTimeout(() => setMessage({ type: "", text: "" }), timeout);
    },
    [timeout],
  );
  return [message, show];
}

function ColoredIcon({ iconName, color, size = 22 }) {
  const iconOpt = iconOptions.find((opt) => opt.name === iconName);
  if (!iconOpt) return null;
  return (
    <span className="cw-card__icon-inner">
      {React.cloneElement(iconOpt.icon, { style: { color, fontSize: size } })}
    </span>
  );
}

export default function AdminCategoriesAndWorks() {
  const [categories, setCategories] = useState([]);
  const [categoryName, setCategoryName] = useState("");
  const [categorySlug, setCategorySlug] = useState("");
  const [categoryDescription, setCategoryDescription] = useState("");
  const [selectedIconIndex, setSelectedIconIndex] = useState(0);
  const [selectedColorIndex, setSelectedColorIndex] = useState(0);
  const [categoryEditId, setCategoryEditId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [works, setWorks] = useState([]);
  const [workName, setWorkName] = useState("");
  const [workCost, setWorkCost] = useState("");
  const [workCurrency, setWorkCurrency] = useState("BYN");
  const [workUnit, setWorkUnit] = useState("");
  const [workEditId, setWorkEditId] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [showColorPalette, setShowColorPalette] = useState(false);
  const [searchCategory, setSearchCategory] = useState("");
  const [flash, showFlash] = useFlashMessage();

  const generateSlug = useCallback((name) => {
    return name
      .toLowerCase()
      .trim()
      .replace(/[а-яё]/g, (char) => {
        const map = {
          а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh",
          з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
          п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c",
          ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
        };
        return map[char] || char;
      })
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
  }, []);

  const validateSlug = useCallback((slug) => {
    const trimmedSlug = slug.trim();
    if (!trimmedSlug) {
      showFlash("error", "Слаг обязателен");
      return false;
    }
    if (!/^[a-z0-9-]+$/.test(trimmedSlug)) {
      showFlash("error", "Слаг: только латиница, цифры и дефисы");
      return false;
    }
    if (trimmedSlug.length < 3 || trimmedSlug.length > 50) {
      showFlash("error", "Слаг: от 3 до 50 символов");
      return false;
    }
    return true;
  }, [showFlash]);

  const fetchCategoriesWorks = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiFetch(`${API.baseURL}/categories_works`);
      if (!response.ok) throw new Error("Не получили данные категорий");
      const data = await response.json();
      const fixedData = data.map((cat, idx) => ({
        ...cat,
        id: cat.id || cat.category_work_id || idx + 1,
      }));
      setCategories(fixedData);
    } catch (error) {
      showFlash("error", error.message || "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [showFlash]);

  const fetchWorks = useCallback(async (categoryWorkId) => {
    if (!categoryWorkId) {
      setWorks([]);
      return;
    }
    try {
      const response = await apiFetch(
        `${API.baseURL}/works_for_category_work/${categoryWorkId}`,
      );
      if (response.status === 404 || response.status === 403) {
        setWorks([]);
        return;
      }
      if (!response.ok) throw new Error("Не получили данные работ");
      const data = await response.json();
      setWorks(Array.isArray(data) ? data : []);
    } catch {
      setWorks([]);
    }
  }, []);

  useEffect(() => {
    fetchCategoriesWorks();
  }, [fetchCategoriesWorks]);

  useEffect(() => {
    if (categoryEditId) return;
    setCategorySlug(generateSlug(categoryName));
  }, [categoryName, categoryEditId, generateSlug]);

  const filteredCategories = useMemo(() => {
    const q = searchCategory.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.slug?.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q),
    );
  }, [categories, searchCategory]);

  const resetCategoryForm = () => {
    setCategoryName("");
    setCategorySlug("");
    setCategoryDescription("");
    setSelectedIconIndex(0);
    setSelectedColorIndex(0);
    setCategoryEditId(null);
  };

  const resetWorkForm = () => {
    setWorkName("");
    setWorkCost("");
    setWorkCurrency("BYN");
    setWorkUnit("");
    setWorkEditId(null);
  };

  const handleToggleAccess = async (categoryId, e) => {
    e.stopPropagation();
    const numericId = Number(categoryId);
    const currentCategory = categories.find((cat) => cat.id === numericId);
    const newAccessValue = !currentCategory?.access_users;

    try {
      const response = await apiFetch(
        `${API.baseURL}/change_access_users/${numericId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access_users: newAccessValue }),
        },
      );
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Ошибка сервера");
      }
      const updatedCategory = await response.json();
      setCategories((prev) =>
        prev.map((cat) => (cat.id === numericId ? { ...updatedCategory } : cat)),
      );
      if (selectedCategory?.id === numericId) {
        setSelectedCategory((prev) => ({ ...prev, ...updatedCategory }));
      }
      showFlash("success", newAccessValue ? "Доступ открыт" : "Доступ закрыт");
    } catch (error) {
      showFlash("error", error.message);
    }
  };

  const validateCategory = () => {
    if (!categoryName.trim()) {
      showFlash("error", "Название категории обязательно");
      return false;
    }
    return validateSlug(categorySlug);
  };

  const addOrEditCategory = async (e) => {
    e.preventDefault();
    if (!validateCategory()) return;

    const icon = iconOptions[selectedIconIndex];
    const color = colorOptions[selectedColorIndex];
    const categoryWorkData = {
      category_work_id: categoryEditId || null,
      name: categoryName.trim(),
      slug: categorySlug.trim(),
      description: categoryDescription.trim(),
      icon_name: icon.name,
      icon_color: color,
      access_users: categoryEditId
        ? (categories.find((cat) => cat.id === categoryEditId)?.access_users ?? false)
        : false,
    };

    try {
      setLoading(true);
      const response = await apiFetch(`${API.baseURL}/add_category_work`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(categoryWorkData),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Ошибка сохранения категории");
      }
      const data = await response.json();
      setCategories((prev) => {
        const exists = prev.find((cat) => cat.id === categoryEditId);
        if (exists && categoryEditId) {
          return prev.map((cat) =>
            cat.id === categoryEditId ? { ...cat, ...data } : cat,
          );
        }
        return [...prev, { ...data }];
      });
      resetCategoryForm();
      showFlash("success", categoryEditId ? "Категория обновлена" : "Категория добавлена");
    } catch (error) {
      showFlash("error", error.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteCategory = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm("Удалить категорию? Все работы тоже будут удалены.")) return;
    try {
      await apiFetch(`${API.baseURL}/delete_category_work/${id}`, { method: "DELETE" });
      setCategories((prev) => prev.filter((cat) => cat.id !== id));
      if (selectedCategory?.id === id) {
        setSelectedCategory(null);
        setWorks([]);
      }
      showFlash("success", "Категория удалена");
    } catch {
      showFlash("error", "Ошибка удаления категории");
    }
  };

  const editCategory = (cat, e) => {
    e.stopPropagation();
    setCategoryName(cat.name || "");
    setCategorySlug(cat.slug || "");
    setCategoryDescription(cat.description || "");
    const iconIdx = iconOptions.findIndex((el) => el.name === cat.icon_name);
    const colorIdx = colorOptions.findIndex((c) => c === cat.icon_color);
    setSelectedIconIndex(iconIdx >= 0 ? iconIdx : 0);
    setSelectedColorIndex(colorIdx >= 0 ? colorIdx : 0);
    setCategoryEditId(cat.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const selectCategory = (category) => {
    setSelectedCategory(category);
    resetWorkForm();
    fetchWorks(category.id);
  };

  const validateWork = () => {
    const costValue = parseFloat(workCost);
    if (!workName.trim() || !workUnit.trim() || isNaN(costValue) || costValue <= 0) {
      showFlash("error", "Заполните название, стоимость (>0) и единицу измерения");
      return false;
    }
    return true;
  };

  const addOrEditWork = async (e) => {
    e.preventDefault();
    if (!validateWork() || !selectedCategory) return;

    const workData = {
      user_id: parseInt(localStorage.getItem("user_id") || "0", 10),
      name_work: workName.trim(),
      unit_measurement: workUnit.trim(),
      cost: parseFloat(workCost),
      currency: workCurrency || "BYN",
      category_work_id: selectedCategory.id,
    };

    try {
      setLoading(true);
      const url = workEditId
        ? `${API.baseURL}/update_work/${workEditId}`
        : `${API.baseURL}/add_work`;
      const response = await apiFetch(url, {
        method: workEditId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(workData),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Ошибка сохранения работы");
      }
      const data = await response.json();
      setWorks((prev) => {
        if (workEditId) {
          return prev.map((w) => (w.id === workEditId ? { ...w, ...workData, id: workEditId } : w));
        }
        return [...prev, { ...workData, id: data.id || Date.now() }];
      });
      resetWorkForm();
      showFlash("success", workEditId ? "Работа обновлена" : "Работа добавлена");
    } catch (error) {
      showFlash("error", error.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteWork = async (id) => {
    if (!window.confirm("Удалить работу?")) return;
    try {
      await apiFetch(`${API.baseURL}/delete_work/${id}`, { method: "DELETE" });
      setWorks((prev) => prev.filter((w) => w.id !== id));
      showFlash("success", "Работа удалена");
    } catch {
      showFlash("error", "Ошибка удаления работы");
    }
  };

  const editWork = (work) => {
    setWorkName(work.name_work);
    setWorkCost(work.cost.toString());
    setWorkCurrency(work.currency || "BYN");
    setWorkUnit(work.unit_measurement);
    setWorkEditId(work.id || work.work_id);
  };

  return (
    <div className="cw-page">
      <header className="cw-hero">
        <div className="cw-hero__text">
          <span className="cw-hero__badge">Админ · Справочник</span>
          <h1 className="cw-hero__title">Категории и работы</h1>
          <p className="cw-hero__subtitle">
            Управление категориями услуг, иконками, доступом и перечнем работ
          </p>
        </div>
        <div className="cw-hero__stats">
          <div className="cw-stat">
            <span className="cw-stat__value">{categories.length}</span>
            <span className="cw-stat__label">категорий</span>
          </div>
          <div className="cw-stat">
            <span className="cw-stat__value">{works.length}</span>
            <span className="cw-stat__label">работ</span>
          </div>
          <div className="cw-stat">
            <span className="cw-stat__value">
              {categories.filter((c) => c.access_users).length}
            </span>
            <span className="cw-stat__label">открыто</span>
          </div>
        </div>
      </header>

      {flash.text && (
        <div className={`cw-alert cw-alert--${flash.type}`} role="alert">
          {flash.text}
        </div>
      )}

      <div className="cw-grid">
        {/* Categories */}
        <section className="cw-panel" aria-label="Категории работ">
          <div className="cw-panel__head">
            <h2 className="cw-panel__title">Категории</h2>
            <span className="cw-panel__count">{filteredCategories.length}</span>
          </div>

          <div className="cw-panel__body">
            <form className="cw-form" onSubmit={addOrEditCategory}>
              <label className="cw-label">
                Название
                <input
                  className="cw-input"
                  type="text"
                  placeholder="Например: Электромонтаж"
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  disabled={loading}
                />
              </label>

              <label className="cw-label">
                Слаг (URL)
                <input
                  className="cw-input"
                  type="text"
                  placeholder="elektromontazh"
                  value={categorySlug}
                  onChange={(e) => setCategorySlug(e.target.value)}
                  disabled={loading}
                />
              </label>

              <label className="cw-label">
                Описание
                <textarea
                  className="cw-textarea"
                  placeholder="Краткое описание категории"
                  value={categoryDescription}
                  onChange={(e) => setCategoryDescription(e.target.value)}
                  disabled={loading}
                />
              </label>

              <div className="cw-label">
                Иконка
                <div className="cw-icon-picker">
                  {iconOptions.map((item, idx) => (
                    <button
                      key={item.name}
                      type="button"
                      className={`cw-icon-btn ${selectedIconIndex === idx ? "cw-icon-btn--active" : ""}`}
                      title={item.name}
                      onClick={() => setSelectedIconIndex(idx)}
                      disabled={loading}
                    >
                      {React.cloneElement(item.icon, {
                        style: { color: colorOptions[selectedColorIndex] },
                      })}
                    </button>
                  ))}
                </div>
              </div>

              <div className="cw-label">
                Цвет иконки
                <div className="cw-color-row">
                  <button
                    type="button"
                    className="cw-btn cw-btn--outline"
                    onClick={() => setShowColorPalette(true)}
                    disabled={loading}
                  >
                    Выбрать цвет
                  </button>
                  <div
                    className="cw-color-preview"
                    style={{ backgroundColor: colorOptions[selectedColorIndex] }}
                  />
                </div>
              </div>

              <div className="cw-form-actions">
                {categoryEditId && (
                  <button
                    type="button"
                    className="cw-btn cw-btn--ghost"
                    onClick={resetCategoryForm}
                  >
                    Отмена
                  </button>
                )}
                <button
                  type="submit"
                  className="cw-btn cw-btn--primary"
                  disabled={loading}
                >
                  {loading
                    ? "Сохранение…"
                    : categoryEditId
                      ? "Сохранить"
                      : "Добавить категорию"}
                </button>
              </div>
            </form>

            <div className="cw-search-wrap">
              <span className="cw-search-wrap__icon" aria-hidden="true">
                <FaSearch />
              </span>
              <input
                className="cw-input cw-input--search"
                placeholder="Поиск категории…"
                value={searchCategory}
                onChange={(e) => setSearchCategory(e.target.value)}
              />
            </div>

            <div className="cw-list">
              {loading && categories.length === 0 ? (
                <div className="cw-loading">
                  <span className="cw-spinner" />
                  Загрузка…
                </div>
              ) : filteredCategories.length === 0 ? (
                <div className="cw-empty">
                  <p className="cw-empty__text">
                    {searchCategory ? "Ничего не найдено" : "Категории пока не добавлены"}
                  </p>
                </div>
              ) : (
                filteredCategories.map((cat) => {
                  if (!cat.id || isNaN(Number(cat.id))) return null;
                  const isActive = selectedCategory?.id === cat.id;
                  return (
                    <div
                      key={cat.id}
                      className={`cw-card ${isActive ? "cw-card--active" : ""}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => selectCategory(cat)}
                      onKeyDown={(e) => e.key === "Enter" && selectCategory(cat)}
                    >
                      <div className="cw-card__icon">
                        <ColoredIcon
                          iconName={cat.icon_name}
                          color={cat.icon_color || "#6366f1"}
                        />
                      </div>
                      <div className="cw-card__body">
                        <span className="cw-card__name">{cat.name}</span>
                        {cat.slug && <span className="cw-card__slug">{cat.slug}</span>}
                        {cat.description && (
                          <span className="cw-card__desc">{cat.description}</span>
                        )}
                        <span
                          className={`cw-card__badge ${cat.access_users ? "cw-card__badge--open" : "cw-card__badge--closed"}`}
                        >
                          {cat.access_users ? "Доступ открыт" : "Доступ закрыт"}
                        </span>
                      </div>
                      <div className="cw-card__actions">
                        <button
                          type="button"
                          className="cw-btn cw-btn--outline cw-btn--sm"
                          onClick={(e) => editCategory(cat, e)}
                        >
                          Изменить
                        </button>
                        <button
                          type="button"
                          className={`cw-btn cw-btn--success cw-btn--sm ${cat.access_users ? "is-active" : ""}`}
                          onClick={(e) => handleToggleAccess(cat.id, e)}
                        >
                          {cat.access_users ? "Закрыть" : "Открыть"}
                        </button>
                        <button
                          type="button"
                          className="cw-btn cw-btn--danger cw-btn--sm"
                          onClick={(e) => deleteCategory(cat.id, e)}
                        >
                          Удалить
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>

        {/* Works */}
        <section
          className={`cw-panel ${!selectedCategory ? "cw-panel--dimmed" : ""}`}
          aria-label="Работы категории"
        >
          {!selectedCategory ? (
            <div className="cw-panel__placeholder">
              <span className="cw-panel__placeholder-icon" aria-hidden="true">
                <MdWork />
              </span>
              <p className="cw-panel__placeholder-text">
                Выберите категорию слева, чтобы управлять списком работ
              </p>
            </div>
          ) : (
            <>
              <div className="cw-panel__head">
                <h2 className="cw-panel__title">Работы</h2>
                <span className="cw-panel__count">{works.length}</span>
              </div>

              <div className="cw-panel__body">
                <div className="cw-selected-cat">
                  <div className="cw-selected-cat__icon">
                    <ColoredIcon
                      iconName={selectedCategory.icon_name}
                      color={selectedCategory.icon_color || "#6366f1"}
                      size={26}
                    />
                  </div>
                  <div>
                    <p className="cw-selected-cat__name">{selectedCategory.name}</p>
                    {selectedCategory.slug && (
                      <p className="cw-selected-cat__slug">{selectedCategory.slug}</p>
                    )}
                  </div>
                </div>

                <form className="cw-form" onSubmit={addOrEditWork}>
                  <label className="cw-label">
                    Название работы
                    <input
                      className="cw-input"
                      type="text"
                      placeholder="Например: Монтаж розетки"
                      value={workName}
                      onChange={(e) => setWorkName(e.target.value)}
                      disabled={loading}
                    />
                  </label>

                  <div className="cw-form__row">
                    <label className="cw-label">
                      Стоимость
                      <input
                        className="cw-input"
                        type="number"
                        placeholder="0"
                        value={workCost}
                        onChange={(e) => setWorkCost(e.target.value)}
                        min="0"
                        step="any"
                        disabled={loading}
                      />
                    </label>
                    <label className="cw-label">
                      Валюта
                      <select
                        className="cw-select"
                        value={workCurrency}
                        onChange={(e) => setWorkCurrency(e.target.value)}
                        disabled={loading}
                      >
                        {CURRENCY_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label className="cw-label">
                    Единица измерения
                    <input
                      className="cw-input"
                      type="text"
                      placeholder="час, шт, м²"
                      value={workUnit}
                      onChange={(e) => setWorkUnit(e.target.value)}
                      disabled={loading}
                    />
                  </label>

                  <div className="cw-form-actions">
                    {workEditId && (
                      <button
                        type="button"
                        className="cw-btn cw-btn--ghost"
                        onClick={resetWorkForm}
                      >
                        Отмена
                      </button>
                    )}
                    <button
                      type="submit"
                      className="cw-btn cw-btn--primary"
                      disabled={loading}
                    >
                      {loading
                        ? "Сохранение…"
                        : workEditId
                          ? "Сохранить"
                          : "Добавить работу"}
                    </button>
                  </div>
                </form>

                <div className="cw-list">
                  {works.length === 0 ? (
                    <div className="cw-empty">
                      <p className="cw-empty__text">В этой категории пока нет работ</p>
                    </div>
                  ) : (
                    works.map((work) => (
                      <div key={work.id} className="cw-work">
                        <div className="cw-work__info">
                          <span className="cw-work__name">{work.name_work}</span>
                          <span className="cw-work__meta">
                            {work.unit_measurement} ·{" "}
                            <span className="cw-work__price">
                              {formatMoney(work.cost, work.currency)}
                            </span>
                          </span>
                        </div>
                        <div className="cw-work__actions">
                          <button
                            type="button"
                            className="cw-btn cw-btn--outline cw-btn--sm"
                            onClick={() => editWork(work)}
                          >
                            Изменить
                          </button>
                          <button
                            type="button"
                            className="cw-btn cw-btn--danger cw-btn--sm"
                            onClick={() => deleteWork(work.id)}
                          >
                            Удалить
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {showColorPalette && (
        <div
          className="cw-modal-overlay"
          onClick={() => setShowColorPalette(false)}
          role="presentation"
        >
          <div
            className="cw-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="color-modal-title"
          >
            <h3 className="cw-modal__title" id="color-modal-title">
              Выберите цвет иконки
            </h3>
            <div className="cw-color-grid">
              {colorOptions.map((color, idx) => (
                <button
                  key={color}
                  type="button"
                  className={`cw-color-swatch ${selectedColorIndex === idx ? "cw-color-swatch--active" : ""}`}
                  style={{ backgroundColor: color }}
                  title={color}
                  onClick={() => {
                    setSelectedColorIndex(idx);
                    setShowColorPalette(false);
                  }}
                />
              ))}
            </div>
            <div className="cw-modal__actions">
              <button
                type="button"
                className="cw-btn cw-btn--ghost"
                onClick={() => setShowColorPalette(false)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
