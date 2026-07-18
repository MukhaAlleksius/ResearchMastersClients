import React, { useState } from "react";
import { API, apiFetch } from "../../../../../../utils/api.js";
import {
  formatMoney,
  normalizeCurrencyCode,
} from "../../../../../../utils/currency";
import {
  buildMaterialCreatePayload,
  updateMaterialInEstimate,
} from "../../../../../../utils/estimateStorage.js";
import "./estimate_works_materials.css";

export default function ModalAddMaterials({
  workId,
  userId,
  orderId,
  onClose,
  onAddMaterial,
  onUpdateMaterial,
  materialsList,
  setMaterialsList,
  addedWorks,
  currency: estimateCurrency = "BYN",
}) {
  const [materialInput, setMaterialInput] = useState("");
  const [materialUnitMeasurement, setMaterialUnitMeasurement] = useState("");
  const [materialQuantity, setMaterialQuantity] = useState("");
  const [materialCostForUnit, setMaterialCostForUnit] = useState("");

  const [editingMaterialId, setEditingMaterialId] = useState(null);
  const [editingMaterialData, setEditingMaterialData] = useState(null);

  const resolvedCurrency = normalizeCurrencyCode(estimateCurrency || "BYN");

  const work = addedWorks.find((w) => w.id == workId);
  const materials = work?.materials || [];

  const materialsTotal = materials.reduce(
    (sum, mat) =>
      sum +
      Number(mat.materialPricePerUnit || 0) *
        Number(mat.materialQuantity || 0),
    0,
  );

  const handleKeyDown = (e) => {
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
    if (
      (e.key === "." || e.key === ",") &&
      !/\./.test(currentValue) &&
      !/,/.test(currentValue)
    ) {
      return;
    }
    e.preventDefault();
  };

  const handleAddMaterial = async () => {
    if (
      !materialInput ||
      !materialUnitMeasurement ||
      !materialQuantity ||
      !materialCostForUnit
    ) {
      alert("Пожалуйста, заполните все поля материала.");
      return;
    }

    const currency = resolvedCurrency;

    const formatted_data_estimate_material = buildMaterialCreatePayload(
      work?.realWorkId || workId,
      {
        materialDescription: materialInput,
        materialQuantity: materialQuantity,
        materialUnit: materialUnitMeasurement,
        materialPricePerUnit: materialCostForUnit,
      },
      currency,
    );

    try {
      const response = await apiFetch(
        `${API.baseURL}/add_material_for_work_into_estimate`,
        {
          method: "POST",
          body: JSON.stringify(formatted_data_estimate_material),
        },
      );

      if (!response.ok) {
        const errorData = await response.text();
        alert(`Ошибка ${response.status}: ${errorData}`);
        return;
      }

      const data = await response.json();

      onAddMaterial(workId, {
        id: data.id,
        materialDescription: data.name_material,
        materialUnit: data.unit_measurement,
        materialQuantity: data.quantity,
        materialPricePerUnit: data.cost_unit,
        currency: normalizeCurrencyCode(data.currency || currency),
      });

      if (setMaterialsList && !materialsList.includes(materialInput)) {
        setMaterialsList((prev) => [...prev, materialInput]);
      }

      setMaterialInput("");
      setMaterialUnitMeasurement("");
      setMaterialQuantity("");
      setMaterialCostForUnit("");
    } catch (error) {
      console.error("Ошибка сети:", error);
      alert("Ошибка соединения с сервером");
    }
  };

  const startEditMaterial = (material) => {
    setEditingMaterialId(material.id);
    setEditingMaterialData({
      materialDescription: material.materialDescription,
      materialUnit: material.materialUnit,
      materialQuantity: material.materialQuantity.toString(),
      materialPricePerUnit: material.materialPricePerUnit.toString(),
    });
  };

  const cancelEditMaterial = () => {
    setEditingMaterialId(null);
    setEditingMaterialData(null);
  };

  const saveEditMaterial = async (materialId) => {
    if (
      !editingMaterialData.materialDescription ||
      !editingMaterialData.materialQuantity ||
      !editingMaterialData.materialPricePerUnit
    ) {
      alert("Заполните все поля!");
      return;
    }

    try {
      const res = await updateMaterialInEstimate(
        work?.realWorkId || workId,
        {
          id: materialId,
          materialDescription: editingMaterialData.materialDescription,
          materialQuantity: editingMaterialData.materialQuantity,
          materialUnit: editingMaterialData.materialUnit,
          materialPricePerUnit: editingMaterialData.materialPricePerUnit,
        },
        resolvedCurrency,
      );

      if (!res.ok) {
        alert(`Ошибка ${res.status}`);
        return;
      }

      if (onUpdateMaterial) {
        onUpdateMaterial(workId, materialId, {
          materialDescription: editingMaterialData.materialDescription,
          materialUnit: editingMaterialData.materialUnit,
          materialQuantity: Number(editingMaterialData.materialQuantity),
          materialPricePerUnit: Number(editingMaterialData.materialPricePerUnit),
          currency: resolvedCurrency,
        });
      }
      cancelEditMaterial();
    } catch (error) {
      console.error("Ошибка сети:", error);
      alert("Ошибка соединения с сервером");
    }
  };

  return (
    <div
      className="materials-modal-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="materials-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="materials-modal-title"
      >
        <header className="materials-modal__header">
          <div className="materials-modal__header-text">
            <span className="materials-modal__badge">Смета</span>
            <h2 id="materials-modal-title" className="materials-modal__title">
              Материалы
            </h2>
            <p className="materials-modal__subtitle">
              {work?.workDescription
                ? `${work.workDescription} · позиция #${workId}`
                : `Позиция #${workId}`}
            </p>
          </div>
          <button
            type="button"
            className="materials-modal__close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </header>

        <div className="materials-modal__body">
          <section className="materials-modal__card materials-modal__card--form">
            <h3 className="materials-modal__section-title">Новый материал</h3>
            <div className="materials-modal__form">
              <label className="materials-modal__field">
                <span className="materials-modal__label">Наименование</span>
                <input
                  type="text"
                  value={materialInput}
                  onChange={(e) => setMaterialInput(e.target.value)}
                  placeholder="Например: Цемент М500"
                  className="materials-modal__input"
                />
              </label>
              <label className="materials-modal__field">
                <span className="materials-modal__label">Ед. изм.</span>
                <input
                  type="text"
                  value={materialUnitMeasurement}
                  onChange={(e) => setMaterialUnitMeasurement(e.target.value)}
                  placeholder="кг, м², шт..."
                  className="materials-modal__input"
                />
              </label>
              <div className="materials-modal__form-row">
                <label className="materials-modal__field">
                  <span className="materials-modal__label">Количество</span>
                  <input
                    type="text"
                    value={materialQuantity}
                    onChange={(e) => setMaterialQuantity(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="0.00"
                    className="materials-modal__input"
                  />
                </label>
                <label className="materials-modal__field">
                  <span className="materials-modal__label">
                    Цена за ед. ({resolvedCurrency})
                  </span>
                  <input
                    type="text"
                    value={materialCostForUnit}
                    onChange={(e) => setMaterialCostForUnit(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="0.00"
                    className="materials-modal__input"
                  />
                </label>
              </div>
            </div>
            <button
              type="button"
              className="materials-modal__btn-primary"
              onClick={handleAddMaterial}
            >
              Добавить материал
            </button>
          </section>

          <section className="materials-modal__card materials-modal__card--list">
            <div className="materials-modal__list-head">
              <h3 className="materials-modal__section-title">
                Добавленные материалы
              </h3>
              {materials.length > 0 && (
                <span className="materials-modal__total">
                  Итого: {formatMoney(materialsTotal, resolvedCurrency)}
                </span>
              )}
            </div>

            {materials.length > 0 ? (
              <div className="materials-modal__table-wrap">
                <table className="materials-modal__table">
                  <thead>
                    <tr>
                      <th>Название</th>
                      <th>Кол-во</th>
                      <th>Ед.</th>
                      <th className="th-right">Цена</th>
                      <th>Валюта</th>
                      <th className="th-right">Сумма</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {materials.map((mat) => (
                      <tr key={mat.id}>
                        {editingMaterialId === mat.id ? (
                          <>
                            <td>
                              <input
                                type="text"
                                value={editingMaterialData.materialDescription}
                                onChange={(e) =>
                                  setEditingMaterialData({
                                    ...editingMaterialData,
                                    materialDescription: e.target.value,
                                  })
                                }
                                className="materials-modal__input materials-modal__input--compact"
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                value={editingMaterialData.materialQuantity}
                                onChange={(e) =>
                                  setEditingMaterialData({
                                    ...editingMaterialData,
                                    materialQuantity: e.target.value,
                                  })
                                }
                                onKeyDown={handleKeyDown}
                                className="materials-modal__input materials-modal__input--compact"
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                value={editingMaterialData.materialUnit}
                                onChange={(e) =>
                                  setEditingMaterialData({
                                    ...editingMaterialData,
                                    materialUnit: e.target.value,
                                  })
                                }
                                className="materials-modal__input materials-modal__input--compact"
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                value={editingMaterialData.materialPricePerUnit}
                                onChange={(e) =>
                                  setEditingMaterialData({
                                    ...editingMaterialData,
                                    materialPricePerUnit: e.target.value,
                                  })
                                }
                                onKeyDown={handleKeyDown}
                                className="materials-modal__input materials-modal__input--compact"
                              />
                            </td>
                            <td>
                              <span className="estimate-currency-readonly">
                                {resolvedCurrency}
                              </span>
                            </td>
                            <td className="col-money">
                              {formatMoney(
                                Number(editingMaterialData.materialPricePerUnit) *
                                  Number(editingMaterialData.materialQuantity),
                                resolvedCurrency,
                              )}
                            </td>
                            <td className="materials-modal__actions-inline">
                              <button
                                type="button"
                                onClick={() => saveEditMaterial(mat.id)}
                                className="materials-modal__btn-icon materials-modal__btn-icon--save"
                                title="Сохранить"
                              >
                                ✓
                              </button>
                              <button
                                type="button"
                                onClick={cancelEditMaterial}
                                className="materials-modal__btn-icon materials-modal__btn-icon--cancel"
                                title="Отмена"
                              >
                                ✕
                              </button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="col-name">{mat.materialDescription}</td>
                            <td>{formatMoney(mat.materialQuantity)}</td>
                            <td>
                              <span className="unit-badge">{mat.materialUnit}</span>
                            </td>
                            <td className="col-money">
                              {formatMoney(
                                mat.materialPricePerUnit,
                                mat.currency || resolvedCurrency,
                              )}
                            </td>
                            <td>{mat.currency || resolvedCurrency}</td>
                            <td className="col-money col-total">
                              {formatMoney(
                                Number(mat.materialPricePerUnit) *
                                  Number(mat.materialQuantity),
                                mat.currency || resolvedCurrency,
                              )}
                            </td>
                            <td>
                              <button
                                type="button"
                                onClick={() => startEditMaterial(mat)}
                                className="materials-modal__btn-edit"
                              >
                                Изменить
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="materials-modal__empty">
                <p>Материалы ещё не добавлены</p>
                <span>Заполните форму выше</span>
              </div>
            )}
          </section>
        </div>

        <footer className="materials-modal__footer">
          <button
            type="button"
            className="materials-modal__btn-secondary"
            onClick={onClose}
          >
            Закрыть
          </button>
        </footer>
      </div>
    </div>
  );
}
