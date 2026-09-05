import React, { useEffect, useState, useCallback, useRef } from "react";
import { API, apiFetch, readApiError } from "../../../../../../utils/api.js";
import AddWorkModal from "./AddWorkModal";
import EditWorkModal from "./EditWorkModal";
import ModalAddMaterials from "./EstimateMaterials";
import {
  CURRENCY_OPTIONS,
  createMoneyAnchor,
  fetchNbrbRates,
  normalizeCurrencyCode,
} from "../../../../../../utils/currency";
import {
  buildPriceAnchorsForWorks,
  convertFlatWorksToCurrency,
  mapApiEstimateWork,
  persistEstimateCurrencyOnly,
  persistEstimateWorks,
  resolveEstimateCurrency,
  saveEstimateCurrency,
  saveEstimatePriceAnchors,
  worksNeedCurrencyConversion,
} from "../../../../../../utils/estimateStorage.js";
import "./estimate_works_materials.css";

import { uiAlert, uiConfirm } from "../../../../../UiDialog/uiDialog.js";
import { useEstimateTablePan } from "../../../../../../hooks/useDragScroll.js";
import { preferOwnSpecializationWorks } from "../../../../../../utils/workNames.js";

export default function EstimateWorks({ order_id, category_work_id }) {
  const [works, setWorks] = useState([]);
  const [personalWorks, setPersonalWorks] = useState([]);

  const [addedWorks, setAddedWorks] = useState([]);
  const [currency, setCurrency] = useState("BYN");

  const [isModalAddMaterialsOpen, setIsAddMaterialsOpen] = useState(false);
  const [selectedWorkId, setSelectedWorkId] = useState(null);

  const [isAddWorkModalOpen, setIsAddWorkModalOpen] = useState(false);
  const [isEditWorkModalOpen, setIsEditWorkModalOpen] = useState(false);
  const [editingWork, setEditingWork] = useState(null);

  const [, setEstimateWorks] = useState([]);

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
  const priceAnchorsRef = useRef({ works: new Map(), materials: new Map() });

  const persistAnchors = useCallback(() => {
    saveEstimatePriceAnchors(user_id, orderId, priceAnchorsRef.current);
  }, [user_id, orderId]);
  const tableScrollRef = useEstimateTablePan();

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

      if (addedWorks.length === 0) {
        try {
          await persistEstimateCurrencyOnly(user_id, orderId, normalizedNew);
          setCurrency(normalizedNew);
        } catch (error) {
          console.error(error);
          await uiAlert(
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

        // Якоря не трогаем — конвертация всегда от исходной суммы.
        persistAnchors();
        setAddedWorks(convertedWorks);
        saveEstimateCurrency(user_id, orderId, normalizedNew);
        setCurrency(normalizedNew);

        const persistResult = await persistEstimateWorks(
          user_id,
          orderId,
          normalizedNew,
          convertedWorks,
        );

        if (!persistResult.saved) {
          console.error("Ошибки сохранения сметы:", persistResult.errors);
          await uiAlert(
            `Смета пересчитана в ${normalizedNew}, но не все позиции сохранены на сервере.\n\n${persistResult.errors.slice(0, 3).join("\n")}`,
          );
        }
      } catch (error) {
        console.error(error);
        if (error.message?.includes("курс") || error.message?.includes("Курс")) {
          await uiAlert("Не удалось загрузить курсы валют НБРБ. Проверьте, что сервер запущен.");
        } else if (error.message?.includes("refresh_token")) {
          await uiAlert("Сессия истекла. Войдите снова и повторите смену валюты.");
        } else {
          await uiAlert(`Не удалось пересчитать смету: ${error.message}`);
        }
      } finally {
        setIsConvertingCurrency(false);
      }
    },
    [currency, addedWorks, orderId, user_id, persistAnchors],
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

      // Берём сохранённые исходные цены, иначе BYN↔USD будет «плыть» из‑за округления.
      priceAnchorsRef.current = buildPriceAnchorsForWorks(
        flatWorks,
        user_id,
        orderId,
      );
      persistAnchors();

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
  }, [orderId, user_id, persistAnchors]);

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

        const allPersonalWorks = preferOwnSpecializationWorks(
          adminRes.ok ? await adminRes.json() : [],
          myselfRes.ok ? await myselfRes.json() : [],
        );

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

  const openAddWorkModal = () => {
    if (!orderExists) return;
    setIsAddWorkModalOpen(true);
  };

  const closeAddWorkModal = () => {
    setIsAddWorkModalOpen(false);
  };

  const handleAddedEstimateWork = useCallback(
    (newWork, anchorSource) => {
      setAddedWorks((prev) => {
        const index = prev.findIndex(
          (work) =>
            Number(work.id) === Number(newWork.id) ||
            (newWork.workDescription &&
              work.workDescription === newWork.workDescription),
        );
        const existing = index >= 0 ? prev[index] : null;
        const merged = {
          ...newWork,
          doneQuantity: Number(
            existing?.doneQuantity ?? newWork.doneQuantity ?? 0,
          ),
          materials: existing?.materials || newWork.materials || [],
        };
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = { ...existing, ...merged };
          return updated;
        }
        return [...prev, merged];
      });

      priceAnchorsRef.current.works.set(
        newWork.id,
        createMoneyAnchor(
          anchorSource?.amount ?? newWork.workPricePerUnit,
          anchorSource?.currency || newWork.currency || "BYN",
        ),
      );
      saveEstimateCurrency(user_id, orderId, normalizeCurrencyCode(currency));
      persistAnchors();
    },
    [currency, orderId, persistAnchors, user_id],
  );

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

  const handleUpdateEstimateWork = useCallback(
    (updatedWork) => {
      setAddedWorks((prev) =>
        prev.map((item) =>
          item.id === updatedWork.id ? { ...item, ...updatedWork } : item,
        ),
      );
      // Ручное изменение цены — новый якорь в текущей валюте отображения.
      priceAnchorsRef.current.works.set(
        updatedWork.id,
        createMoneyAnchor(
          updatedWork.workPricePerUnit,
          updatedWork.currency || "BYN",
        ),
      );
      persistAnchors();
    },
    [persistAnchors],
  );

  useEffect(() => {
    if (!orderId) return;
    fetchEstimateWorksMaterialsForOrder();
  }, [orderId, fetchEstimateWorksMaterialsForOrder]);

  useEffect(() => {
    if (!category_work_id) return;
    fetchWorksForCategoryWork(category_work_id);
    fetchPersonalWorksForCategoryWork(category_work_id);
  }, [
    category_work_id,
    fetchWorksForCategoryWork,
    fetchPersonalWorksForCategoryWork,
  ]);

  const removeItem = async (id) => {
    const item = addedWorks.find((work) => work.id === id);
    if (!item) return;

    const doneQuantity = Number(item.doneQuantity ?? 0);
    const workQuantity = Number(item.workQuantity ?? 0);

    if (doneQuantity > 0 && workQuantity <= doneQuantity) {
      await uiAlert("Нельзя удалить: работа есть в графике работ.");
      return;
    }

    if (!(await uiConfirm("Удалить эту работу?"))) return;

    try {
      const response = await apiFetch(
        `${API.baseURL}/delete_work_from_estimate/${user_id}/${orderId}/${id}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        const detail = await readApiError(
          response,
          "Не удалось удалить работу",
        );
        await uiAlert(detail);
        return;
      }

      const data = await response.json().catch(() => ({}));
      const remainingQty = Number(data.quantity);

      if (data.deleted === false && Number.isFinite(remainingQty)) {
        setAddedWorks((prev) =>
          prev.map((work) =>
            work.id === id ? { ...work, workQuantity: remainingQty } : work,
          ),
        );
        return;
      }

      setAddedWorks((prev) => prev.filter((work) => work.id !== id));
      priceAnchorsRef.current.works.delete(id);
      persistAnchors();
    } catch (error) {
      console.error(error);
      await uiAlert("Ошибка соединения с сервером");
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
    persistAnchors();
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
    persistAnchors();
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
            className={`currency-select header${
              isConvertingCurrency ? " currency-select--busy" : ""
            }`}
            disabled={isConvertingCurrency}
            aria-busy={isConvertingCurrency}
          >
            {currencies.map((cur) => (
              <option key={cur} value={cur}>
                {cur}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="estimate-summary">
        <div className="summary-card">
          <span className="summary-label">Позиций</span>
          <span className="summary-value">{addedWorks.length}</span>
        </div>
        <div className="summary-card summary-card--primary">
          <span className="summary-label">Всего заработок</span>
          <span className="summary-value">
            {formatMoney(totalWorkCost)}{" "}
            <span className="currency-inline">{currency}</span>
          </span>
        </div>
        <div className="summary-card summary-card--success">
          <span className="summary-label">Уже сделано</span>
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
        <div className="estimate-card-head estimate-card-head--add">
          <button
            type="button"
            className="btn-add btn-add--header"
            onClick={openAddWorkModal}
            disabled={!orderExists}
          >
            Добавить работу
          </button>
          <h3 className="estimate-section-title">Список работ</h3>
        </div>
        <div
          ref={tableScrollRef}
          className="table-wrapper table-wrapper--estimate"
          role="region"
          aria-label="Таблица сметы: зажмите мышь и тяните для прокрутки"
        >
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
                        Нажмите «Добавить работу», чтобы открыть форму
                      </p>
                      {orderExists && (
                        <button
                          type="button"
                          className="btn-add btn-add--header"
                          onClick={openAddWorkModal}
                        >
                          Добавить работу
                        </button>
                      )}
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
                <span className="estimate-totals__label">Всего заработок</span>
                <span className="estimate-totals__value">
                  {formatMoney(totalWorkCost)}{" "}
                  <span className="currency-inline">{currency}</span>
                </span>
              </div>
              <div className="estimate-totals__item">
                <span className="estimate-totals__label">Уже сделано</span>
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

      {isAddWorkModalOpen && (
        <AddWorkModal
          userId={user_id}
          orderId={orderId}
          orderExists={orderExists}
          categoryWorkId={category_work_id}
          currency={currency}
          works={works}
          personalWorks={personalWorks}
          onClose={closeAddWorkModal}
          onAdded={handleAddedEstimateWork}
          onPersonalWorksNeedRefresh={
            category_work_id
              ? () => fetchPersonalWorksForCategoryWork(category_work_id)
              : undefined
          }
        />
      )}

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
