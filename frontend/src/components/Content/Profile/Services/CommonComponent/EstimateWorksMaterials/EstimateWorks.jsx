import React, { useEffect, useState, useCallback, useRef } from "react";
import { API, apiFetch } from "../../../../../../utils/api.js";
import CreatableSelect from "react-select/creatable";
import EditWorkModal from "./EditWorkModal";
import ModalAddMaterials from "./EstimateMaterials";
import {
  CURRENCY_OPTIONS,
  createMoneyAnchor,
  fetchNbrbRates,
  formatMoneyInput,
  normalizeCurrencyCode,
} from "../../../../../../utils/currency";
import {
  convertFlatWorksToCurrency,
  mapApiEstimateWork,
  persistEstimateCurrencyOnly,
  persistEstimateWorks,
  resolveEstimateCurrency,
  saveEstimateCurrency,
  worksNeedCurrencyConversion,
} from "../../../../../../utils/estimateStorage.js";
import "./estimate_works_materials.css";

const unitsList = ["м2", "шт", "кг", "м3", "пог.м"];

function rebuildPriceAnchors(works) {
  const worksMap = new Map();
  const materialsMap = new Map();
  (works || []).forEach((work) => {
    worksMap.set(
      work.id,
      createMoneyAnchor(work.workPricePerUnit, work.currency || "BYN"),
    );
    (work.materials || []).forEach((mat) => {
      materialsMap.set(
        mat.id,
        createMoneyAnchor(
          mat.materialPricePerUnit,
          mat.currency || work.currency || "BYN",
        ),
      );
    });
  });
  return { works: worksMap, materials: materialsMap };
}

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

export default function EstimateWorks({ order_id, category_work_id }) {
  const [sourceType, setSourceType] = useState("common");
  const [works, setWorks] = useState([]);
  const [personalWorks, setPersonalWorks] = useState([]);

  const [workInput, setWorkInput] = useState(null);
  const [workSelectInput, setWorkSelectInput] = useState("");
  const [unitMeasurement, setUnitMeasurement] = useState(null);
  const [workCost, setWorkCost] = useState("");
  const [workQuantity, setWorkQuantity] = useState("");

  const [addedWorks, setAddedWorks] = useState([]);
  const [currency, setCurrency] = useState("BYN");

  const [isModalAddMaterialsOpen, setIsAddMaterialsOpen] = useState(false);
  const [selectedWorkId, setSelectedWorkId] = useState(null);

  const [isEditWorkModalOpen, setIsEditWorkModalOpen] = useState(false);
  const [editingWork, setEditingWork] = useState(null);

  const [estimateWorks, setEstimateWorks] = useState([]);

  const [worksFromGraphicWorks, setWorksFromGraphicWorks] = useState([]);

  const [materialsList] = useState([
    "Цемент",
    "Песок",
    "Кирпич",
    "Доска",
    "Плитка",
  ]);

  const user_id = localStorage.getItem("user_id");
  const master_id = localStorage.getItem("master_id") || user_id;
  const currencies = CURRENCY_OPTIONS.map((item) => item.value);

  const [orderExists, setOrderExists] = useState(!!order_id);
  const [orderId, setOrderId] = useState(order_id);
  const [isConvertingCurrency, setIsConvertingCurrency] = useState(false);
  const priceAnchorsRef = useRef(rebuildPriceAnchors([]));
  const workCostAnchorRef = useRef(null);

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

  useEffect(() => {
    if (order_id) {
      setOrderExists(true);
      setOrderId(order_id);
      console.log("✅ Order ID из props:", order_id);
    } else {
      setOrderExists(false);
      setOrderId(null);
      console.log("❌ order_id не передан");
    }
  }, [order_id]);

  const handleGlobalCurrencyChange = useCallback(
    async (newCurrency) => {
      const normalizedNew = normalizeCurrencyCode(newCurrency);
      const normalizedPrev = normalizeCurrencyCode(currency);

      if (normalizedNew === normalizedPrev) {
        if (currency !== normalizedNew) {
          setCurrency(normalizedNew);
        }
        return;
      }

      const convertFormPrice = async () => {
        if (!workCostAnchorRef.current) return;
        try {
          const rates = await fetchNbrbRates();
          setWorkCost(
            formatMoneyInput(
              workCostAnchorRef.current.priceForCurrency(normalizedNew, rates),
            ),
          );
        } catch (error) {
          console.error(error);
        }
      };

      if (addedWorks.length === 0) {
        try {
          await persistEstimateCurrencyOnly(user_id, orderId, normalizedNew);
          await convertFormPrice();
          setCurrency(normalizedNew);
        } catch (error) {
          console.error(error);
          alert(
            error.message?.includes("refresh_token")
              ? "Сессия истекла. Войдите снова."
              : "Не удалось сохранить валюту сметы",
          );
        }
        return;
      }

      setIsConvertingCurrency(true);
      try {
        const rates = await fetchNbrbRates();
        const convertedWorks = convertFlatWorksToCurrency(
          addedWorks,
          priceAnchorsRef.current,
          normalizedNew,
          rates,
        );

        setAddedWorks(convertedWorks);
        saveEstimateCurrency(user_id, orderId, normalizedNew);
        setCurrency(normalizedNew);
        await convertFormPrice();

        const persistResult = await persistEstimateWorks(
          user_id,
          orderId,
          normalizedNew,
          convertedWorks,
        );

        if (!persistResult.saved) {
          console.error("Ошибки сохранения сметы:", persistResult.errors);
          alert(
            `Смета пересчитана в ${normalizedNew}, но не все позиции сохранены на сервере.\n\n${persistResult.errors.slice(0, 3).join("\n")}`,
          );
        }
      } catch (error) {
        console.error(error);
        if (error.message?.includes("курс") || error.message?.includes("Курс")) {
          alert("Не удалось загрузить курсы валют НБРБ. Проверьте, что сервер запущен.");
        } else if (error.message?.includes("refresh_token")) {
          alert("Сессия истекла. Войдите снова и повторите смену валюты.");
        } else {
          alert(`Не удалось пересчитать смету: ${error.message}`);
        }
      } finally {
        setIsConvertingCurrency(false);
      }
    },
    [currency, addedWorks, orderId, user_id],
  );

  const fetchWorksForCategoryWork = useCallback(async (catId) => {
    if (!catId) {
      setWorks([]);
      return;
    }

    try {
      const url = `${API.baseURL}/works_for_category_work/${catId}`;
      console.log("🔄 Загружаем общие работы для категории:", catId);
      const response = await apiFetch(url);

      if (!response.ok) {
        setWorks([]);
        return;
      }

      const data = await response.json();
      console.log("✅ Общие работы:", data);
      setWorks(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("❌ Ошибка общих работ:", error);
      setWorks([]);
    }
  }, []);

  const fetchEstimateWorksMaterialsForOrder = useCallback(async () => {
    if (!orderId || !user_id) return;

    try {
      const url = `${API.baseURL}/works_estimate_full/${user_id}/${orderId}`;
      console.log(`🔄 Загружаем полную смету ${user_id}/${orderId}`);

      const response = await apiFetch(url);

      if (!response.ok) {
        setEstimateWorks([]);
        setAddedWorks([]);
        return;
      }

      const data = await response.json();
      console.log("✅ Полная смета:", data);

      const worksCurrency = resolveEstimateCurrency(data, user_id, orderId);
      let flatWorks = (data.works || []).map((work) =>
        mapApiEstimateWork(work, worksCurrency),
      );

      priceAnchorsRef.current = rebuildPriceAnchors(flatWorks);

      if (
        flatWorks.length > 0 &&
        worksNeedCurrencyConversion(flatWorks, worksCurrency)
      ) {
        const rates = await fetchNbrbRates();
        flatWorks = convertFlatWorksToCurrency(
          flatWorks,
          priceAnchorsRef.current,
          worksCurrency,
          rates,
        );
        try {
          const persistResult = await persistEstimateWorks(
            user_id,
            orderId,
            worksCurrency,
            flatWorks,
          );
          if (!persistResult.saved) {
            console.warn(
              "Смета загружена с конвертацией, но не всё сохранено:",
              persistResult.errors,
            );
          }
        } catch (error) {
          console.error(error);
        }
      }

      setCurrency(worksCurrency);
      setEstimateWorks(flatWorks);
      setAddedWorks(flatWorks);
      console.log(`✅ Загружено ${flatWorks.length} работ`);
    } catch (error) {
      console.error("💥 Ошибка сети:", error);
      setEstimateWorks([]);
      setAddedWorks([]);
    }
  }, [orderId, user_id]);

  const fetchWorksFromGraphicWorks = useCallback(async () => {
    if (!orderId || !user_id) return;

    try {
      const url = `${API.baseURL}/works_from_graphic_works/${user_id}/${orderId}`;
      console.log(
        `🔄 Загружаем выполненные работы из графика работ: ${user_id}/${orderId}`,
      );
      const response = await apiFetch(url);

      if (!response.ok) {
        setWorksFromGraphicWorks([]);
        return;
      }

      const data = await response.json();
      console.log("✅ Общие работы:", data);
      setWorksFromGraphicWorks(Array.isArray(data) ? data : []);

      setAddedWorks((prev) =>
        prev.map((work) => {
          const matched = data.find(
            (gw) => gw.work_id === work.id || gw.id === work.id,
          );
          return {
            ...work,
            doneQuantity: matched
              ? Number(matched.done_quantity || matched.quantity || 0)
              : Number(work.doneQuantity || 0),
            currency: currency,
            materials: (work.materials || []).map((mat) => ({
              ...mat,
              currency: currency,
            })),
          };
        }),
      );
    } catch (error) {
      console.error("❌ Ошибка общих работ:", error);
      setWorksFromGraphicWorks([]);
    }
  }, [orderId, user_id, currency]);

  const fetchPersonalWorksForCategoryWork = useCallback(
    async (catId) => {
      if (!catId || !master_id) {
        setPersonalWorks([]);
        return;
      }

      try {
        const [adminRes, myselfRes] = await Promise.all([
          apiFetch(
            `${API.baseURL}/works_master_from_admin/${master_id}/${catId}`,
          ),
          apiFetch(
            `${API.baseURL}/works_master_myself/${master_id}/${catId}`,
          ),
        ]);

        const allPersonalWorks = [
          ...(adminRes.ok ? await adminRes.json() : []),
          ...(myselfRes.ok ? await myselfRes.json() : []),
        ];

        console.log("✅ Личные работы:", allPersonalWorks);
        setPersonalWorks(
          Array.isArray(allPersonalWorks) ? allPersonalWorks : [],
        );
      } catch (error) {
        console.error("❌ Ошибка личных работ:", error);
        setPersonalWorks([]);
      }
    },
    [master_id],
  );

  const handleSourceChange = (type) => {
    setSourceType(type);
    setWorkInput(null);
    setWorkSelectInput("");
    setWorkCost("");
    setUnitMeasurement(null);
    setWorkQuantity("");
  };

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

      if (workCurrency === normalizeCurrencyCode(currency)) {
        setWorkCost(formatMoneyInput(rawCost));
        return;
      }

      try {
        const rates = await fetchNbrbRates();
        setWorkCost(
          formatMoneyInput(
            workCostAnchorRef.current.priceForCurrency(currency, rates),
          ),
        );
      } catch (error) {
        console.error(error);
        setWorkCost(String(rawCost));
      }
    },
    [currency],
  );

  const handleWorkCostChange = (value) => {
    setWorkCost(value);
    const amount = Number(value);
    if (value !== "" && Number.isFinite(amount)) {
      workCostAnchorRef.current = createMoneyAnchor(amount, currency);
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

    const currentWorks = sourceType === "common" ? works : personalWorks;
    const workName = getWorkNameFromOption(newValue);
    const selectedWork = currentWorks.find(
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

  const workSelectOptions =
    sourceType === "common"
      ? works.map((work) => ({
          value: String(work.work_id ?? work.id),
          label: work.name_work,
        }))
      : personalWorks.map((work) => ({
          value: String(work.work_id ?? work.id),
          label: work.name_work,
        }));

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

  const openModalAddMaterials = (workId) => {
    setSelectedWorkId(workId);
    setIsAddMaterialsOpen(true);
  };

  const closeModalAddMaterials = () => {
    setIsAddMaterialsOpen(false);
  };

  const openEditWorkModal = (work) => {
    setEditingWork(work);
    setIsEditWorkModalOpen(true);
  };

  const closeEditWorkModal = () => {
    setIsEditWorkModalOpen(false);
    setEditingWork(null);
  };

  const handleUpdateEstimateWork = useCallback((updatedWork) => {
    setAddedWorks((prev) =>
      prev.map((item) =>
        item.id === updatedWork.id ? { ...item, ...updatedWork } : item,
      ),
    );
    priceAnchorsRef.current.works.set(
      updatedWork.id,
      createMoneyAnchor(
        updatedWork.workPricePerUnit,
        updatedWork.currency || "BYN",
      ),
    );
  }, []);

  const handleAddEstimateWork = async () => {
    if (!orderExists || !orderId) {
      alert("Сначала сохраните заказ!");
      return;
    }

    const workName = getWorkNameFromOption(workInput);
    if (
      !workName ||
      !unitMeasurement?.value ||
      !workCost ||
      !workQuantity ||
      !currency
    ) {
      alert("Заполните все поля!");
      return;
    }

    const numQty = Number(workQuantity);
    if (numQty <= 0) {
      alert("Количество должно быть больше 0");
      return;
    }

    const formatted_data_estimate_work = {
      user_id: parseInt(user_id),
      order_id: parseInt(orderId),
      name_work: workName,
      quantity: numQty,
      unit_measurement: unitMeasurement.value,
      cost_unit: Number(workCost),
      currency: currency,
    };

    try {
      const res = await apiFetch(`${API.baseURL}/add_work_into_estimate`, {
        method: "POST",
        body: JSON.stringify(formatted_data_estimate_work),
      });

      if (!res.ok) {
        alert("Ошибка при сохранении работы");
        return;
      }

      const data = await res.json();

      const newWork = {
        id: data.id,
        workDescription: data.name_work || "Без названия",
        workQuantity: Number(data.quantity || 0),
        doneQuantity: Number(data.done_quantity || 0),
        workUnit: data.unit_measurement || "",
        workPricePerUnit: Number(data.cost_unit || 0),
        currency: data.currency || currency,
        materials: [],
      };

      setAddedWorks((prev) => {
        const index = prev.findIndex((w) => w.id === newWork.id);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = {
            ...updated[index],
            ...newWork,
          };
          return updated;
        }
        return [...prev, newWork];
      });

      const anchorSource = workCostAnchorRef.current?.get() || {
        amount: Number(workCost),
        currency: normalizeCurrencyCode(currency),
      };
      priceAnchorsRef.current.works.set(
        newWork.id,
        createMoneyAnchor(anchorSource.amount, anchorSource.currency),
      );
      saveEstimateCurrency(user_id, orderId, normalizeCurrencyCode(currency));

      alert("Работа добавлена в смету!");
    } catch (error) {
      console.error(error);
      alert("Ошибка соединения с сервером");
    }

    setWorkInput(null);
    setWorkSelectInput("");
    setUnitMeasurement(null);
    workCostAnchorRef.current = null;
    setWorkCost("");
    setWorkQuantity("");
  };

  useEffect(() => {
    if (category_work_id) {
      console.log("🔥 АВТОЗАГРУЗКА работ для категории:", category_work_id);
      fetchEstimateWorksMaterialsForOrder();
      fetchWorksForCategoryWork(category_work_id);
      fetchPersonalWorksForCategoryWork(category_work_id);
    }
  }, [
    category_work_id,
    fetchEstimateWorksMaterialsForOrder,
    fetchWorksForCategoryWork,
    fetchPersonalWorksForCategoryWork,
  ]);

  const removeItem = async (id) => {
    setAddedWorks((prev) => prev.filter((item) => item.id !== id));

    try {
      await apiFetch(
        `${API.baseURL}/delete_work_from_estimate/${user_id}/${orderId}/${id}`,
        { method: "DELETE" },
      );
    } catch (error) {
      console.error(error);
    }
  };

  const addMaterialToWork = (workId, material) => {
    const materialCurrency = normalizeCurrencyCode(material.currency || currency);
    setAddedWorks((prev) =>
      prev.map((work) =>
        work.id === workId
          ? {
              ...work,
              materials: [
                ...(work.materials || []),
                { ...material, currency: materialCurrency },
              ],
            }
          : work,
      ),
    );
    priceAnchorsRef.current.materials.set(
      material.id,
      createMoneyAnchor(material.materialPricePerUnit, materialCurrency),
    );
  };

  const updateMaterialInWork = (workId, materialId, updates) => {
    const materialCurrency = normalizeCurrencyCode(updates.currency || currency);
    setAddedWorks((prev) =>
      prev.map((work) =>
        work.id === workId
          ? {
              ...work,
              materials: (work.materials || []).map((mat) =>
                mat.id === materialId
                  ? { ...mat, ...updates, currency: materialCurrency }
                  : mat,
              ),
            }
          : work,
      ),
    );
    priceAnchorsRef.current.materials.set(
      materialId,
      createMoneyAnchor(updates.materialPricePerUnit, materialCurrency),
    );
  };

  const totalWorkCost = addedWorks.reduce((sum, item) => {
    return (
      sum + Number(item.workPricePerUnit || 0) * Number(item.workQuantity || 0)
    );
  }, 0);

  const totalMaterialCost = addedWorks.reduce((sum, item) => {
    const materialsSum = (item.materials || []).reduce((mSum, mat) => {
      return (
        mSum +
        Number(mat?.materialPricePerUnit || 0) *
          Number(mat?.materialQuantity || 0)
      );
    }, 0);
    return sum + materialsSum;
  }, 0);

  const totalDoneCost = addedWorks.reduce((sum, item) => {
    return (
      sum +
      Number(item.workPricePerUnit || 0) * Number(item.doneQuantity || 0)
    );
  }, 0);

  const formatMoney = (value) =>
    Number(value || 0).toLocaleString("ru-RU", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const renderWorkRow = (item) => {
    const materialSum = (item.materials || []).reduce((sum, mat) => {
      return (
        sum +
        Number(mat?.materialPricePerUnit || 0) *
          Number(mat?.materialQuantity || 0)
      );
    }, 0);

    const workTotal =
      Number(item.workPricePerUnit || 0) * Number(item.workQuantity || 0);

    const doneQuantity = Number(item.doneQuantity ?? 0);
    const doneCost = doneQuantity * Number(item.workPricePerUnit || 0);

    const progressPct =
      Number(item.workQuantity) > 0
        ? Math.min(100, (doneQuantity / Number(item.workQuantity)) * 100)
        : 0;

    return (
      <tr key={item.id} className="estimate-row">
        <td data-label="Работа" className="col-work">
          <span className="work-name">{item.workDescription}</span>
          {Number(item.workQuantity) > 0 && (
            <span className="work-progress" title="Выполнено">
              <span
                className="work-progress-bar"
                style={{ width: `${progressPct}%` }}
              />
            </span>
          )}
        </td>
        <td data-label="Кол-во" className="col-num">
          {formatMoney(item.workQuantity)}
        </td>
        <td data-label="Выполнено" className="col-num col-done">
          {formatMoney(doneQuantity)}
        </td>
        <td data-label="Ед. изм.">
          <span className="unit-badge">{item.workUnit}</span>
        </td>
        <td data-label="Цена за ед." className="col-money">
          {formatMoney(item.workPricePerUnit)}{" "}
          <span className="currency-inline">{item.currency}</span>
        </td>
        <td data-label="Стоимость работ" className="col-money col-total">
          {formatMoney(workTotal)}{" "}
          <span className="currency-inline">{item.currency}</span>
        </td>
        <td data-label="Выполнено (сумма)" className="col-money">
          {formatMoney(doneCost)}{" "}
          <span className="currency-inline">{item.currency}</span>
        </td>
        <td data-label="Материалы" className="col-money">
          {formatMoney(materialSum)}{" "}
          <span className="currency-inline">{item.currency}</span>
        </td>
        <td className="actions-cell" data-label="Действия">
          <div className="actions-group">
            <button
              type="button"
              onClick={() => openModalAddMaterials(item.id)}
              className="btn-materials"
              title="Материалы"
            >
              Материалы
            </button>
            <button
              type="button"
              onClick={() => openEditWorkModal(item)}
              className="btn-edit"
              title="Редактировать"
            >
              Редактировать
            </button>
            <button
              type="button"
              onClick={() => removeItem(item.id)}
              className="btn-remove"
              title="Удалить"
            >
              Удалить
            </button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="container-wrap estimate-works">
      <header className="estimate-header">
        <div className="estimate-header-text">
          <h2 className="estimate-title">Смета работ</h2>
          <p className="estimate-subtitle">
            {orderExists
              ? "Добавляйте позиции, материалы и отслеживайте выполнение"
              : "Сохраните заказ, чтобы добавить работы в смету"}
          </p>
        </div>
        <div className="estimate-header-currency">
          <label className="field-label" htmlFor="estimate-global-currency">
            Валюта сметы
          </label>
          <select
            id="estimate-global-currency"
            value={currency}
            onChange={(e) => handleGlobalCurrencyChange(e.target.value)}
            className="currency-select header"
            disabled={isConvertingCurrency}
          >
            {currencies.map((cur) => (
              <option key={cur} value={cur}>
                {cur}
              </option>
            ))}
          </select>
          {isConvertingCurrency && (
            <span className="estimate-currency-hint">
              Конвертация и сохранение…
            </span>
          )}
        </div>
      </header>

      <div className="estimate-summary">
        <div className="summary-card">
          <span className="summary-label">Позиций</span>
          <span className="summary-value">{addedWorks.length}</span>
        </div>
        <div className="summary-card summary-card--primary">
          <span className="summary-label">Работы</span>
          <span className="summary-value">
            {formatMoney(totalWorkCost)}{" "}
            <span className="currency-inline">{currency}</span>
          </span>
        </div>
        <div className="summary-card summary-card--success">
          <span className="summary-label">Выполнено</span>
          <span className="summary-value">
            {formatMoney(totalDoneCost)}{" "}
            <span className="currency-inline">{currency}</span>
          </span>
        </div>
        <div className="summary-card summary-card--accent">
          <span className="summary-label">Материалы</span>
          <span className="summary-value">
            {formatMoney(totalMaterialCost)}{" "}
            <span className="currency-inline">{currency}</span>
          </span>
        </div>
      </div>

      <section className="estimate-card estimate-card--table">
        <div className="estimate-card-head">
          <h3 className="estimate-section-title">Список работ</h3>
        </div>
        <div className="table-wrapper table-wrapper--estimate" role="region" aria-label="Таблица сметы, прокрутка по горизонтали">
          <table className="estimate-table">
            <thead>
              <tr>
                <th>Работа</th>
                <th>Кол-во</th>
                <th>Выполнено</th>
                <th>Ед. изм.</th>
                <th className="th-right">Цена за ед.</th>
                <th className="th-right">Стоимость работ</th>
                <th className="th-right">Выполнено (сумма)</th>
                <th className="th-right">Материалы</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {addedWorks.length === 0 && (
                <tr>
                  <td colSpan={9} className="empty-state-cell">
                    <div className="empty-state">
                      <span className="empty-state-icon" aria-hidden="true" />
                      <p className="empty-state-title">Смета пуста</p>
                      <p className="empty-state-text">
                        Добавьте первую работу в форме ниже
                      </p>
                    </div>
                  </td>
                </tr>
              )}
              {addedWorks.map(renderWorkRow)}
            </tbody>
          </table>
        </div>
        {addedWorks.length > 0 && (
          <div className="estimate-totals" aria-label="Итого по смете">
            <p className="estimate-totals__heading">Итого</p>
            <div className="estimate-totals__grid">
              <div className="estimate-totals__item">
                <span className="estimate-totals__label">Стоимость работ</span>
                <span className="estimate-totals__value">
                  {formatMoney(totalWorkCost)}{" "}
                  <span className="currency-inline">{currency}</span>
                </span>
              </div>
              <div className="estimate-totals__item">
                <span className="estimate-totals__label">Выполнено</span>
                <span className="estimate-totals__value estimate-totals__value--success">
                  {formatMoney(totalDoneCost)}{" "}
                  <span className="currency-inline">{currency}</span>
                </span>
              </div>
              <div className="estimate-totals__item">
                <span className="estimate-totals__label">Материалы</span>
                <span className="estimate-totals__value estimate-totals__value--accent">
                  {formatMoney(totalMaterialCost)}{" "}
                  <span className="currency-inline">{currency}</span>
                </span>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="estimate-card estimate-card--form">
        <div className="estimate-card-head estimate-card-head--form">
          <h3 className="estimate-section-title">Добавить работу</h3>
          <div className="source-switcher">
            <div className="switcher-container">
              <button
                type="button"
                className={`switcher-btn ${sourceType === "common" ? "active" : ""}`}
                onClick={() => handleSourceChange("common")}
              >
                Общие работы
              </button>
              <button
                type="button"
                className={`switcher-btn ${sourceType === "personal" ? "active" : ""}`}
                onClick={() => handleSourceChange("personal")}
              >
                Свои работы
              </button>
            </div>
          </div>
        </div>

        <div className="estimate-form-grid">
          <div className="form-field form-field--wide">
            <label className="field-label">Наименование работы</label>
            <div className="work-select">
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
                styles={customStyles}
              />
              {showApplyCustomWorkBtn && (
                <button
                  type="button"
                  className="btn-apply-custom-work"
                  onClick={() => handleCreateWorkOption(workNameDraft)}
                >
                  Использовать название «{workNameDraft}»
                </button>
              )}
              <p className="field-hint">
                {showApplyCustomWorkBtn
                  ? "Нажмите кнопку выше, чтобы подтвердить своё название работы."
                  : "Если работы нет в списке — введите название, затем нажмите появившуюся кнопку."}
              </p>
            </div>
          </div>

          <div className="form-field">
            <label className="field-label">Ед. изм.</label>
            <div className="unit-select">
              <CreatableSelect
                isClearable
                value={unitMeasurement}
                menuPortalTarget={document.body}
                menuPosition="fixed"
                onChange={setUnitMeasurement}
                options={unitsList.map((unit) => ({
                  value: unit,
                  label: unit,
                }))}
                placeholder="Выберите или введите ед. изм."
                formatCreateLabel={(inputValue) =>
                  inputValue.trim()
                    ? `Добавить «${inputValue.trim()}»`
                    : "Введите единицу"
                }
                isValidNewOption={(inputValue) => Boolean(inputValue?.trim())}
                noOptionsMessage={() => "Введите единицу измерения"}
                styles={customStyles}
              />
            </div>
          </div>

          <div className="form-field">
            <label className="field-label" htmlFor="work-quantity">
              Количество
            </label>
            <input
              id="work-quantity"
              type="text"
              placeholder="0.00"
              value={workQuantity}
              onChange={(e) => setWorkQuantity(e.target.value)}
              onKeyDown={handleKeyDown}
              className="estimate-input"
            />
          </div>

          <div className="form-field">
            <label className="field-label" htmlFor="work-cost">
              Цена за ед. ({currency})
            </label>
            <input
              id="work-cost"
              type="text"
              placeholder="0.00"
              value={workCost}
              onChange={(e) => handleWorkCostChange(e.target.value)}
              onKeyDown={handleKeyDown}
              className="estimate-input"
            />
          </div>

          <div className="form-field form-field--action">
            <span className="field-label field-label--invisible">Добавить</span>
            <button
              type="button"
              className="btn-add"
              onClick={handleAddEstimateWork}
              disabled={!orderExists}
            >
              Добавить в смету
            </button>
          </div>
        </div>
      </section>

      {isModalAddMaterialsOpen && (
        <ModalAddMaterials
          workId={selectedWorkId}
          userId={user_id}
          orderId={orderId}
          onClose={closeModalAddMaterials}
          onAddMaterial={addMaterialToWork}
          onUpdateMaterial={updateMaterialInWork}
          materialsList={materialsList}
          addedWorks={addedWorks}
          currency={currency}
        />
      )}

      {isEditWorkModalOpen && editingWork && (
        <EditWorkModal
          userId={user_id}
          orderId={order_id}
          work={editingWork}
          onClose={closeEditWorkModal}
          onSave={handleUpdateEstimateWork}
          currency={currency}
        />
      )}
    </div>
  );
}

const customStyles = {
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
    zIndex: 9999,
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
