import React, { useState } from "react";

export default function EditMaterialInline({
  material,
  workId,
  onSave,
  onCancel,
}) {
  const [editedMaterial, setEditedMaterial] = useState({
    materialDescription: material.materialDescription,
    materialQuantity: material.materialQuantity.toString(),
    materialUnit: material.materialUnit,
    materialPricePerUnit: material.materialPricePerUnit.toString(),
    currency: material.currency,
  });

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
    const hasDecimal = /\./.test(currentValue) || /,/.test(currentValue);

    if ((e.key === "." || e.key === ",") && !hasDecimal) return;

    e.preventDefault();
  };

  const handleChange = (field, value) => {
    setEditedMaterial((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSave = () => {
    onSave(editedMaterial);
  };

  return (
    <div className="material-edit-inline">
      <div className="material-edit-fields">
        <input
          type="text"
          className="material-edit-input"
          value={editedMaterial.materialDescription}
          onChange={(e) => handleChange("materialDescription", e.target.value)}
          placeholder="Название материала"
        />
        <input
          type="text"
          className="material-edit-input small"
          value={editedMaterial.materialQuantity}
          onChange={(e) => handleChange("materialQuantity", e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Кол-во"
        />
        <input
          type="text"
          className="material-edit-input small"
          value={editedMaterial.materialUnit}
          onChange={(e) => handleChange("materialUnit", e.target.value)}
          placeholder="Ед."
        />
        <input
          type="text"
          className="material-edit-input small"
          value={editedMaterial.materialPricePerUnit}
          onChange={(e) => handleChange("materialPricePerUnit", e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Цена"
        />
      </div>
      <div className="material-edit-buttons">
        <button
          onClick={handleSave}
          className="btn-material-save"
          title="Сохранить"
        >
          ✓
        </button>
        <button
          onClick={onCancel}
          className="btn-material-cancel"
          title="Отмена"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
