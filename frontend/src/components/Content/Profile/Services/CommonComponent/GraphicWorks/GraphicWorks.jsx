import React, { useEffect, useState, useCallback, useMemo } from "react";
import { API, apiFetch } from "../../../../../../utils/api.js";
import AddWorksModal from "./AddWorksModal";
import ReportSummaryCards from "./Report/ReportSummaryCards";
import ReportWorks from "./Report/ReportWorks";
import { useWorksReportData } from "./Report/useWorksReportData";
import { normalizeIsoDate } from "./Report/reportUtils";
import "./graphic_works.css";

function toDateKey(year, monthIndex, day) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatLocalDate(date) {
  return toDateKey(date.getFullYear(), date.getMonth(), date.getDate());
}

function buildWorkSelectOptions(worksList) {
  const map = new Map();
  (worksList || []).forEach((work) => {
    const name =
      work.name_work || work.workDescription || work.name || "Без названия";
    const id = work.id?.toString() || work.work_id?.toString() || "";
    const key = name.trim().toLowerCase();
    if (!key || map.has(key)) return;
    map.set(key, {
      label: name,
      value: id || name,
      originalId: id,
      unit_measurement: work.unit_measurement || work.workUnit || "",
      cost_unit: Number(work.cost_unit ?? work.cost ?? 0) || "",
    });
  });
  return Array.from(map.values());
}

function getDaysInMonth(year, month) {
  const date = new Date(year, month, 1);
  const days = [];
  while (date.getMonth() === month) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return days;
}

export default function GraphicWorks({ orderId, categoryWorkId }) {
  const today = new Date();
  const todayKey = formatLocalDate(today);

  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [activeModalDate, setActiveModalDate] = useState(null);
  const [graphicWorks, setGraphicWorks] = useState([]);

  const [isDayModalOpen, setIsDayModalOpen] = useState(false);
  const [selectedWorkId, setSelectedWorkId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [loading, setLoading] = useState(false);

  const [mainTab, setMainTab] = useState("work");
  const [selectedWorkOption, setSelectedWorkOption] = useState(null);

  const [worksMasterFromAdmin, setWorksMasterFromAdmin] = useState([]);
  const [worksMasterMyself, setWorksMasterMyself] = useState([]);
  const [worksFromEstimate, setWorksFromEstimate] = useState([]);
  const [workSourceType, setWorkSourceType] = useState("common");
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  const user_id = localStorage.getItem("user_id");
  const { tableData, currency, loading: reportLoading, refresh: refreshReportData } =
    useWorksReportData(orderId);
  const safeCategoryWorkId =
    categoryWorkId && !isNaN(categoryWorkId) && categoryWorkId !== "undefined"
      ? Number(categoryWorkId)
      : null;

  const days = getDaysInMonth(currentYear, currentMonth);
  const unitOptions = ["шт", "м", "м²", "м³", "кг", "т"];

  const apiGet = useCallback(async (endpoint) => {
    const res = await apiFetch(endpoint);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }, []);

  const closeDayModal = () => {
    setIsDayModalOpen(false);
    setActiveModalDate(null);
    setSelectedWorkOption(null);
    setSelectedWorkId("");
    setQuantity("");
    setWorkSourceType("common");
  };

  const handleWorkSourceChange = (type) => {
    setWorkSourceType(type);
    setSelectedWorkOption(null);
    setSelectedWorkId("");
  };

  const fetchGraphicWorks = useCallback(async () => {
    if (!orderId || !user_id) return;
    try {
      const result = await apiGet(
        `${API.baseURL}/works_from_graphic_works/${user_id}/${orderId}`,
      );
      setGraphicWorks(Array.isArray(result) ? result : result?.works || []);
    } catch (error) {
      console.error("Ошибка fetchGraphicWorks:", error);
      setGraphicWorks([]);
    }
  }, [orderId, user_id, apiGet]);

  const handleGraphicWorkAdded = useCallback((newWork) => {
    setGraphicWorks((prev) => [...prev, newWork]);
    refreshReportData();
  }, [refreshReportData]);

  const handleGraphicWorkUpdated = useCallback((updatedWork) => {
    setGraphicWorks((prev) =>
      prev.map((work) => (work.id === updatedWork.id ? updatedWork : work)),
    );
    refreshReportData();
  }, [refreshReportData]);

  const fetchWorksFromEstimate = useCallback(async () => {
    if (!orderId || !user_id) {
      setWorksFromEstimate([]);
      return;
    }
    try {
      const result = await apiGet(
        `${API.baseURL}/works_from_estimate_works/${user_id}/${orderId}`,
      );
      const list = Array.isArray(result)
        ? result
        : result?.works || result?.items || [];
      setWorksFromEstimate(list);
    } catch (error) {
      console.error("Ошибка загрузки работ из сметы:", error);
      setWorksFromEstimate([]);
    }
  }, [orderId, user_id, apiGet]);

  const loadWorkCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    try {
      await fetchWorksFromEstimate();
      if (safeCategoryWorkId && user_id) {
        try {
          const [adminWorks, myWorks] = await Promise.all([
            apiGet(
              `${API.baseURL}/works_for_category_work/${safeCategoryWorkId}`,
            ),
            apiGet(
              `${API.baseURL}/works_master_myself/${user_id}/${safeCategoryWorkId}`,
            ),
          ]);
          setWorksMasterFromAdmin(adminWorks || []);
          setWorksMasterMyself(myWorks || []);
        } catch (error) {
          console.error("Ошибка загрузки общих работ:", error);
          setWorksMasterFromAdmin([]);
          setWorksMasterMyself([]);
        }
      } else {
        setWorksMasterFromAdmin([]);
        setWorksMasterMyself([]);
      }
    } finally {
      setLoadingCatalog(false);
    }
  }, [safeCategoryWorkId, user_id, apiGet, fetchWorksFromEstimate]);

  const commonWorksOptions = useMemo(
    () => buildWorkSelectOptions([...worksMasterFromAdmin, ...worksMasterMyself]),
    [worksMasterFromAdmin, worksMasterMyself],
  );

  const estimateWorksOptions = useMemo(
    () => buildWorkSelectOptions(worksFromEstimate),
    [worksFromEstimate],
  );

  const worksOptions = useMemo(
    () =>
      workSourceType === "estimate" ? estimateWorksOptions : commonWorksOptions,
    [workSourceType, estimateWorksOptions, commonWorksOptions],
  );

  const estimatePriceByWorkName = useMemo(() => {
    const map = {};
    worksFromEstimate.forEach((work) => {
      if (!work.name_work) return;
      map[work.name_work] = Number(work.cost_unit ?? work.cost ?? 0);
    });
    return map;
  }, [worksFromEstimate]);

  const groupedWorksByDate = useMemo(() => {
    const map = {};
    graphicWorks.forEach((work) => {
      const dateKey = normalizeIsoDate(work.work_date);
      if (!dateKey) return;
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(work);
    });
    return map;
  }, [graphicWorks]);

  useEffect(() => {
    if (orderId && user_id) {
      fetchGraphicWorks();
    }
  }, [orderId, user_id, fetchGraphicWorks]);

  useEffect(() => {
    if (mainTab === "work") {
      fetchGraphicWorks();
      loadWorkCatalog();
    }
  }, [mainTab, fetchGraphicWorks, loadWorkCatalog]);

  useEffect(() => {
    if (isDayModalOpen && orderId && user_id) {
      fetchWorksFromEstimate();
    }
  }, [isDayModalOpen, orderId, user_id, fetchWorksFromEstimate]);

  const changeMonth = (diff) => {
    let newMonth = currentMonth + diff;
    let newYear = currentYear;
    if (newMonth < 0) {
      newMonth = 11;
      newYear--;
    } else if (newMonth > 11) {
      newMonth = 0;
      newYear++;
    }
    setCurrentMonth(newMonth);
    setCurrentYear(newYear);
  };

  const goToToday = () => {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
    setSelectedDate(todayKey);
  };

  const openDayModal = (dateKey) => {
    setSelectedDate(dateKey);
    setActiveModalDate(dateKey);
    setIsDayModalOpen(true);
    loadWorkCatalog();
  };

  const handleDayClick = (day) => {
    const dateKey = formatLocalDate(day);
    if (dateKey !== selectedDate) {
      setSelectedWorkOption(null);
      setSelectedWorkId("");
      setQuantity("");
      setWorkSourceType("common");
    }
    openDayModal(dateKey);
  };

  const isAddButtonDisabled =
    loading || !quantity || !selectedWorkOption?.label || !selectedDate;

  const worksForSelectedDate = groupedWorksByDate[selectedDate] || [];
  const modalDate = activeModalDate || selectedDate;
  const worksForModalDate = groupedWorksByDate[modalDate] || [];

  return (
    <div className="gw-page">
      <div className="gw-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mainTab === "work"}
          className={`gw-tabs__btn ${mainTab === "work" ? "gw-tabs__btn--active" : ""}`}
          onClick={() => setMainTab("work")}
        >
          <i className="far fa-calendar-alt" aria-hidden="true" />
          График работ
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mainTab === "report"}
          className={`gw-tabs__btn ${mainTab === "report" ? "gw-tabs__btn--active" : ""}`}
          onClick={() => setMainTab("report")}
        >
          <i className="fas fa-chart-bar" aria-hidden="true" />
          Отчёт
        </button>
      </div>

      {mainTab === "work" && (
        <>
          <div className="gw-cal">
            <div className="gw-cal__nav">
              <button
                type="button"
                className="gw-cal__arrow"
                onClick={() => changeMonth(-1)}
                aria-label="Предыдущий месяц"
              >
                ‹
              </button>
              <div className="gw-cal__title-wrap">
                <div className="gw-cal__title">
                  {new Date(currentYear, currentMonth).toLocaleString("ru-RU", {
                    month: "long",
                    year: "numeric",
                  })}
                </div>
                <button
                  type="button"
                  className="gw-cal__today"
                  onClick={goToToday}
                >
                  Сегодня
                </button>
              </div>
              <button
                type="button"
                className="gw-cal__arrow"
                onClick={() => changeMonth(1)}
                aria-label="Следующий месяц"
              >
                ›
              </button>
            </div>

            <div className="gw-cal__weekdays">
              {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d, index) => (
                <div
                  key={d}
                  className={`gw-cal__weekday ${index >= 5 ? "gw-cal__weekday--weekend" : ""}`}
                >
                  {d}
                </div>
              ))}
            </div>

            <div className="gw-cal__grid">
              {Array((days[0].getDay() + 6) % 7)
                .fill(null)
                .map((_, i) => (
                  <span
                    key={`empty-${i}`}
                    className="gw-cal__cell gw-cal__cell--empty"
                    aria-hidden="true"
                  />
                ))}
              {days.map((day) => {
                const dateKey = formatLocalDate(day);
                const isSelected = dateKey === selectedDate;
                const isToday = dateKey === todayKey;
                const dayWorks = groupedWorksByDate[dateKey] || [];
                const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                return (
                  <button
                    key={dateKey}
                    type="button"
                    onClick={() => handleDayClick(day)}
                    className={[
                      "gw-cal__cell",
                      isSelected ? "gw-cal__cell--selected" : "",
                      isToday ? "gw-cal__cell--today" : "",
                      dayWorks.length > 0 ? "gw-cal__cell--has-work" : "",
                      isWeekend ? "gw-cal__cell--weekend" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    aria-label={`${day.getDate()}${dayWorks.length ? `, работ: ${dayWorks.length}` : ""}`}
                    aria-pressed={isSelected}
                  >
                    <span className="gw-cal__day-num">{day.getDate()}</span>
                    {dayWorks.length > 0 && (
                      <span className="gw-cal__badge" aria-hidden="true">
                        {dayWorks.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="gw-cal__legend">
              <span className="gw-cal__legend-item">
                <span className="gw-cal__legend-dot gw-cal__legend-dot--today" />
                Сегодня
              </span>
              <span className="gw-cal__legend-item">
                <span className="gw-cal__legend-dot gw-cal__legend-dot--work" />
                Есть работы
              </span>
            </div>
          </div>

          <section className="gw-day-panel" aria-label="Работы выбранного дня">
            <div className="gw-day-panel__head">
              <h3 className="gw-day-panel__title">Работы</h3>
              <button
                type="button"
                className="gw-day-panel__action"
                onClick={() => openDayModal(selectedDate)}
              >
                {worksForSelectedDate.length > 0 ? "Изменить" : "Добавить"}
              </button>
            </div>

            {worksForSelectedDate.length === 0 ? (
              <p className="gw-day-panel__empty">
                Работ пока нет. Нажмите «Добавить», чтобы запланировать задачи.
              </p>
            ) : (
              <ul className="gw-day-panel__list">
                {worksForSelectedDate.map((work, index) => (
                  <li
                    key={work.id || `${work.name_work}-${index}`}
                    className="gw-day-panel__item"
                  >
                    <span className="gw-day-panel__item-name">{work.name_work}</span>
                    <span className="gw-day-panel__item-qty">
                      {work.quantity} {work.unit_measurement}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <ReportSummaryCards
            rows={tableData}
            currency={currency}
            loading={reportLoading}
          />

          <AddWorksModal
            key={modalDate}
            userId={user_id}
            orderId={orderId}
            fetchGraphicWorks={fetchGraphicWorks}
            onGraphicWorkAdded={handleGraphicWorkAdded}
            onGraphicWorkUpdated={handleGraphicWorkUpdated}
            isOpen={isDayModalOpen}
            onClose={closeDayModal}
            selectedDate={modalDate}
            selectedWorkOption={selectedWorkOption}
            setSelectedWorkOption={setSelectedWorkOption}
            selectedWorkId={selectedWorkId}
            setSelectedWorkId={setSelectedWorkId}
            quantity={quantity}
            setQuantity={setQuantity}
            works={worksForModalDate}
            worksOptions={worksOptions}
            estimatePriceByWorkName={estimatePriceByWorkName}
            workSourceType={workSourceType}
            onWorkSourceChange={handleWorkSourceChange}
            loadingCatalog={loadingCatalog}
            unitOptions={unitOptions}
            isAddButtonDisabled={isAddButtonDisabled}
            loading={loading}
            setLoading={setLoading}
          />
        </>
      )}

      {mainTab === "report" && <ReportWorks orderId={orderId} />}
    </div>
  );
}
