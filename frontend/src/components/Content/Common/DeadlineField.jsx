import React, { useMemo, useRef } from "react";
import "./deadline_field.css";

export const DEADLINE_PRESETS = [
  "Как можно скорее",
  "В течение недели",
  "В течение месяца",
];

export const EXACT_DATE_OPTION = "Точная дата";

export function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
}

export function isDisplayDate(value) {
  return /^\d{2}\.\d{2}\.\d{4}$/.test(String(value || "").trim());
}

/** Преобразует срок в YYYY-MM-DD для input type="date". */
export function toIsoDate(value) {
  const raw = String(value || "").trim();
  if (!raw || raw === EXACT_DATE_OPTION) return "";
  if (isIsoDate(raw)) return raw;
  const dotted = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dotted) {
    const day = dotted[1].padStart(2, "0");
    const month = dotted[2].padStart(2, "0");
    return `${dotted[3]}-${month}-${day}`;
  }
  return "";
}

/** Преобразует срок в дд.мм.гггг. */
export function toDisplayDate(value) {
  const iso = toIsoDate(value);
  if (!iso) return "";
  const [year, month, day] = iso.split("-");
  return `${day}.${month}.${year}`;
}

export function isExactDeadline(value) {
  return value === EXACT_DATE_OPTION || Boolean(toIsoDate(value));
}

export function isValidDeadline(value) {
  if (DEADLINE_PRESETS.includes(value)) return true;
  return Boolean(toIsoDate(value));
}

export function todayIsoDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Селект срока + календарь при выборе «Точная дата».
 * В value уходит пресет или дата в формате дд.мм.гггг.
 */
export default function DeadlineField({
  id = "deadline",
  value,
  onChange,
  label = "Когда нужно выполнить",
  labelClassName = "label",
  selectClassName = "select",
  inputClassName = "input",
  fieldClassName = "",
  required = true,
  minDate,
}) {
  const inputRef = useRef(null);
  const min = minDate || todayIsoDate();
  const exact = isExactDeadline(value);
  const selectValue = exact
    ? EXACT_DATE_OPTION
    : DEADLINE_PRESETS.includes(value)
      ? value
      : DEADLINE_PRESETS[0];
  const isoValue = useMemo(() => toIsoDate(value), [value]);
  const displayValue = useMemo(() => toDisplayDate(value), [value]);

  const openPicker = () => {
    const input = inputRef.current;
    if (!input) return;
    if (typeof input.showPicker === "function") {
      try {
        input.showPicker();
        return;
      } catch {
        // ignore
      }
    }
    input.focus();
    input.click();
  };

  const handleSelectChange = (e) => {
    const next = e.target.value;
    if (next === EXACT_DATE_OPTION) {
      onChange(displayValue || EXACT_DATE_OPTION);
      return;
    }
    onChange(next);
  };

  const handleDateChange = (e) => {
    const iso = e.target.value;
    onChange(iso ? toDisplayDate(iso) : EXACT_DATE_OPTION);
  };

  return (
    <div className={fieldClassName || undefined}>
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
      <select
        id={id}
        value={selectValue}
        onChange={handleSelectChange}
        className={selectClassName}
      >
        {DEADLINE_PRESETS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        <option value={EXACT_DATE_OPTION}>{EXACT_DATE_OPTION}</option>
      </select>

      {selectValue === EXACT_DATE_OPTION && (
        <div className="deadline-field__calendar">
          <span className={labelClassName}>Выберите дату</span>
          <div className="deadline-field__picker">
            <span
              className={`deadline-field__display${
                displayValue ? "" : " deadline-field__display--placeholder"
              }`}
              aria-hidden="true"
            >
              {displayValue || "дд.мм.гггг"}
            </span>
            <input
              ref={inputRef}
              id={`${id}-date`}
              type="date"
              className={`deadline-field__input ${inputClassName}`.trim()}
              value={isoValue}
              min={min}
              required={required}
              onChange={handleDateChange}
              onClick={openPicker}
              aria-label="Выберите дату"
            />
            <button
              type="button"
              className="deadline-field__icon-btn"
              onClick={openPicker}
              aria-label="Открыть календарь"
            >
              📅
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
