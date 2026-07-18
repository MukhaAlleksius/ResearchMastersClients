import React, { useEffect, useState } from "react";
import { API, apiFetch, buildApiUrl } from "../../../../utils/api.js";
import CreatableSelect from "react-select/creatable";
import EditSpecialization from "./EditSpecialization/EditSpecialization";
import MyWorks from "./MyWorks/MyWorks";
import WorksSpecialization from "./WorksSpecialization/WorksSpecialization";
import {
  CURRENCY_OPTIONS,
  formatMoney,
  normalizeCurrencyCode,
} from "../../../../utils/currency";
import "./specializations.css";
const selectStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: 44,
    borderRadius: 10,
    borderColor: state.isFocused ? "#2563eb" : "#e2e8f0",
    boxShadow: state.isFocused ? "0 0 0 3px rgba(37, 99, 235, 0.12)" : "none",
  }),
  menu: (base) => ({ ...base, borderRadius: 10, zIndex: 40 }),
};

function SpecializationDetail({ specialization, onBack }) {
  const [activeInnerTab, setActiveInnerTab] = useState("works");
  const [currency, setCurrency] = useState("BYN");
  const [specInfo, setSpecInfo] = useState(specialization);

  useEffect(() => {
    setSpecInfo(specialization);
  }, [specialization]);

  const handleGlobalCurrencyChange = (newCurrency) => {
    const normalizedNew = normalizeCurrencyCode(newCurrency);
    const normalizedPrev = normalizeCurrencyCode(currency);
    if (normalizedNew === normalizedPrev) {
      if (currency !== normalizedNew) {
        setCurrency(normalizedNew);
      }
      return;
    }
    setCurrency(normalizedNew);
  };

  return (    <div className="spec-page">
      <button type="button" className="spec-back" onClick={onBack}>
        <i className="fas fa-arrow-left" aria-hidden="true" />
        К списку специализаций
      </button>

      <header className="spec-page__header">
        <div>
          <h1 className="spec-page__title">{specialization.name}</h1>
          <p className="spec-page__subtitle">
            Управление работами и параметрами специализации
          </p>
        </div>
        <div className="spec-currency">
          <label className="spec-label" htmlFor="spec-global-currency">
            Валюта работ
          </label>
          <select
            id="spec-global-currency"
            className="spec-input spec-currency__select"
            value={currency}
            onChange={(e) => handleGlobalCurrencyChange(e.target.value)}
          >
            {CURRENCY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </header>
      <div className="spec-detail__meta">
        <span className="spec-pill">
          <i className="fas fa-clock" aria-hidden="true" />
          {formatMoney(
            specInfo.cost_hour,
            specInfo.currency || "BYN",
          )}{" "}
          / час
        </span>
        {specInfo.experience != null && specInfo.experience !== "" && (
          <span className="spec-pill">
            <i className="fas fa-briefcase" aria-hidden="true" />
            Стаж: {specInfo.experience} лет
          </span>
        )}
      </div>

      <nav className="spec-tabs" aria-label="Разделы специализации">
        <button
          type="button"
          className={`spec-tabs__btn ${activeInnerTab === "works" ? "spec-tabs__btn--active" : ""}`}
          onClick={() => setActiveInnerTab("works")}
        >
          Работы каталога
        </button>
        <button
          type="button"
          className={`spec-tabs__btn ${activeInnerTab === "myWorks" ? "spec-tabs__btn--active" : ""}`}
          onClick={() => setActiveInnerTab("myWorks")}
        >
          Мои работы
        </button>
        <button
          type="button"
          className={`spec-tabs__btn ${activeInnerTab === "editSpecialization" ? "spec-tabs__btn--active" : ""}`}
          onClick={() => setActiveInnerTab("editSpecialization")}
        >
          Настройки
        </button>
      </nav>

      <div className="spec-panel">
        {activeInnerTab === "editSpecialization" && (
          <EditSpecialization
            specialization={specInfo}
            currency={currency}
            onUpdated={(updates) =>
              setSpecInfo((prev) => ({ ...prev, ...updates }))
            }
          />
        )}
        {activeInnerTab === "works" && (
          <WorksSpecialization
            category_work_id={specialization.category_work_id}
            currency={currency}
          />
        )}
        {activeInnerTab === "myWorks" && (
          <MyWorks
            category_work_id={specialization.category_work_id}
            currency={currency}
          />
        )}      </div>
    </div>
  );
}

export default function Specializations() {
  const [selectedSpecialization, setSelectedSpecialization] = useState(null);
  const [subTab, setSubTab] = useState("list");
  const [categoriesWorksMaster, setCategoriesWorksMaster] = useState([]);
  const [categoryWorkMaster, setCategoryWorkMaster] = useState(null);
  const [description, setDescription] = useState("");
  const [experience, setExperience] = useState("");
  const [costHour, setCostHour] = useState("");
  const [categoriesWorks, setCategoriesWorks] = useState([]);
  const [saving, setSaving] = useState(false);

  const fetchCategoriesWorksMaster = async () => {
    try {
      const master_id = localStorage.getItem("user_id");
      const response = await apiFetch(
        buildApiUrl(`/categories_works_master/${master_id}`),
      );
      if (!response.ok) throw new Error("Не получили данных с сервера");
      const data = await response.json();
      setCategoriesWorksMaster(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setCategoriesWorksMaster([]);
    }
  };

  const fetchCategoriesWorks = async () => {
    try {
      const response = await apiFetch(
        buildApiUrl("/categories_works_for_users"),
      );
      if (!response.ok) throw new Error("Ошибка категорий");
      const data = await response.json();
      setCategoriesWorks(
        data.map((c) => ({
          value: c.category_work_id || c.id,
          label: c.name || c.name_work,
        })),
      );
    } catch (error) {
      console.error(error);
      setCategoriesWorks([]);
    }
  };

  const handleAddSpecialization = async (e) => {
    e.preventDefault();
    if (!categoryWorkMaster || !description || !experience || !costHour) {
      alert("Пожалуйста, заполните все поля");
      return;
    }
    setSaving(true);
    try {
      const master_id = localStorage.getItem("user_id");
      const response = await apiFetch(
        buildApiUrl("/add_category_work_master"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            master_id,
            category_work_id: categoryWorkMaster.value,
            description,
            experience,
            cost_hour: costHour,
          }),
        },
      );
      if (!response.ok) throw new Error("Ошибка добавления");
      await fetchCategoriesWorksMaster();
      setCategoryWorkMaster(null);
      setDescription("");
      setExperience("");
      setCostHour("");
      setSubTab("list");
    } catch (error) {
      console.error(error);
      alert("Не удалось добавить специализацию");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    fetchCategoriesWorks();
    fetchCategoriesWorksMaster();
  }, []);

  if (selectedSpecialization) {
    return (
      <SpecializationDetail
        specialization={selectedSpecialization}
        onBack={() => setSelectedSpecialization(null)}
      />
    );
  }

  return (
    <div className="spec-page">
      <header className="spec-page__header">
        <div>
          <h1 className="spec-page__title">
            {subTab === "list" ? "Специализации" : "Новая специализация"}
          </h1>
          <p className="spec-page__subtitle">
            {subTab === "list"
              ? "Выберите направление или добавьте новое"
              : "Укажите категорию, описание и ставку за час"}
          </p>
        </div>
        {subTab === "list" ? (
          <button
            type="button"
            className="spec-btn spec-btn--primary"
            onClick={() => setSubTab("add")}
          >
            <i className="fas fa-plus" aria-hidden="true" />
            Добавить
          </button>
        ) : (
          <button
            type="button"
            className="spec-btn spec-btn--primary"
            onClick={() => setSubTab("list")}
          >
            Отмена
          </button>
        )}
      </header>

      {subTab === "list" && (
        <>
          {categoriesWorksMaster.length === 0 ? (
            <div className="spec-empty">
              У вас пока нет специализаций. Нажмите «Добавить», чтобы создать
              первую.
            </div>
          ) : (
            <div className="spec-grid">
              {categoriesWorksMaster.map((spec) => (
                <button
                  key={
                    spec.category_works_master_id ||
                    spec.category_work_master_id ||
                    spec.category_work_id
                  }
                  type="button"
                  className="spec-card"
                  onClick={() => setSelectedSpecialization(spec)}
                >
                  <h3 className="spec-card__title">{spec.name}</h3>
                  <p className="spec-card__desc">
                    {spec.description_master || "Без описания"}
                  </p>
                  <span className="spec-card__rate">
                    {formatMoney(spec.cost_hour, spec.currency || "BYN")} / час
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {subTab === "add" && (
        <div className="spec-panel">
          <form className="spec-form" onSubmit={handleAddSpecialization}>
            <div className="spec-field">
              <label className="spec-label" htmlFor="spec-category">
                Категория работ
              </label>
              <CreatableSelect
                inputId="spec-category"
                options={categoriesWorks}
                value={categoryWorkMaster}
                onChange={setCategoryWorkMaster}
                isClearable
                placeholder="Выберите или создайте категорию..."
                className="spec-select"
                classNamePrefix="spec-react"
                styles={selectStyles}
              />
            </div>

            <div className="spec-field">
              <label className="spec-label" htmlFor="spec-desc">
                Описание
              </label>
              <textarea
                id="spec-desc"
                className="spec-textarea"
                placeholder="Расскажите о своём опыте в этой области..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="spec-field">
              <label className="spec-label" htmlFor="spec-exp">
                Стаж (лет)
              </label>
              <input
                id="spec-exp"
                type="number"
                min="0"
                className="spec-input"
                placeholder="0"
                value={experience}
                onChange={(e) => setExperience(e.target.value)}
              />
            </div>

            <div className="spec-field">
              <label className="spec-label" htmlFor="spec-rate">
                Стоимость за час (₽)
              </label>
              <input
                id="spec-rate"
                type="number"
                min="0"
                className="spec-input"
                placeholder="1000"
                value={costHour}
                onChange={(e) => setCostHour(e.target.value)}
              />
            </div>

            <div className="spec-form__actions">
              <button
                type="submit"
                className="spec-form__submit"
                disabled={saving}
              >
                {saving ? "Сохранение…" : "Добавить специализацию"}
              </button>
              <button
                type="button"
                className="spec-btn spec-btn--ghost"
                onClick={() => setSubTab("list")}
              >
                Отмена
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
