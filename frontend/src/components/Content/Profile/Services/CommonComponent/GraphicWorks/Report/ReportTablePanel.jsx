import React, { useState, useMemo } from "react";
import ReportFilters from "./ReportFilters";
import {
  filterRowsByPeriod,
  formatMoney,
  hasPeriodSelected,
} from "./reportUtils";
import ReportSummaryCards from "./ReportSummaryCards";

export default function ReportTablePanel({
  tableData,
  workOptions,
  currency,
  loading,
}) {
  const [dateMode, setDateMode] = useState("single");
  const [singleDate, setSingleDate] = useState("");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [selectedWorkOptions, setSelectedWorkOptions] = useState([]);

  const periodState = { dateMode, singleDate, rangeStart, rangeEnd };
  const periodSelected = hasPeriodSelected(
    dateMode,
    singleDate,
    rangeStart,
    rangeEnd,
  );
  const worksSelected = selectedWorkOptions.length > 0;

  const filteredRows = useMemo(() => {
    let rows = tableData;
    if (periodSelected) {
      rows = filterRowsByPeriod(rows, periodState, { strict: true });
    }
    if (worksSelected) {
      rows = rows.filter((row) =>
        selectedWorkOptions.some((o) => o.value === row.workName),
      );
    }
    return rows;
  }, [
    tableData,
    periodSelected,
    worksSelected,
    dateMode,
    singleDate,
    rangeStart,
    rangeEnd,
    selectedWorkOptions,
  ]);

  const filteredGroupsByDate = useMemo(() => {
    const groups = {};

    filteredRows.forEach((row) => {
      if (!groups[row.date]) {
        groups[row.date] = {
          date: row.date,
          displayDate: row.displayDate,
          works: [],
          totalQuantity: 0,
          totalEarned: 0,
        };
      }
      groups[row.date].works.push({
        key: row.key,
        workName: row.workName,
        unit: row.unit,
        quantity: row.totalQuantity,
        earned: row.earned,
        pricePerUnit: row.pricePerUnit,
      });
      groups[row.date].totalQuantity += row.totalQuantity;
      groups[row.date].totalEarned += row.earned;
    });

    return Object.values(groups)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map((group) => ({
        ...group,
        works: group.works.sort((a, b) =>
          a.workName.localeCompare(b.workName),
        ),
      }));
  }, [filteredRows]);

  const handleDateModeChange = (mode) => {
    setDateMode(mode);
    if (mode === "range" && singleDate && !rangeStart && !rangeEnd) {
      setRangeStart(singleDate);
      setRangeEnd(singleDate);
    }
  };

  const hasActiveFilters = worksSelected || periodSelected;

  return (
    <div className="rw-table-panel">
      <ReportFilters
        dateMode={dateMode}
        onDateModeChange={handleDateModeChange}
        singleDate={singleDate}
        onSingleDateChange={setSingleDate}
        rangeStart={rangeStart}
        onRangeStartChange={setRangeStart}
        rangeEnd={rangeEnd}
        onRangeEndChange={setRangeEnd}
        workOptions={workOptions}
        selectedWorkOptions={selectedWorkOptions}
        onWorksChange={setSelectedWorkOptions}
        variant="table"
      />

      <div className="rw-report__table-wrap">
        {loading ? (
          <div className="rw-report__loading">Загрузка...</div>
        ) : filteredGroupsByDate.length === 0 ? (
          <div className="rw-report__empty">
            {hasActiveFilters
              ? "Нет данных по выбранным фильтрам"
              : "Нет выполненных работ"}
          </div>
        ) : (
          filteredGroupsByDate.map((group) => (
            <div key={group.date} className="rw-report__date-group">
              <div className="rw-report__date-head">
                <h3>{group.displayDate}</h3>
                <div className="rw-report__date-meta">
                  {group.totalQuantity.toFixed(2)} ед. ·{" "}
                  {formatMoney(group.totalEarned, currency)}
                </div>
              </div>
              <table className="rw-report__table">
                <thead>
                  <tr>
                    <th>Работа</th>
                    <th className="rw-report__th-num">Цена</th>
                    <th className="rw-report__th-num">Кол-во</th>
                    <th className="rw-report__th-num">Сумма</th>
                  </tr>
                </thead>
                <tbody>
                  {group.works.map((work) => (
                    <tr key={work.key}>
                      <td>{work.workName}</td>
                      <td className="rw-report__td-num">
                        {formatMoney(work.pricePerUnit, currency)}
                      </td>
                      <td className="rw-report__td-num">
                        {Number(work.quantity).toFixed(2)} {work.unit}
                      </td>
                      <td className="rw-report__td-num">
                        {formatMoney(work.earned, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
      </div>

      <ReportSummaryCards
        rows={filteredRows}
        currency={currency}
        loading={loading}
      />
    </div>
  );
}
