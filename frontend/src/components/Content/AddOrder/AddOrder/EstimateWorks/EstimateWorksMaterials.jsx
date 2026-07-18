import React, { useState } from "react";
import "./estimate_works_materials.css";
import CreatableSelect from "react-select/creatable";

const worksList = [
  { id: 1, description: "Демонтаж старой плитки" },
  { id: 2, description: "Укладка новой плитки" },
  { id: 3, description: "Штукатурка стен" },
];

const unitsList = ["м2", "шт", "кг", "м3", "пог.м"];

export default function EstimateWorks() {
  const [workInput, setWorkInput] = useState(null); // {value,label} или null
  const [unitMeasurement, setUnitMeasurement] = useState(null); // {value,label} или null
  const [workPrice, setWorkPrice] = useState("");
  const [workQuantity, setWorkQuantity] = useState("");
  const [addedWorks, setAddedWorks] = useState([]);

  const [isModalAddMaterialsOpen, setIsAddMaterialsOpen] = useState(false);
  const [selectedWorkId, setSelectedWorkId] = useState(null);

  const [materialsList, setMaterialsList] = useState([
    "Цемент",
    "Песок",
    "Кирпич",
    "Доска",
    "Плитка",
  ]);

  const openModalAddMaterials = (workId) => {
    setSelectedWorkId(workId);
    setIsAddMaterialsOpen(true);
  };

  const closeModalAddMaterials = () => {
    setIsAddMaterialsOpen(false);
  };

  const handleAddItem = () => {
    if (
      !workInput?.value ||
      !unitMeasurement?.value ||
      !workPrice ||
      !workQuantity
    ) {
      alert("Пожалуйста, заполните все поля.");
      return;
    }
    setAddedWorks((prev) => [
      ...prev,
      {
        id: Date.now(),
        workDescription: workInput.value,
        workUnit: unitMeasurement.value,
        workPricePerUnit: Number(workPrice),
        workQuantity: Number(workQuantity),
        materials: [],
      },
    ]);
    setWorkInput(null);
    setUnitMeasurement(null);
    setWorkPrice("");
    setWorkQuantity("");
  };

  const removeItem = (id) => {
    setAddedWorks((prev) => prev.filter((item) => item.id !== id));
  };

  const addMaterialToWork = (workId, material) => {
    setAddedWorks((prev) =>
      prev.map((work) =>
        work.id === workId
          ? { ...work, materials: [...work.materials, material] }
          : work
      )
    );
  };

  const totalWorkCost = addedWorks.reduce(
    (sum, item) => sum + item.workPricePerUnit * item.workQuantity,
    0
  );

  const totalMaterialCost = addedWorks.reduce(
    (sum, item) =>
      sum +
      item.materials.reduce(
        (mSum, mat) => mSum + mat.materialPricePerUnit * mat.materialQuantity,
        0
      ),
    0
  );

  function ModalAddMaterials({
    workId,
    onClose,
    onAddMaterial,
    materialsList,
    setMaterialsList,
  }) {
    const [materialInput, setMaterialInput] = useState("");
    const [materialUnitMeasurement, setMaterialUnitMeasurement] = useState("");
    const [materialQuantity, setMaterialQuantity] = useState("");
    const [materialCostForUnit, setMaterialCostForUnit] = useState("");
    const [searchText, setSearchText] = useState("");

    const work = addedWorks.find((w) => w.id === workId);

    const filteredMaterials = materialsList.filter((mat) =>
      mat.toLowerCase().includes(searchText.toLowerCase())
    );

    const handleAddMaterial = () => {
      if (
        !materialInput ||
        !materialUnitMeasurement ||
        !materialQuantity ||
        !materialCostForUnit
      ) {
        alert("Пожалуйста, заполните все поля материала.");
        return;
      }

      onAddMaterial(workId, {
        id: Date.now(),
        materialName: materialInput,
        materialUnit: materialUnitMeasurement,
        materialQuantity: Number(materialQuantity),
        materialPricePerUnit: Number(materialCostForUnit),
      });

      if (!materialsList.includes(materialInput)) {
        setMaterialsList((prev) => [...prev, materialInput]);
      }

      setMaterialInput("");
      setMaterialUnitMeasurement("");
      setMaterialQuantity("");
      setMaterialCostForUnit("");
      setSearchText("");
    };

    return (
      <div className="modal-overlay-add-materials" onClick={onClose}>
        <div
          className="modal-add-materials"
          onClick={(e) => e.stopPropagation()}
        >
          <h2>Материалы для работы #{workId}</h2>

          <label>
            Поиск материалов
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Введите для поиска"
            />
          </label>

          <label>
            Список материалов
            <select
              value={materialInput}
              onChange={(e) => setMaterialInput(e.target.value)}
              style={{ width: "100%", padding: "6px", marginBottom: "1rem" }}
            >
              <option value="">Выберите материал</option>
              {filteredMaterials.length > 0 ? (
                filteredMaterials.map((mat, idx) => (
                  <option key={idx} value={mat}>
                    {mat}
                  </option>
                ))
              ) : (
                <option disabled>Материал не найден</option>
              )}
            </select>
          </label>

          <label>
            Название материала
            <input
              type="text"
              value={materialInput}
              onChange={(e) => setMaterialInput(e.target.value)}
              placeholder="Введите название материала"
            />
          </label>

          <label>
            Единица измерения
            <input
              type="text"
              value={materialUnitMeasurement}
              onChange={(e) => setMaterialUnitMeasurement(e.target.value)}
              placeholder="Введите единицу измерения"
            />
          </label>

          <label>
            Количество
            <input
              type="number"
              value={materialQuantity}
              onChange={(e) => setMaterialQuantity(e.target.value)}
              placeholder="Введите количество"
              min="0"
              step="any"
            />
          </label>

          <label>
            Стоимость за единицу
            <input
              type="number"
              value={materialCostForUnit}
              onChange={(e) => setMaterialCostForUnit(e.target.value)}
              placeholder="Введите стоимость за единицу"
              min="0"
              step="any"
            />
          </label>

          <button className="btn-add" onClick={handleAddMaterial}>
            Добавить материал
          </button>

          <h3>Добавленные материалы</h3>
          {work?.materials?.length ? (
            <table className="materials-table">
              <thead>
                <tr>
                  <th>Название</th>
                  <th>Кол-во</th>
                  <th>Ед. изм.</th>
                  <th>Цена за ед.</th>
                  <th>Итого</th>
                </tr>
              </thead>
              <tbody>
                {work.materials.map((mat) => (
                  <tr key={mat.id}>
                    <td>{mat.materialName}</td>
                    <td style={{ textAlign: "center" }}>
                      {mat.materialQuantity}
                    </td>
                    <td style={{ textAlign: "center" }}>{mat.materialUnit}</td>
                    <td style={{ textAlign: "right" }}>
                      {mat.materialPricePerUnit.toFixed(2)}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {(
                        mat.materialPricePerUnit * mat.materialQuantity
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

  return (
    <div className="container-wrap">
      <table className="estimate-table">
        <thead>
          <tr>
            <th>Описание работы</th>
            <th>Кол-во работ</th>
            <th>Ед. изм. работы</th>
            <th style={{ textAlign: "right" }}>Стоимость работы за ед. (₽)</th>
            <th style={{ textAlign: "right" }}>Стоимость работы (₽)</th>
            <th style={{ textAlign: "right" }}>Стоимость материалов (₽)</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {addedWorks.length === 0 && (
            <tr>
              <td colSpan={7} style={{ textAlign: "center", padding: "1rem" }}>
                Нет добавленных элементов
              </td>
            </tr>
          )}
          {addedWorks.map((item) => {
            const materialSum = item.materials.reduce(
              (sum, mat) =>
                sum + mat.materialPricePerUnit * mat.materialQuantity,
              0
            );
            return (
              <tr key={item.id}>
                <td>{item.workDescription}</td>
                <td style={{ textAlign: "center" }}>{item.workQuantity}</td>
                <td style={{ textAlign: "center" }}>{item.workUnit}</td>
                <td style={{ textAlign: "right" }}>
                  {item.workPricePerUnit.toFixed(2)}
                </td>
                <td style={{ textAlign: "right" }}>
                  {(item.workPricePerUnit * item.workQuantity).toFixed(2)}
                </td>
                <td style={{ textAlign: "right" }}>{materialSum.toFixed(2)}</td>
                <td>
                  <button onClick={() => openModalAddMaterials(item.id)}>
                    Добавить материал
                  </button>
                  <button onClick={() => removeItem(item.id)}>Удалить</button>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4} style={{ textAlign: "right", fontWeight: "bold" }}>
              Итого стоимость работ:
            </td>
            <td style={{ textAlign: "right", fontWeight: "bold" }}>
              {totalWorkCost.toFixed(2)} ₽
            </td>
            <td style={{ textAlign: "right", fontWeight: "bold" }}>
              {totalMaterialCost.toFixed(2)} ₽
            </td>
            <td></td>
          </tr>
        </tfoot>
      </table>

      <h3>Работа</h3>

      <CreatableSelect
        isClearable
        onChange={(newValue) => setWorkInput(newValue)}
        options={worksList.map((work) => ({
          value: work.description,
          label: work.description,
        }))}
        value={workInput}
        placeholder="Выберите или добавьте работу"
        styles={customStyles}
      />

      <CreatableSelect
        isClearable
        onChange={(newValue) => setUnitMeasurement(newValue)}
        options={unitsList.map((unit) => ({
          value: unit,
          label: unit,
        }))}
        value={unitMeasurement}
        placeholder="Выберите или добавьте единицу"
        styles={customStyles}
      />

      <div className="input-row">
        <input
          type="number"
          min="0"
          step="any"
          placeholder="Стоимость работы за ед."
          value={workPrice}
          onChange={(e) => setWorkPrice(e.target.value)}
        />
        <input
          type="number"
          min="0"
          step="any"
          placeholder="Количество работы"
          value={workQuantity}
          onChange={(e) => setWorkQuantity(e.target.value)}
        />
      </div>

      <button className="btn-add" onClick={handleAddItem}>
        Добавить в таблицу
      </button>
      {isModalAddMaterialsOpen && (
        <ModalAddMaterials
          workId={selectedWorkId}
          onClose={closeModalAddMaterials}
          onAddMaterial={addMaterialToWork}
          materialsList={materialsList}
          setMaterialsList={setMaterialsList}
        />
      )}
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
