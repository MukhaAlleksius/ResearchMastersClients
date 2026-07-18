import React, { useEffect, useState, useMemo, useCallback } from "react";
import { API, apiFetch, readApiError } from "../../../../utils/api.js";
import { FaSearch, FaBriefcase } from "react-icons/fa";
import "./business_forms.css";
function getInitials(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function AddBusinessForm() {
  const [businessForms, setBusinessForms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");

  const fetchBusinessForms = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await apiFetch(`${API.baseURL}/business_form`);
      if (!res.ok) {
        const detail = await readApiError(res);
        throw new Error(detail || "Не удалось загрузить формы");
      }
      const data = await res.json();
      setBusinessForms(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBusinessForms();
  }, [fetchBusinessForms]);

  const filteredForms = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return businessForms;
    return businessForms.filter(
      (item) =>
        item.name?.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q),
    );
  }, [businessForms, search]);

  const handleEdit = (item) => {
    setEditingId(item.id);
    setName(item.name || "");
    setDescription(item.description || "");
    setSuccess("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleReset = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setError("");
    setSuccess("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const payload = {
        name: name.trim(),
        description: description.trim(),
      };
      if (editingId) payload.id = editingId;

      const res = await apiFetch(`${API.baseURL}/add_business_form`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const detail = await readApiError(res);
        if (res.status === 401 || res.status === 403) {
          throw new Error(
            detail || "Недостаточно прав. Войдите как администратор.",
          );
        }
        throw new Error(detail || "Не удалось сохранить форму");
      }

      const text = await res.text();
      if (text) JSON.parse(text);

      setSuccess(
        editingId ? "Форма успешно обновлена" : "Форма успешно добавлена",
      );
      handleReset();
      await fetchBusinessForms();
    } catch (err) {
      setError(err.message || "Ошибка при сохранении");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bf-page">
      <header className="bf-hero">
        <div className="bf-hero__text">
          <span className="bf-hero__badge">Админ · Справочник</span>
          <h1 className="bf-hero__title">Бизнес-формы</h1>
          <p className="bf-hero__subtitle">
            Организационно-правовые формы для профилей исполнителей и заказчиков
          </p>
        </div>
        <div className="bf-hero__stats">
          <div className="bf-stat">
            <span className="bf-stat__value">{businessForms.length}</span>
            <span className="bf-stat__label">всего</span>
          </div>
          <div className="bf-stat">
            <span className="bf-stat__value">{filteredForms.length}</span>
            <span className="bf-stat__label">в списке</span>
          </div>
          <div className="bf-stat">
            <span className="bf-stat__value">{editingId ? "1" : "0"}</span>
            <span className="bf-stat__label">редактируется</span>
          </div>
        </div>
      </header>

      {error && (
        <div className="bf-alert bf-alert--error" role="alert">
          {error}
        </div>
      )}
      {success && (
        <div className="bf-alert bf-alert--success" role="alert">
          {success}
        </div>
      )}

      <div className="bf-grid">
        {/* Form */}
        <section className="bf-panel" aria-label="Форма бизнес-формы">
          <div className="bf-panel__head">
            <h2 className="bf-panel__title">
              {editingId ? "Редактирование" : "Новая форма"}
            </h2>
          </div>

          <div className="bf-panel__body">
            {editingId && (
              <div className="bf-editing-badge">
                Режим редактирования
              </div>
            )}

            <form className="bf-form" onSubmit={handleSubmit}>
              <label className="bf-label">
                Название
                <input
                  className="bf-input"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Например: ИП, ООО, Самозанятый"
                  required
                  disabled={saving}
                />
              </label>

              <label className="bf-label">
                Описание
                <textarea
                  className="bf-textarea"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Краткое описание формы ведения бизнеса"
                  required
                  disabled={saving}
                />
              </label>

              <p className="bf-form-hint">
                Бизнес-форма отображается при регистрации и в профиле пользователя.
              </p>

              <div className="bf-form-actions">
                {editingId && (
                  <button
                    type="button"
                    className="bf-btn bf-btn--ghost"
                    onClick={handleReset}
                    disabled={saving}
                  >
                    Отмена
                  </button>
                )}
                <button
                  type="submit"
                  className="bf-btn bf-btn--primary"
                  disabled={saving}
                >
                  {saving
                    ? "Сохранение…"
                    : editingId
                      ? "Сохранить изменения"
                      : "Добавить форму"}
                </button>
              </div>
            </form>
          </div>
        </section>

        {/* List */}
        <section className="bf-panel" aria-label="Список бизнес-форм">
          <div className="bf-panel__head">
            <h2 className="bf-panel__title">Все бизнес-формы</h2>
            <span className="bf-panel__count">{filteredForms.length}</span>
          </div>

          <div className="bf-panel__body">
            <div className="bf-search-wrap">
              <span className="bf-search-wrap__icon" aria-hidden="true">
                <FaSearch />
              </span>
              <input
                className="bf-input bf-input--search"
                type="search"
                placeholder="Поиск по названию или описанию…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Поиск бизнес-форм"
              />
            </div>

            <div className="bf-list">
              {loading ? (
                <div className="bf-loading">
                  <span className="bf-spinner" />
                  Загрузка…
                </div>
              ) : filteredForms.length === 0 ? (
                <div className="bf-empty">
                  <span className="bf-empty__icon" aria-hidden="true">
                    <FaBriefcase />
                  </span>
                  <p className="bf-empty__text">
                    {search
                      ? "Ничего не найдено"
                      : "Бизнес-формы пока не добавлены"}
                  </p>
                </div>
              ) : (
                filteredForms.map((item) => {
                  const isActive = editingId === item.id;
                  return (
                    <div
                      key={item.id}
                      className={`bf-card ${isActive ? "bf-card--active" : ""}`}
                    >
                      <div className="bf-card__avatar" aria-hidden="true">
                        {getInitials(item.name)}
                      </div>
                      <div className="bf-card__body">
                        <span className="bf-card__name">{item.name}</span>
                        <span className="bf-card__desc">{item.description}</span>
                      </div>
                      <div className="bf-card__actions">
                        <button
                          type="button"
                          className="bf-btn bf-btn--outline bf-btn--sm"
                          onClick={() => handleEdit(item)}
                        >
                          {isActive ? "Редактируется" : "Изменить"}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
