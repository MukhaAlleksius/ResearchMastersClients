import React, { useEffect, useState, useCallback, useMemo } from "react";
import ReportTablePanel from "../../../Services/CommonComponent/GraphicWorks/Report/ReportTablePanel";
import WorkPeriodChart from "../../../Services/CommonComponent/GraphicWorks/Report/ChatWorks/ChartWorks";
import {
  buildPriceMap,
  formatDate,
  formatMoney,
  getPriceForWork,
} from "../../../Services/CommonComponent/GraphicWorks/Report/reportUtils";
import "../../../Services/CommonComponent/GraphicWorks/Report/report_works.css";
import { API, apiFetch } from "../../../../../../utils/api.js";

export default function ReportWorks({ order }) {
  const [reportTab, setReportTab] = useState("table");
  const [worksFromGraphicWorks, setWorksFromGraphicWorks] = useState([]);
  const [estimateWorks, setEstimateWorks] = useState([]);
  const [currency, setCurrency] = useState("BYN");
  const [loading, setLoading] = useState(false);

  const orderId = order?.id;
  const executorId = order?.executor_id;

  const priceMap = useMemo(() => buildPriceMap(estimateWorks), [estimateWorks]);

  const fetchWorksFromGraphicWorks = useCallback(async () => {
    if (!executorId || !orderId) {
      setWorksFromGraphicWorks([]);
      return;
    }
    setLoading(true);
    try {
      const response = await apiFetch(
        `${API.baseURL}/works_from_graphic_works/${executorId}/${orderId}`,
      );
      const data = response.ok ? await response.json() : [];
      setWorksFromGraphicWorks(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setWorksFromGraphicWorks([]);
    } finally {
      setLoading(false);
    }
  }, [executorId, orderId]);

  const fetchEstimatePrices = useCallback(async () => {
    if (!executorId || !orderId) return;
    try {
      const response = await apiFetch(
        `${API.baseURL}/works_estimate_full/${executorId}/${orderId}`,
      );
      if (!response.ok) {
        setEstimateWorks([]);
        return;
      }
      const data = await response.json();
      const works = Array.isArray(data?.works) ? data.works : [];
      setEstimateWorks(works);
      if (data?.currency || works[0]?.currency) {
        setCurrency(data.currency || works[0].currency || "BYN");
      }
    } catch (error) {
      console.error(error);
      setEstimateWorks([]);
    }
  }, [executorId, orderId]);

  useEffect(() => {
    fetchWorksFromGraphicWorks();
    fetchEstimatePrices();
  }, [fetchWorksFromGraphicWorks, fetchEstimatePrices]);

  const tableData = useMemo(
    () =>
      worksFromGraphicWorks
        .filter((w) => w.work_date)
        .map((w) => {
          const qty = Number(w.quantity || 0);
          const pricePerUnit = getPriceForWork(w, priceMap);
          return {
            key: w.id,
            date: w.work_date.split("T")[0],
            displayDate: formatDate(w.work_date),
            workName: w.name_work,
            totalQuantity: qty,
            unit: w.unit_measurement || "",
            pricePerUnit,
            earned: qty * pricePerUnit,
          };
        }),
    [worksFromGraphicWorks, priceMap],
  );

  const workOptions = useMemo(
    () =>
      Array.from(new Set(worksFromGraphicWorks.map((w) => w.name_work)))
        .filter(Boolean)
        .map((workName) => {
          const rows = tableData.filter((r) => r.workName === workName);
          const totalQuantity = rows.reduce((s, r) => s + r.totalQuantity, 0);
          const totalEarned = rows.reduce((s, r) => s + r.earned, 0);
          const unit = rows[0]?.unit || "";
          return {
            value: workName,
            label: `${workName} · ${totalQuantity.toFixed(2)} ${unit} · ${formatMoney(totalEarned, currency)}`,
          };
        })
        .sort((a, b) => a.value.localeCompare(b.value)),
    [worksFromGraphicWorks, tableData, currency],
  );

  const chartWorkOptions = useMemo(
    () =>
      Array.from(new Set(tableData.map((r) => r.workName)))
        .map((name) => ({ value: name, label: name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [tableData],
  );

  if (!orderId) {
    return (
      <div className="rw-report">
        <div className="rw-report__empty">Заказ не выбран</div>
      </div>
    );
  }

  if (!executorId) {
    return (
      <div className="rw-report">
        <header className="rw-report__header">
          <div>
            <h2 className="rw-report__title">График выполненных работ</h2>
            <p className="rw-report__subtitle">
              Исполнитель ещё не назначен — отчёт появится после начала работ
            </p>
          </div>
        </header>
        <div className="rw-report__empty">Нет данных для отображения</div>
      </div>
    );
  }

  return (
    <div className="rw-report">
      <header className="rw-report__header">
        <div>
          <h2 className="rw-report__title">График выполненных работ</h2>
          <p className="rw-report__subtitle">
            {reportTab === "table"
              ? "Объёмы и стоимость выполненных работ по смете заказа"
              : "Динамика выполнения по выбранной работе"}
          </p>
        </div>
      </header>

      <div className="rw-report__tabs">
        <button
          type="button"
          className={`rw-report__tab ${reportTab === "table" ? "rw-report__tab--active" : ""}`}
          onClick={() => setReportTab("table")}
        >
          Таблица
        </button>
        <button
          type="button"
          className={`rw-report__tab ${reportTab === "chart" ? "rw-report__tab--active" : ""}`}
          onClick={() => setReportTab("chart")}
        >
          График
        </button>
      </div>

      <div className="rw-report__body">
        {reportTab === "table" ? (
          <ReportTablePanel
            tableData={tableData}
            workOptions={workOptions}
            currency={currency}
            loading={loading}
          />
        ) : (
          <WorkPeriodChart
            workData={tableData}
            workOptions={chartWorkOptions}
            currency={currency}
            loading={loading}
          />
        )}
      </div>
    </div>
  );
}
