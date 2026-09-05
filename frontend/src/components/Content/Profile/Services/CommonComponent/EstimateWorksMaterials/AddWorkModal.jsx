import React, { useCallback, useMemo, useRef, useState } from "react";
import CreatableSelect from "react-select/creatable";
import { API, apiFetch } from "../../../../../../utils/api.js";
import {
  createMoneyAnchor,
  fetchNbrbRates,
  formatMoney,
  formatMoneyInput,
  normalizeCurrencyCode,
} from "../../../../../../utils/currency";
import { uiAlert } from "../../../../../UiDialog/uiDialog.js";
import "./estimate_works_materials.css";

const unitsList = ["м2", "шт", "кг", "м3", "пог.м"];
const CUSTOM_WORK_PREFIX = "custom:";

const getWorkNameFromOption = (option) => {
  if (!option) return "";
  const raw = (option.label ?? option.value ?? "").toString().trim();
  if (raw.startsWith(CUSTOM_WORK_PREFIX)) {
    return raw.slice(CUSTOM_WORK_PREFIX.length).trim();
  }
  return raw;
};

const isCustomWorkOption = (option) =>
  Boolean(
    option?.__isNew__ ||
      String(option?.value ?? "").startsWith(CUSTOM_WORK_PREFIX),
  );

const buildCustomWorkOption = (inputValue) => {
  const name = inputValue.trim();
  return {
    label: name,
    value: `${CUSTOM_WORK_PREFIX}${name}`,
    __isNew__: true,
  };
};

const handleNumericKeyDown = (e) => {
  const allowedKeys = [
    "Backspace",
    "Tab",
    "ArrowLeft",
    "ArrowRight",
    "Delete",
    "Home",
    "End",
    "Enter",
  ];
  if (allowedKeys.includes(e.key)) return;
  if (e.key >= "0" && e.key <= "9") return;

  const currentValue = e.currentTarget.value;
  const hasDecimal = /\./.test(currentValue) || /,/.test(currentValue);
  if ((e.key === "." || e.key === ",") && !hasDecimal) return;
  e.preventDefault();
};

export default function AddWorkModal({
  userId,
  orderId,
  orderExists,
  categoryWorkId,
  currency = "BYN",
  works = [],
  personalWorks = [],
  onClose,
  onAdded,
  onPersonalWorksNeedRefresh,
}) {
  const resolvedCurrency = normalizeCurrencyCode(currency || "BYN");
  const [sourceType, setSourceType] = useState("common");
  const [workInput, setWorkInput] = useState(null);
  const [workSelectInput, setWorkSelectInput] = useState("");
  const [unitMeasurement, setUnitMeasurement] = useState(null);
  const [workCost, setWorkCost] = useState("");
  const [workQuantity, setWorkQuantity] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const workCostAnchorRef = useRef(null);

  const catalogWorks = sourceType === "common" ? works : personalWorks;

  const workSelectOptions = useMemo(
    () =>
      catalogWorks.map((work) => ({
        value: String(work.work_id ?? work.id),
        label: work.name_work,
      })),
    [catalogWorks],
  );

  const fillWorkCostFromCatalog = useCallback(
    async (selectedWork) => {
      const rawCost = selectedWork.cost;
      if (rawCost == null || rawCost === "") {
        workCostAnchorRef.current = null;
        setWorkCost("");
        return;
      }

      const workCurrency = normalizeCurrencyCode(selectedWork.currency || "BYN");
      workCostAnchorRef.current = createMoneyAnchor(rawCost, workCurrency);

      if (workCurrency === resolvedCurrency) {
        setWorkCost(formatMoneyInput(rawCost));
        return;
      }

      try {
        const rates = await fetchNbrbRates();
        setWorkCost(
          formatMoneyInput(
            workCostAnchorRef.current.priceForCurrency(resolvedCurrency, rates),
          ),
        );
      } catch (error) {
        console.error(error);
        setWorkCost(String(rawCost));
      }
    },
    [resolvedCurrency],
  );

  const handleSourceChange = (type) => {
    setSourceType(type);
    setWorkInput(null);
    setWorkSelectInput("");
    setWorkCost("");
    setUnitMeasurement(null);
    setWorkQuantity("");
    workCostAnchorRef.current = null;
  };

  const handleWorkCostChange = (value) => {
    setWorkCost(value);
    const amount = Number(value);
    if (value !== "" && Number.isFinite(amount)) {
      workCostAnchorRef.current = createMoneyAnchor(amount, resolvedCurrency);
    } else {
      workCostAnchorRef.current = null;
    }
  };

  const handleWorkChange = (newValue) => {
    setWorkInput(newValue);
    setWorkSelectInput("");
    if (!newValue) {
      workCostAnchorRef.current = null;
      setWorkCost("");
      setUnitMeasurement(null);
      return;
    }

    if (isCustomWorkOption(newValue)) {
      workCostAnchorRef.current = null;
      setWorkCost("");
      setUnitMeasurement(null);
      return;
    }

    const workName = getWorkNameFromOption(newValue);
    const selectedWork = catalogWorks.find(
      (work) =>
        String(work.work_id ?? work.id) === String(newValue.value) ||
        (work.name_work &&
          work.name_work.trim().toLowerCase() === workName.toLowerCase()),
    );

    if (selectedWork) {
      fillWorkCostFromCatalog(selectedWork);
      setUnitMeasurement(
        selectedWork.unit_measurement
          ? {
              value: selectedWork.unit_measurement,
              label: selectedWork.unit_measurement,
            }
          : null,
      );
    } else {
      setWorkCost("");
      setUnitMeasurement(null);
    }
  };

  const handleCreateWorkOption = (inputValue) => {
    const option = buildCustomWorkOption(inputValue);
    if (!option.label) return;
    handleWorkChange(option);
  };

  const handleWorkSelectInputChange = (value, meta) => {
    if (meta.action === "input-change") {
      setWorkSelectInput(value);
      return;
    }
    if (meta.action === "set-value") {
      setWorkSelectInput("");
    }
  };

  const workNameDraft = workSelectInput.trim();
  const selectedWorkName = getWorkNameFromOption(workInput);
  const showApplyCustomWorkBtn =
    workNameDraft.length > 0 &&
    selectedWorkName.toLowerCase() !== workNameDraft.toLowerCase();

  const lineTotal = Number(workCost || 0) * Number(workQuantity || 0);

  const handleSubmit = async () => {
    if (!orderExists || !orderId) {
      await uiAlert("Сначала сохраните заказ!");
      return;
    }

    const workName = getWorkNameFromOption(workInput);
    if (!workName || !unitMeasurement?.value || !workCost || !workQuantity) {
      await uiAlert("Заполните все поля!");
      return;
    }

    const numQty = Number(workQuantity);
    if (numQty <= 0) {
      await uiAlert("Количество должно быть больше 0");
      return;
    }

    setIsSaving(true);
    try {
      const response = await apiFetch(`${API.baseURL}/add_work_into_estimate`, {
        method: "POST",
        body: JSON.stringify({
          user_id: parseInt(userId, 10),
          order_id: parseInt(orderId, 10),
          name_work: workName,
          quantity: numQty,
          unit_measurement: unitMeasurement.value,
          cost_unit: Number(workCost),
          currency: resolvedCurrency,
        }),
      });

      if (!response.ok) {
        await uiAlert("Ошибка при сохранении работы");
        return;
      }

      const data = await response.json();
      const workId = data.id;
      const newWork = {
        id: workId,
        workDescription: data.name_work || "Без названия",
        workQuantity: Number(data.quantity || 0),
        doneQuantity:
          data.done_quantity != null && data.done_quantity !== ""
            ? Number(data.done_quantity)
            : 0,
        workUnit: data.unit_measurement || "",
        workPricePerUnit: Number(data.cost_unit || 0),
        currency: data.currency || resolvedCurrency,
        materials: [],
      };
      const anchorSource = workCostAnchorRef.current?.get() || {
        amount: Number(workCost),
        currency: resolvedCurrency,
      };

      onAdded?.(newWork, anchorSource);
      if (categoryWorkId) {
        await onPersonalWorksNeedRefresh?.();
      }
      onClose();
    } catch (error) {
      console.error(error);
      await uiAlert("Ошибка соединения с сервером");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="materials-modal-overlay"
      onClick={isSaving ? undefined : onClose}
      role="presentation"
    >
      <div
        className="materials-modal materials-modal--add"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-work-modal-title"
      >
        <header className="materials-modal__header">
          <div className="materials-modal__header-text">
            <span className="materials-modal__badge">Смета</span>
            <h2 id="add-work-modal-title" className="materials-modal__title">
              Добавить работу
            </h2>
            <p className="materials-modal__subtitle">
              Выберите работу из каталога или введите своё название
            </p>
          </div>
          <button
            type="button"
            className="materials-modal__close"
            onClick={onClose}
            aria-label="Закрыть"
            disabled={isSaving}
          >
            ×
          </button>
        </header>

        <div className="materials-modal__body">
          <section className="materials-modal__card">
            <div className="materials-modal__source">
              <button
                type="button"
                className={`switcher-btn ${sourceType === "common" ? "active" : ""}`}
                onClick={() => handleSourceChange("common")}
                disabled={isSaving}
              >
                Общие работы
              </button>
              <button
                type="button"
                className={`switcher-btn ${sourceType === "personal" ? "active" : ""}`}
                onClick={() => handleSourceChange("personal")}
                disabled={isSaving}
              >
                Свои работы
              </button>
            </div>

            <div className="materials-modal__form">
              <label className="materials-modal__field">
                <span className="materials-modal__label">
                  Наименование работы
                </span>
                <CreatableSelect
                  key={`works-${sourceType}`}
                  isClearable
                  menuPortalTarget={document.body}
                  menuPosition="fixed"
                  inputValue={workSelectInput}
                  onInputChange={handleWorkSelectInputChange}
                  onChange={handleWorkChange}
                  onCreateOption={handleCreateWorkOption}
                  createOptionPosition="first"
                  getNewOptionData={buildCustomWorkOption}
                  options={workSelectOptions}
                  value={workInput}
                  placeholder="Выберите из списка или введите название"
                  formatCreateLabel={(inputValue) =>
                    inputValue.trim()
                      ? `Добавить «${inputValue.trim()}»`
                      : "Введите название"
                  }
                  isValidNewOption={(inputValue) => Boolean(inputValue?.trim())}
                  noOptionsMessage={() => "Введите название новой работы"}
                  openMenuOnFocus
                  styles={selectStyles}
                  isDisabled={isSaving}
                />
                {showApplyCustomWorkBtn && (
                  <button
                    type="button"
                    className="btn-apply-custom-work"
                    onClick={() => handleCreateWorkOption(workNameDraft)}
                    disabled={isSaving}
                  >
                    Использовать название «{workNameDraft}»
                  </button>
                )}
                <p className="field-hint">
                  {showApplyCustomWorkBtn
                    ? "Нажмите кнопку выше, чтобы подтвердить своё название работы."
                    : "Если работы нет в списке — введите название, затем нажмите появившуюся кнопку."}
                </p>
              </label>

              <div className="materials-modal__form-row materials-modal__form-row--triple">
                <label className="materials-modal__field">
                  <span className="materials-modal__label">Количество</span>
                  <input
                    type="text"
                    className="materials-modal__input"
                    placeholder="0.00"
                    value={workQuantity}
                    onChange={(e) => setWorkQuantity(e.target.value)}
                    onKeyDown={handleNumericKeyDown}
                    disabled={isSaving}
                  />
                </label>
                <label className="materials-modal__field">
                  <span className="materials-modal__label">Ед. изм.</span>
                  <CreatableSelect
                    isClearable
                    classNamePrefix="ew-select"
                    value={unitMeasurement}
                    menuPortalTarget={document.body}
                    menuPosition="fixed"
                    onChange={setUnitMeasurement}
                    options={unitsList.map((unit) => ({
                      value: unit,
                      label: unit,
                    }))}
                    placeholder="Выберите или введите"
                    formatCreateLabel={(inputValue) =>
                      inputValue.trim()
                        ? `Добавить «${inputValue.trim()}»`
                        : "Введите единицу"
                    }
                    isValidNewOption={(inputValue) =>
                      Boolean(inputValue?.trim())
                    }
                    noOptionsMessage={() => "Введите единицу измерения"}
                    styles={unitSelectStyles}
                    isDisabled={isSaving}
                  />
                </label>
                <label className="materials-modal__field">
                  <span className="materials-modal__label">
                    Цена за ед. ({resolvedCurrency})
                  </span>
                  <input
                    type="text"
                    className="materials-modal__input"
                    placeholder="0.00"
                    value={workCost}
                    onChange={(e) => handleWorkCostChange(e.target.value)}
                    onKeyDown={handleNumericKeyDown}
                    disabled={isSaving}
                  />
                </label>
              </div>
            </div>

            <div className="materials-modal__preview">
              <span className="materials-modal__preview-label">
                Сумма по позиции
              </span>
              <span className="materials-modal__preview-value">
                {formatMoney(lineTotal, resolvedCurrency)}
              </span>
            </div>
          </section>
        </div>

        <footer className="materials-modal__footer materials-modal__footer--actions">
          <button
            type="button"
            className="materials-modal__btn-secondary"
            onClick={onClose}
            disabled={isSaving}
          >
            Отмена
          </button>
          <button
            type="button"
            className="materials-modal__btn-primary materials-modal__btn-primary--inline"
            onClick={handleSubmit}
            disabled={isSaving || !orderExists}
          >
            {isSaving ? "Сохранение…" : "Добавить в смету"}
          </button>
        </footer>
      </div>
    </div>
  );
}

const selectStyles = {
  control: (base, state) => ({
    ...base,
    width: "100%",
    minHeight: "42px",
    height: "42px",
    borderRadius: "10px",
    border: state.isFocused ? "1px solid #2563eb" : "1px solid #cbd5e1",
    boxShadow: state.isFocused ? "0 0 0 3px rgba(37, 99, 235, 0.12)" : "none",
    fontSize: "0.875rem",
    backgroundColor: "#ffffff",
    cursor: "pointer",
    boxSizing: "border-box",
    padding: "0 4px",
    transition: "border-color 0.2s ease, box-shadow 0.2s ease",
  }),
  valueContainer: (base) => ({
    ...base,
    padding: "2px 12px",
    height: "40px",
    display: "flex",
    alignItems: "center",
    flexWrap: "nowrap",
    boxSizing: "border-box",
  }),
  input: (base) => ({
    ...base,
    margin: 0,
    padding: 0,
    fontSize: "13px",
    color: "#1f2937",
  }),
  placeholder: (base) => ({
    ...base,
    color: "#9ca3af",
    fontSize: "13px",
    margin: 0,
  }),
  singleValue: (base) => ({
    ...base,
    color: "#1f2937",
    fontSize: "13px",
    fontWeight: "500",
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  }),
  menu: (base) => ({
    ...base,
    borderRadius: "10px",
    boxShadow: "0 10px 25px rgba(0, 0, 0, 0.15)",
    border: "1px solid #e5e7eb",
    marginTop: "2px",
    zIndex: 9999,
  }),
  menuPortal: (base) => ({
    ...base,
    zIndex: 1200,
  }),
  option: (base, state) => ({
    ...base,
    padding: "10px 14px",
    fontSize: "13px",
    backgroundColor: state.isFocused
      ? "#3b82f6"
      : state.isSelected
        ? "#2563eb"
        : "#ffffff",
    color: state.isFocused || state.isSelected ? "#ffffff" : "#1f2937",
    cursor: "pointer",
  }),
  dropdownIndicator: (base) => ({
    ...base,
    padding: "0 8px",
    color: "#6b7280",
  }),
  clearIndicator: (base) => ({
    ...base,
    padding: "0 8px",
    color: "#6b7280",
  }),
};

const METRICS_FIELD_HEIGHT = 42;

const unitSelectStyles = {
  ...selectStyles,
  control: (base, state) => ({
    ...selectStyles.control(base, state),
    minHeight: METRICS_FIELD_HEIGHT,
    height: METRICS_FIELD_HEIGHT,
    padding: 0,
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
  }),
  valueContainer: (base) => ({
    ...selectStyles.valueContainer(base),
    height: METRICS_FIELD_HEIGHT - 2,
    minHeight: METRICS_FIELD_HEIGHT - 2,
    padding: "0 8px",
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
  }),
  indicatorsContainer: (base) => ({
    ...base,
    height: METRICS_FIELD_HEIGHT - 2,
    alignSelf: "center",
    flexShrink: 0,
  }),
};
