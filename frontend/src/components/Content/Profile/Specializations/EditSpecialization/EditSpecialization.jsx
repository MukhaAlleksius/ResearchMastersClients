import React, { useState, useEffect } from "react";
import { API, apiFetch, buildApiUrl } from "../../../../../utils/api.js";
import { normalizeCurrencyCode } from "../../../../../utils/currency";
import "../specializations.css";

import { uiAlert } from "../../../../UiDialog/uiDialog.js";

const NAV_KEYS = [
  "Backspace",
  "Tab",
  "ArrowLeft",
  "ArrowRight",
  "Delete",
  "Home",
  "End",
];

const sanitizeDecimalInput = (value, maxFractionDigits) => {
  let raw = String(value ?? "").replace(",", ".");
  raw = raw.replace(/[^\d.]/g, "");

  const dotIndex = raw.indexOf(".");
  if (dotIndex === -1) {
    return raw;
  }

  const intPart = raw.slice(0, dotIndex);
  const fracPart = raw.slice(dotIndex + 1).replace(/\./g, "");
  return `${intPart}.${fracPart.slice(0, maxFractionDigits)}`;
};

const handleDecimalKeyDown = (e, maxFractionDigits) => {
  if (NAV_KEYS.includes(e.key)) return;
  if (e.key >= "0" && e.key <= "9") {
    const current = e.currentTarget.value.replace(",", ".");
    const dotIndex = current.indexOf(".");
    if (dotIndex >= 0) {
      const selectionStart = e.currentTarget.selectionStart ?? 0;
      const selectionEnd = e.currentTarget.selectionEnd ?? 0;
      const hasSelection = selectionStart !== selectionEnd;
      const fracPart = current.slice(dotIndex + 1);
      if (
        !hasSelection &&
        selectionStart > dotIndex &&
        fracPart.length >= maxFractionDigits
      ) {
        e.preventDefault();
      }
    }
    return;
  }

  const currentValue = e.currentTarget.value;
  const hasDecimal = /\./.test(currentValue) || /,/.test(currentValue);
  if ((e.key === "." || e.key === ",") && !hasDecimal) return;

  e.preventDefault();
};

export default function EditSpecialization({
  specialization,
  currency: worksCurrency = "BYN",
  onUpdated,
  onDelete,
  deleting = false,
}) {
  const displayCurrency = normalizeCurrencyCode(worksCurrency);

  const [description, setDescription] = useState(
    specialization.description_master || "",
  );
  const [experience, setExperience] = useState(
    sanitizeDecimalInput(specialization.experience ?? "", 1),
  );
  const [costHour, setCostHour] = useState(
    sanitizeDecimalInput(specialization.cost_hour ?? "", 2),
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({
    description: false,
    experience: false,
    costHour: false,
  });

  useEffect(() => {
    setDescription(specialization.description_master || "");
    setExperience(sanitizeDecimalInput(specialization.experience ?? "", 1));
    setCostHour(sanitizeDecimalInput(specialization.cost_hour ?? "", 2));
    setSaved(false);
    setFieldErrors({ description: false, experience: false, costHour: false });
  }, [specialization]);

  const clearFieldError = (field) => {
    setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: false } : prev));
  };

  const handleSave = async () => {
    const nextErrors = {
      description: String(description ?? "").trim() === "",
      experience: String(experience ?? "").trim() === "",
      costHour: String(costHour ?? "").trim() === "",
    };
    setFieldErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      setSaved(false);
      return;
    }

    setSaving(true);
    setSaved(false);
    try {
      const master_id = localStorage.getItem("user_id");
      const response = await apiFetch(
        buildApiUrl("/change_category_work_master"),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category_work_master_id: specialization.category_work_master_id,
            master_id,
            category_work_id: specialization.category_work_id,
            description,
            experience: experience === "" ? 0 : Number(experience),
            cost_hour: costHour === "" ? 0 : Number(costHour),
            currency: displayCurrency,
          }),
        },
      );
      const response_data = await response.json();
      if (!response.ok) throw new Error("Ошибка сохранения");

      const nextDescription = response_data.description ?? description;
      const nextExperience = sanitizeDecimalInput(
        response_data.experience ?? experience,
        1,
      );
      const nextCostHour = sanitizeDecimalInput(
        response_data.cost_hour ?? costHour,
        2,
      );
      const nextCurrency = normalizeCurrencyCode(
        response_data.currency ?? displayCurrency,
      );

      setDescription(nextDescription);
      setExperience(nextExperience);
      setCostHour(nextCostHour);
      setSaved(true);

      onUpdated?.({
        description_master: nextDescription,
        experience: nextExperience,
        cost_hour: nextCostHour,
        currency: nextCurrency,
      });
    } catch (error) {
      console.error(error);
      await uiAlert("Не удалось сохранить изменения");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="spec-form"
      onSubmit={(e) => {
        e.preventDefault();
        handleSave();
      }}
    >
      <p className="spec-page__subtitle" style={{ color: "#64748b", margin: 0 }}>
        Название: <strong style={{ color: "#0f172a" }}>{specialization.name}</strong>
      </p>

      <div className="spec-field">
        <label className="spec-label" htmlFor="edit-desc">
          Описание
          <span className="spec-required" aria-hidden="true">
            *
          </span>
        </label>
        <textarea
          id="edit-desc"
          className={`spec-textarea${fieldErrors.description ? " spec-textarea--invalid" : ""}`}
          value={description}
          aria-invalid={fieldErrors.description || undefined}
          aria-required="true"
          onChange={(e) => {
            setDescription(e.target.value);
            if (e.target.value.trim()) clearFieldError("description");
          }}
          placeholder="Опишите специализацию..."
        />
        {fieldErrors.description && (
          <p className="spec-field__error" role="alert">
            Заполните описание
          </p>
        )}
      </div>

      <div className="spec-field">
        <label className="spec-label" htmlFor="edit-exp">
          Опыт (лет)
          <span className="spec-required" aria-hidden="true">
            *
          </span>
        </label>
        <input
          id="edit-exp"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          className={`spec-input${fieldErrors.experience ? " spec-input--invalid" : ""}`}
          value={experience}
          aria-invalid={fieldErrors.experience || undefined}
          aria-required="true"
          onChange={(e) => {
            const next = sanitizeDecimalInput(e.target.value, 1);
            setExperience(next);
            if (next.trim()) clearFieldError("experience");
          }}
          onKeyDown={(e) => handleDecimalKeyDown(e, 1)}
          placeholder="0.0"
        />
        {fieldErrors.experience && (
          <p className="spec-field__error" role="alert">
            Укажите стаж
          </p>
        )}
      </div>

      <div className="spec-row-2 spec-row-2--rate">
        <div className="spec-field">
          <label className="spec-label" htmlFor="edit-rate">
            Стоимость за час ({displayCurrency})
            <span className="spec-required" aria-hidden="true">
              *
            </span>
          </label>
          <input
            id="edit-rate"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            className={`spec-input${fieldErrors.costHour ? " spec-input--invalid" : ""}`}
            value={costHour}
            aria-invalid={fieldErrors.costHour || undefined}
            aria-required="true"
            onChange={(e) => {
              const next = sanitizeDecimalInput(e.target.value, 2);
              setCostHour(next);
              if (next.trim()) clearFieldError("costHour");
            }}
            onKeyDown={(e) => handleDecimalKeyDown(e, 2)}
            placeholder="0.00"
          />
          {fieldErrors.costHour && (
            <p className="spec-field__error" role="alert">
              Укажите стоимость за час
            </p>
          )}
        </div>
        <div className="spec-field">
          <span className="spec-label">Валюта</span>
          <span className="spec-currency-readonly">{displayCurrency}</span>
        </div>
      </div>

      <div className="spec-form__actions">
        <button type="submit" className="spec-form__submit" disabled={saving}>
          {saving ? "Сохранение…" : "Сохранить изменения"}
        </button>
        {saved && (
          <span className="spec-pill" style={{ alignSelf: "center" }}>
            <i className="fas fa-check" aria-hidden="true" />
            Сохранено
          </span>
        )}
      </div>

      <div className="spec-danger-zone">
        <h3 className="spec-danger-zone__title">Удаление специализации</h3>
        <p className="spec-danger-zone__text">
          Специализация исчезнет из профиля. Вместе с ней будут удалены работы
          каталога и собственные работы этой категории.
        </p>
        <button
          type="button"
          className="spec-btn spec-btn--danger"
          disabled={deleting || saving}
          onClick={onDelete}
        >
          <i className="fas fa-trash-alt" aria-hidden="true" />
          {deleting ? "Удаление…" : "Удалить специализацию"}
        </button>
      </div>
    </form>
  );
}
