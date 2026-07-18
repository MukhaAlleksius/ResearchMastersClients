import React, { useEffect, useState, useCallback } from "react";
import { API, apiFetch } from "../../../../../../utils/api.js";
import CustomerViewMaterialsModal from "./CustomerViewMaterialsModal";
import { normalizeCurrencyCode } from "../../../../../../utils/currency";
import { resolveEstimateCurrency } from "../../../../../../utils/estimateStorage.js";
import "../../../Services/CommonComponent/EstimateWorksMaterials/estimate_works_materials.css";
import "./customer_estimate_works_materials.css";
const formatMoney = (value) =>
  Number(value || 0).toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const mapWorkFromApi = (work, currencyFallback) => ({
  id: work.id,
  workDescription: work.name_work || "Без названия",
  workQuantity: Number(work.quantity || 0),
  doneQuantity: Number(work.done_quantity || 0),
  workUnit: work.unit_measurement || "",
  workPricePerUnit: Number(work.cost_unit || 0),
  currency: work.currency || currencyFallback,
  materials: (work.materials || []).map((mat) => ({
    id: mat.id,
    materialDescription: mat.name_material,
    materialQuantity: Number(mat.quantity || 0),
    materialUnit: mat.unit_measurement || "",
    materialPricePerUnit: Number(mat.cost_unit || 0),
    currency: mat.currency || currencyFallback,
  })),
});

export default function CustomerEstimateWorks({ order_id, executor_id }) {
  const [addedWorks, setAddedWorks] = useState([]);
  const [currency, setCurrency] = useState("BYN");
  const [loading, setLoading] = useState(false);
  const [orderId, setOrderId] = useState(order_id);
  const [selectedWorkId, setSelectedWorkId] = useState(null);
  const [isMaterialsModalOpen, setIsMaterialsModalOpen] = useState(false);

  useEffect(() => {
    setOrderId(order_id || null);
  }, [order_id]);

  const mergeDoneQuantities = useCallback(async (works, execId, ordId) => {
    if (!execId || !ordId) return works;

    try {
      const gwRes = await apiFetch(
        `${API.baseURL}/works_from_graphic_works/${execId}/${ordId}`,
      );
      if (!gwRes.ok) return works;

      const graphicWorks = await gwRes.json();
      const graphicList = Array.isArray(graphicWorks) ? graphicWorks : [];

      return works.map((work) => {
        const matched = graphicList.find(
          (gw) => gw.work_id === work.id || gw.id === work.id,
        );
        return {
          ...work,
          doneQuantity: matched
            ? Number(matched.done_quantity || matched.quantity || 0)
            : Number(work.doneQuantity || 0),
        };
      });
    } catch {
      return works;
    }
  }, []);

  const fetchEstimate = useCallback(async () => {
    if (!orderId || !executor_id) {
      setAddedWorks([]);
      return;
    }

    setLoading(true);
    try {
      const response = await apiFetch(
        `${API.baseURL}/works_estimate_full/${executor_id}/${orderId}`,
      );

      if (!response.ok) {
        setAddedWorks([]);
        return;
      }

      const data = await response.json();
      const worksCurrency = normalizeCurrencyCode(
        resolveEstimateCurrency(data, executor_id, orderId),
      );
      setCurrency(worksCurrency);

      let flatWorks = (data.works || []).map((work) =>
        mapWorkFromApi(work, worksCurrency),
      );
      flatWorks = await mergeDoneQuantities(
        flatWorks,
        executor_id,
        orderId,
      );
      setAddedWorks(flatWorks);
    } catch (error) {
      console.error("Ошибка загрузки сметы:", error);
      setAddedWorks([]);
    } finally {
      setLoading(false);
    }
  }, [orderId, executor_id, mergeDoneQuantities]);

  useEffect(() => {
    fetchEstimate();
  }, [fetchEstimate]);

  const totalWorkCost = addedWorks.reduce(
    (sum, item) =>
      sum +
      Number(item.workPricePerUnit || 0) * Number(item.workQuantity || 0),
    0,
  );

  const totalMaterialCost = addedWorks.reduce((sum, item) => {
    const materialsSum = (item.materials || []).reduce(
      (mSum, mat) =>
        mSum +
        Number(mat?.materialPricePerUnit || 0) *
          Number(mat?.materialQuantity || 0),
      0,
    );
    return sum + materialsSum;
  }, 0);

  const totalDoneCost = addedWorks.reduce(
    (sum, item) =>
      sum +
      Number(item.workPricePerUnit || 0) * Number(item.doneQuantity || 0),
    0,
  );

  const openMaterialsModal = (workId) => {
    setSelectedWorkId(workId);
    setIsMaterialsModalOpen(true);
  };

  const closeMaterialsModal = () => {
    setIsMaterialsModalOpen(false);
    setSelectedWorkId(null);
  };

  const selectedWork = addedWorks.find((w) => w.id === selectedWorkId);

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
          <button
            type="button"
            onClick={() => openMaterialsModal(item.id)}
            className="btn-materials"
            title="Материалы"
          >
            Материалы
            {(item.materials || []).length > 0 && (
              <span className="btn-materials__count">
                {(item.materials || []).length}
              </span>
            )}
          </button>
        </td>
      </tr>
    );
  };

  if (!executor_id) {
    return (
      <div className="container-wrap estimate-works estimate-works--view">
        <div className="estimate-empty-notice">
          <p className="estimate-empty-notice__title">Смета пока недоступна</p>
          <p className="estimate-empty-notice__text">
            Исполнитель ещё не назначен. Смету составляет исполнитель после
            принятия заказа.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container-wrap estimate-works estimate-works--view">
      <header className="estimate-header">
        <div className="estimate-header-text">
          <h2 className="estimate-title">Смета работ</h2>
          <p className="estimate-subtitle">
            Смета, составленная исполнителем
          </p>
        </div>
        <div className="estimate-header-currency estimate-header-currency--readonly">
          <span className="estimate-currency-label">
            Валюта: <strong>{currency}</strong>
          </span>
        </div>
      </header>

      {loading ? (
        <p className="estimate-loading">Загрузка сметы…</p>
      ) : (
        <>
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
            <div
              className="table-wrapper table-wrapper--estimate"
              role="region"
              aria-label="Таблица сметы, прокрутка по горизонтали"
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
                          <span
                            className="empty-state-icon"
                            aria-hidden="true"
                          />
                          <p className="empty-state-title">Смета пуста</p>
                          <p className="empty-state-text">
                            Исполнитель ещё не добавил позиции в смету
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
                    <span className="estimate-totals__label">
                      Стоимость работ
                    </span>
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
        </>
      )}

      {isMaterialsModalOpen && selectedWorkId && (
        <CustomerViewMaterialsModal
          workId={selectedWorkId}
          work={selectedWork}
          onClose={closeMaterialsModal}
        />
      )}
    </div>
  );
}
