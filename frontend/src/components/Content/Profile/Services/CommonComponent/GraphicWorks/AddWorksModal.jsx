import React, { useState, useCallback } from "react";
import { API, apiFetch } from "../../../../../../utils/api.js";
import CreatableSelect from "react-select/creatable";
const selectStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: 42,
    borderRadius: 10,
    borderColor: state.isFocused ? "#2563eb" : "#e2e8f0",
    boxShadow: state.isFocused ? "0 0 0 3px rgba(37, 99, 235, 0.1)" : "none",
    fontSize: "0.875rem",
    "&:hover": { borderColor: "#94a3b8" },
  }),
  indicatorSeparator: () => ({ display: "none" }),
  menu: (base) => ({
    ...base,
    borderRadius: 10,
    zIndex: 50,
    boxShadow: "0 10px 28px rgba(15, 23, 42, 0.12)",
  }),
  menuPortal: (base) => ({
    ...base,
    zIndex: 9999,
  }),
};

export default function AddWorksModal({
  userId,
  orderId,
  fetchGraphicWorks,
  onGraphicWorkAdded,
  onGraphicWorkUpdated,
  isOpen,
  onClose,
  selectedDate,
  selectedWorkOption,
  setSelectedWorkOption,
  selectedWorkId,
  setSelectedWorkId,
  quantity,
  setQuantity,
  works,
  worksOptions,
  estimatePriceByWorkName = {},
  workSourceType = "common",
  onWorkSourceChange,
  loadingCatalog = false,
  unitOptions,
  isAddButtonDisabled,
  loading,
  setLoading,
}) {
  const [saving, setSaving] = useState(false);
  const [editingWorkId, setEditingWorkId] = useState(null);
  const [unit, setUnit] = useState("шт");
  const [costPerUnit, setCostPerUnit] = useState("");

  const resolveCostForWorkName = useCallback(
    (workName, fallback = "") => {
      if (!workName) return fallback;
      const fromEstimate = estimatePriceByWorkName[workName];
      if (fromEstimate != null && fromEstimate > 0) {
        return String(fromEstimate);
      }
      const matched = worksOptions.find((opt) => opt.label === workName);
      if (matched?.cost_unit) {
        return String(matched.cost_unit);
      }
      return fallback;
    },
    [estimatePriceByWorkName, worksOptions],
  );

  const handleWorkSelect = (newValue) => {
    setSelectedWorkOption(newValue);
    if (!newValue) {
      setSelectedWorkId("");
      setCostPerUnit("");
      return;
    }
    const matched = worksOptions.find(
      (opt) =>
        opt.originalId &&
        opt.label === newValue.label &&
        String(opt.value) === String(newValue.value),
    );
    setSelectedWorkId(matched?.originalId || "");
    if (matched?.unit_measurement) {
      setUnit(matched.unit_measurement);
    }
    setCostPerUnit(resolveCostForWorkName(newValue.label));
  };

  const resetEdit = useCallback(() => {
    setEditingWorkId(null);
    setSelectedWorkOption(null);
    setSelectedWorkId("");
    setQuantity("");
    setUnit("шт");
    setCostPerUnit("");
  }, [setQuantity, setSelectedWorkId, setSelectedWorkOption]);

  const onPickWork = useCallback(
    (work) => {
      setEditingWorkId(work.id);
      handleWorkSelect({
        value: work.work_master_id || work.id || work.name_work,
        label: work.name_work,
        originalId: work.work_master_id || work.id,
      });
      setQuantity(String(work.quantity ?? ""));
      setUnit(work.unit_measurement || "шт");
      setCostPerUnit(resolveCostForWorkName(work.name_work));
    },
    [resolveCostForWorkName, setQuantity],
  );

  const handleKeyDown = (e) => {
    const allowed = [
      "Backspace",
      "Tab",
      "ArrowLeft",
      "ArrowRight",
      "Delete",
      "Home",
      "End",
      "Enter",
    ];
    if (allowed.includes(e.key)) return;
    if (e.key >= "0" && e.key <= "9") return;
    const v = e.currentTarget.value;
    if ((e.key === "." || e.key === ",") && !/\./.test(v) && !/,/.test(v)) return;
    e.preventDefault();
  };

  const parsePositiveNumber = (value, label) => {
    const normalized = String(value || "").replace(",", ".");
    const parsed = parseFloat(normalized);
    if (isNaN(parsed) || parsed < 0) {
      alert(`Введите корректную ${label}`);
      return null;
    }
    return Number(parsed.toFixed(2));
  };

  const apiPost = useCallback(async (endpoint, data) => {
    const res = await apiFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Ошибка сохранения");
    return res.json();
  }, []);

  const addWork = useCallback(async () => {
    if (!selectedWorkOption?.label || !quantity || !selectedDate) {
      alert("Выберите работу, дату и укажите количество");
      return;
    }
    const qty = parsePositiveNumber(quantity, "положительное количество");
    if (qty == null || qty <= 0) return;

    const cost = parsePositiveNumber(costPerUnit, "стоимость за единицу");
    if (cost == null) return;

    setLoading(true);
    try {
      const createdWork = await apiPost(
        `${API.baseURL}/add_work_into_graphic_works`,
        {
          user_id: Number(userId),
          order_id: Number(orderId),
          name_work: selectedWorkOption.label,
          quantity: qty,
          unit_measurement: unit,
          work_date: selectedDate,
          cost_unit: cost,
        },
      );
      onGraphicWorkAdded?.(createdWork);
      await fetchGraphicWorks();
      resetEdit();
    } catch (error) {
      console.error(error);
      alert("Не удалось добавить работу");
    } finally {
      setLoading(false);
    }
  }, [
    selectedWorkOption,
    quantity,
    costPerUnit,
    selectedDate,
    unit,
    userId,
    orderId,
    apiPost,
    fetchGraphicWorks,
    onGraphicWorkAdded,
    resetEdit,
    setLoading,
  ]);

  const updateWork = useCallback(async () => {
    if (!editingWorkId || !selectedWorkOption?.label || !quantity) return;

    const qty = parsePositiveNumber(quantity, "положительное количество");
    if (qty == null || qty <= 0) return;

    const cost = parsePositiveNumber(costPerUnit, "стоимость за единицу");
    if (cost == null) return;

    try {
      setSaving(true);
      const response = await apiFetch(
        `${API.baseURL}/update_work_into_graphic_works/${userId}/${orderId}/${editingWorkId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name_work: selectedWorkOption.label,
            quantity: qty,
            unit_measurement: unit,
            work_date: selectedDate,
            cost_unit: cost,
          }),
        },
      );
      if (!response.ok) throw new Error("Ошибка обновления");
      const updatedWork = await response.json();
      onGraphicWorkUpdated?.(updatedWork);
      await fetchGraphicWorks();
      resetEdit();
    } catch (e) {
      console.error(e);
      alert("Не удалось обновить работу");
    } finally {
      setSaving(false);
    }
  }, [
    editingWorkId,
    selectedWorkOption,
    quantity,
    costPerUnit,
    unit,
    selectedDate,
    userId,
    orderId,
    fetchGraphicWorks,
    onGraphicWorkUpdated,
    resetEdit,
  ]);

  const deleteWork = useCallback(
    async (workId) => {
      if (!workId || !window.confirm("Удалить эту работу?")) return;
      try {
        setSaving(true);
        await apiFetch(
          `${API.baseURL}/delete_work_from_graphic_works/${userId}/${orderId}/${workId}`,
          { method: "DELETE" },
        );
        await fetchGraphicWorks();
        resetEdit();
      } catch (e) {
        console.error(e);
        alert("Не удалось удалить работу");
      } finally {
        setSaving(false);
      }
    },
    [userId, orderId, fetchGraphicWorks, resetEdit],
  );

  if (!isOpen) return null;

  const busy = saving || loading || loadingCatalog;
  const submitDisabled =
    isAddButtonDisabled || busy || !costPerUnit || Number(costPerUnit) < 0;

  return (
    <div className="gw-modal-overlay" onClick={onClose} role="presentation">
      <div
        className="gw-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gw-modal-title"
      >
        <header className="gw-modal__head">
          <div>
            <p className="gw-modal__kicker">День в графике</p>
            <h2 id="gw-modal-title" className="gw-modal__title">
              Работы
            </h2>
          </div>
          <button
            type="button"
            className="gw-modal__close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </header>

        <div className="gw-modal__list">
          {works.length === 0 ? (
            <p className="gw-modal__empty">
              Работ пока нет.
              <br />
              Добавьте первую ниже.
            </p>
          ) : (
            works.map((work, index) => (
              <div
                key={work.id || `${work.name_work}-${index}`}
                className={`gw-modal__item ${editingWorkId === work.id ? "gw-modal__item--active" : ""}`}
              >
                <div className="gw-modal__item-info">
                  <div className="gw-modal__item-name">{work.name_work}</div>
                </div>
                <span className="gw-modal__item-qty">
                  {work.quantity} {work.unit_measurement}
                </span>
                <div className="gw-modal__item-actions">
                  <button
                    type="button"
                    className="gw-modal__icon-btn"
                    onClick={() => onPickWork(work)}
                    disabled={busy}
                    title="Редактировать"
                    aria-label="Редактировать"
                  >
                    <i className="fas fa-pen" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="gw-modal__icon-btn gw-modal__icon-btn--danger"
                    onClick={() => deleteWork(work.id)}
                    disabled={busy}
                    title="Удалить"
                    aria-label="Удалить"
                  >
                    <i className="fas fa-trash-alt" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <footer className="gw-modal__foot">
          <p className="gw-modal__form-label">
            {editingWorkId ? "Редактирование" : "Новая работа"}
          </p>

          <div
            className="gw-modal__source-switcher"
            role="group"
            aria-label="Источник списка работ"
          >
            <button
              type="button"
              className={`gw-modal__source-btn ${workSourceType === "common" ? "gw-modal__source-btn--active" : ""}`}
              onClick={() => onWorkSourceChange?.("common")}
              disabled={busy}
            >
              Общие работы
            </button>
            <button
              type="button"
              className={`gw-modal__source-btn ${workSourceType === "estimate" ? "gw-modal__source-btn--active" : ""}`}
              onClick={() => onWorkSourceChange?.("estimate")}
              disabled={busy}
            >
              Из сметы
            </button>
          </div>

          <CreatableSelect
            key={workSourceType}
            options={worksOptions}
            value={selectedWorkOption}
            onChange={handleWorkSelect}
            isClearable
            isDisabled={busy}
            menuPortalTarget={document.body}
            menuPosition="fixed"
            placeholder="Выберите из списка или введите название"
            formatCreateLabel={(inputValue) =>
              inputValue.trim()
                ? `Добавить «${inputValue.trim()}»`
                : "Введите название"
            }
            isValidNewOption={(inputValue) => Boolean(inputValue?.trim())}
            noOptionsMessage={() =>
              workSourceType === "estimate"
                ? "В смете пока нет работ для этого заказа"
                : "Введите название новой работы"
            }
            classNamePrefix="gw-select"
            styles={selectStyles}
          />

          <div className="gw-modal__row">
            <input
              type="number"
              min="0.01"
              step="0.01"
              placeholder="Количество"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              onKeyDown={handleKeyDown}
              className="gw-modal__input"
              disabled={busy}
            />
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="gw-modal__select-native"
              disabled={busy}
            >
              {unitOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="Стоимость за единицу"
            value={costPerUnit}
            onChange={(e) => setCostPerUnit(e.target.value)}
            onKeyDown={handleKeyDown}
            className="gw-modal__input gw-modal__input--cost"
            disabled={busy}
          />

          <button
            type="button"
            onClick={editingWorkId ? updateWork : addWork}
            className="gw-modal__submit"
            disabled={submitDisabled}
          >
            {busy
              ? "Сохранение…"
              : editingWorkId
                ? "Сохранить"
                : "Добавить работу"}
          </button>
        </footer>
      </div>
    </div>
  );
}
