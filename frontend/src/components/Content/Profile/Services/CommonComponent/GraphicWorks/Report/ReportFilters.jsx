import React, { useRef } from "react";
import Select from "react-select";
import { isoToDisplayDate, selectStyles } from "./reportUtils";

function DatePickerField({ label, value, onChange, min, max }) {
  const inputRef = useRef(null);

  const openPicker = () => {
    const input = inputRef.current;
    if (!input) return;

    if (typeof input.showPicker === "function") {
      try {
        input.showPicker();
        return;
      } catch {
        // showPicker may throw if not triggered by user gesture in some browsers
      }
    }

    input.focus();
  };

  return (
    <label className="rw-filters__date-field">
      <span className="rw-filters__date-label">{label}</span>
      <div className="rw-filters__date-picker">
        <span
          className={`rw-filters__date-display${value ? "" : " rw-filters__date-display--placeholder"}`}
          aria-hidden="true"
        >
          {value ? isoToDisplayDate(value) : "дд.мм.гг"}
        </span>
        <input
          ref={inputRef}
          type="date"
          className="rw-filters__date-input rw-filters__date-input--overlay"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onClick={openPicker}
          min={min}
          max={max}
          aria-label={label}
        />
        <button
          type="button"
          className="rw-filters__date-icon-btn"
          onClick={openPicker}
          tabIndex={-1}
          aria-hidden="true"
        >
          <i className="fas fa-calendar-alt" />
        </button>
      </div>
    </label>
  );
}

/**
 * @param {"single" | "range"} dateMode
 * @param {"table" | "chart"} variant — table: multi works; chart: single work
 */
export default function ReportFilters({
  dateMode,
  onDateModeChange,
  singleDate,
  onSingleDateChange,
  rangeStart,
  onRangeStartChange,
  rangeEnd,
  onRangeEndChange,
  workOptions = [],
  selectedWorkOptions,
  onWorksChange,
  selectedWorkOption,
  onWorkChange,
  variant = "table",
}) {
  return (
    <div className="rw-filters">
      <div className="rw-filters__section">
        <div className="rw-filters__section-head">
          <i className="fas fa-calendar-alt" aria-hidden="true" />
          <span>Период</span>
        </div>

        <div className="rw-filters__segmented" role="group" aria-label="Тип периода">
          <button
            type="button"
            className={`rw-filters__segment ${dateMode === "single" ? "rw-filters__segment--active" : ""}`}
            onClick={() => onDateModeChange("single")}
          >
            Одна дата
          </button>
          <button
            type="button"
            className={`rw-filters__segment ${dateMode === "range" ? "rw-filters__segment--active" : ""}`}
            onClick={() => onDateModeChange("range")}
          >
            Диапазон
          </button>
        </div>

        <div className="rw-filters__dates">
          {dateMode === "single" ? (
            <DatePickerField
              label="Дата"
              value={singleDate}
              onChange={onSingleDateChange}
            />
          ) : (
            <>
              <DatePickerField
                label="С"
                value={rangeStart}
                onChange={onRangeStartChange}
                max={rangeEnd || undefined}
              />
              <span className="rw-filters__date-arrow" aria-hidden="true">
                →
              </span>
              <DatePickerField
                label="По"
                value={rangeEnd}
                onChange={onRangeEndChange}
                min={rangeStart || undefined}
              />
            </>
          )}
        </div>
      </div>

      <div className="rw-filters__section">
        <div className="rw-filters__section-head">
          <i className="fas fa-briefcase" aria-hidden="true" />
          <span>{variant === "chart" ? "Работа" : "Работы"}</span>
        </div>

        {variant === "chart" ? (
          <Select
            options={workOptions}
            value={selectedWorkOption}
            onChange={onWorkChange}
            isClearable
            isSearchable
            placeholder="Выберите работу для графика..."
            noOptionsMessage={() => "Нет работ"}
            className="rw-filters__select"
            classNamePrefix="rw-select"
            styles={selectStyles}
          />
        ) : (
          <Select
            isMulti
            options={workOptions}
            value={selectedWorkOptions}
            onChange={onWorksChange}
            isClearable
            closeMenuOnSelect={false}
            hideSelectedOptions={false}
            placeholder="Все работы — выберите одну или несколько..."
            className="rw-filters__select"
            classNamePrefix="rw-select"
            styles={selectStyles}
          />
        )}
      </div>
    </div>
  );
}
