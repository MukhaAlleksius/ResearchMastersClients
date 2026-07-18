import React, { useEffect, useState } from "react";
import { API, apiFetch, buildApiUrl } from "../../../../../../utils/api.js";
import "./customer_estimate_works_materials.css";
export default function CustomerModalAddMaterials({
  workId,
  onClose,
  onAddMaterial,
  materialsList,
  setMaterialsList,
  addedWorks, // ✅ Добавлен пропс!
}) {
  const [materialInput, setMaterialInput] = useState(""); // строка для input
  const [materialSelected, setMaterialSelected] = useState(null); // объект для Select
  const [materialUnitMeasurement, setMaterialUnitMeasurement] = useState("");
  const [materialQuantity, setMaterialQuantity] = useState("");
  const [materialCostForUnit, setMaterialCostForUnit] = useState("");
  const [searchText, setSearchText] = useState("");

  // ✅ ИСПРАВЛЕНО: поиск по addedWorks из пропсов
  const work = addedWorks.find((w) => w.id == workId); // == вместо ===

  const filteredMaterials = materialsList.filter((mat) =>
    mat.toLowerCase().includes(searchText.toLowerCase()),
  );

  // ✅ МАССИВ ОБЪЕКТОВ для React-Select
  const materialOptions = filteredMaterials.map((mat) => ({
    value: mat,
    label: mat,
  }));

  // блокирует клавиши кроме цифр
  const handleKeyDown = (e) => {
    const allowedKeys = [
      "Backspace",
      "Tab",
      "ArrowLeft",
      "ArrowRight",
      "Delete",
      "Home",
      "End",
    ];
    // Разрешаем служебные клавиши
    if (allowedKeys.includes(e.key)) return;

    // Разрешаем цифры
    if (e.key >= "0" && e.key <= "9") return;

    // Разрешаем точку и запятую, но только один раз
    if (
      (e.key === "." || e.key === ",") &&
      !e.currentTarget.value.includes(".")
    )
      return;

    // В остальных случаях блокируем ввод
    e.preventDefault();
  };

  // ✅ ПРАВИЛЬНЫЙ onChange
  const handleMaterialSelect = (newValue) => {
    setMaterialSelected(newValue);
    if (newValue) {
      setMaterialInput(newValue.value); // заполняем input
    } else {
      setMaterialInput("");
    }
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

    // ✅ Берем currency из родительского компонента через пропсы или localStorage
    const currency = localStorage.getItem("currency") || "BYN";

    const formatted_data_estimate_material = {
      work_estimate_id: work?.realWorkId || workId, // ✅ Реальный ID работы из БД!
      name_material: materialInput, // ✅ Строка, а не .label
      quantity: Number(materialQuantity),
      unit_measurement: materialUnitMeasurement,
      cost_unit: Number(materialCostForUnit),
      currency: currency,
    };

    try {
      const response = await apiFetch(
        buildApiUrl("/add_material_for_work_into_estimate"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formatted_data_estimate_material),
        },
      );

      if (!response.ok) {
        const errorData = await response.text();
        console.error("❌ Сервер:", response.status, errorData);
        alert(`Ошибка ${response.status}: ${errorData}`);
        return;
      }

      const data = await response.json(); // ✅ Ответ от сервера с данными материала!

      console.log("✅ Материал сохранен:", data);

      // ✅ Передаем в родительский компонент ДАННЫЕ ИЗ БД, а не локальные
      onAddMaterial(workId, {
        id: data.id, // Реальный ID из БД
        materialName: data.name_material,
        materialUnit: data.unit_measurement,
        materialQuantity: data.quantity,
        materialPricePerUnit: data.cost_unit,
      });

      // ✅ Добавляем в локальный список материалов
      if (!materialsList.includes(materialInput)) {
        setMaterialsList((prev) => [...prev, materialInput]);
      }

      // ✅ Сброс формы
      setMaterialInput("");
      setMaterialSelected(null);
      setMaterialUnitMeasurement("");
      setMaterialQuantity("");
      setMaterialCostForUnit("");
      setSearchText("");
    } catch (error) {
      console.error("Ошибка сети:", error);
      alert("Ошибка соединения с сервером");
    }
  };

  return (
    <div className="modal-overlay-add-materials" onClick={onClose}>
      <div className="modal-add-materials" onClick={(e) => e.stopPropagation()}>
        <h2>Материалы для работы #{workId}</h2>

        {/* ✅ ПОЛНАЯ ТАБЛИЦА */}
        <h3>Добавленные материалы</h3>
        {work?.materials?.length ? (
          <table className="materials-table">
            <tbody>
              {work.materials.map((mat) => (
                <tr key={mat.id}>
                  <td>{mat.materialName}</td>
                  <td>{mat.materialQuantity}</td>
                  <td>{mat.materialUnit}</td>
                  <td style={{ textAlign: "right" }}>
                    {/* ❌ Было */}
                    {/* {mat.materialPricePerUnit.toFixed(2)} */}

                    {/* ✅ Стало */}
                    {Number(mat.materialPricePerUnit).toFixed(2)}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {/* ❌ Было */}
                    {/* {(mat.materialPricePerUnit * mat.materialQuantity).toFixed(2)} */}

                    {/* ✅ Стало */}
                    {(
                      Number(mat.materialPricePerUnit) *
                      Number(mat.materialQuantity)
                    ).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>Материалы не добавлены</p>
        )}

        <button
          className="modal-add-materials-close-btn"
          onClick={onClose}
          style={{ marginTop: 12 }}
        >
          Закрыть
        </button>
      </div>
    </div>
  );
}

const customStyles = {
  control: (base) => ({
    ...base,
    minHeight: 36,
    height: 36,
    borderRadius: 4,
    borderColor: "#ccc",
    boxShadow: "none",
    "&:hover": { borderColor: "#888" },
    fontSize: 14,
  }),
  dropdownIndicator: (base) => ({
    ...base,
    padding: 4,
  }),
  clearIndicator: (base) => ({
    ...base,
    padding: 4,
  }),
  valueContainer: (base) => ({
    ...base,
    padding: "0 8px",
    height: 36,
    display: "flex",
    alignItems: "center",
  }),
  input: (base) => ({
    ...base,
    margin: 0,
    padding: 0,
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isFocused ? "#f0f0f0" : "white",
    color: "black",
    cursor: "pointer",
  }),
};
