import React, { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from "recharts";
import ReportFilters from "../ReportFilters";
import ReportSummaryCards from "../ReportSummaryCards";
import { filterRowsByPeriod, formatMoney, isoToDisplayDate } from "../reportUtils";
import "../report_works.css";

const formatChartDate = (dateStr) => isoToDisplayDate(dateStr);

function ChartTooltip({ active, payload, label, currency, workLabel }) {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload || {};
  const notes = Array.isArray(point.notes)
    ? point.notes.filter(Boolean)
    : [];

  return (
    <div className="rw-chart__tooltip">
      <div className="rw-chart__tooltip-date">
        Дата: {formatChartDate(label)}
      </div>
      {payload.map((entry) => {
        const isMoney = entry.dataKey === "earned" || entry.name === "earned";
        return (
          <div key={entry.dataKey || entry.name} className="rw-chart__tooltip-row">
            <span>
              {isMoney ? "Заработок" : `${workLabel || "Работа"} (кол-во)`}
            </span>
            <strong>
              {isMoney
                ? formatMoney(entry.value, currency)
                : Number(entry.value).toFixed(2)}
            </strong>
          </div>
        );
      })}
      {notes.length > 0 ? (
        <div className="rw-chart__tooltip-notes">
          {notes.map((note, index) => (
            <p key={`${label}-note-${index}`}>{note}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function WorkPeriodChart({
  workData = [],
  workOptions = [],
  currency = "BYN",
  loading = false,
}) {
  const safeWorkData = Array.isArray(workData) ? workData : [];

  const [dateMode, setDateMode] = useState("range");
  const [singleDate, setSingleDate] = useState("");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [selectedWorkOption, setSelectedWorkOption] = useState(null);

  const filteredByDate = useMemo(
    () =>
      filterRowsByPeriod(safeWorkData, {
        dateMode,
        singleDate,
        rangeStart,
        rangeEnd,
      }),
    [safeWorkData, dateMode, singleDate, rangeStart, rangeEnd],
  );

  const currentWorkData = useMemo(() => {
    if (!selectedWorkOption?.value) return [];
    return filteredByDate.filter((row) => row.workName === selectedWorkOption.value);
  }, [filteredByDate, selectedWorkOption]);

  const chartData = useMemo(() => {
    if (!selectedWorkOption?.value) return [];

    const groupedByDate = currentWorkData.reduce((acc, item) => {
      const date = item.date;
      const qty = Number(item.totalQuantity || 0);
      const earned = Number(item.earned || 0);

      if (!date) return acc;
      if (!acc[date]) acc[date] = { date, quantity: 0, earned: 0, notes: [] };
      acc[date].quantity += qty;
      acc[date].earned += earned;
      const note = String(item.note || "").trim();
      if (note && !acc[date].notes.includes(note)) {
        acc[date].notes.push(note);
      }
      return acc;
    }, {});

    return Object.values(groupedByDate).sort(
      (a, b) => new Date(a.date) - new Date(b.date),
    );
  }, [currentWorkData, selectedWorkOption]);

  const totals = useMemo(
    () => ({
      quantity: chartData.reduce((s, d) => s + d.quantity, 0),
      earned: chartData.reduce((s, d) => s + d.earned, 0),
    }),
    [chartData],
  );

  return (
    <div className="rw-chart-panel">
      <ReportFilters
        variant="chart"
        dateMode={dateMode}
        onDateModeChange={setDateMode}
        singleDate={singleDate}
        onSingleDateChange={setSingleDate}
        rangeStart={rangeStart}
        onRangeStartChange={setRangeStart}
        rangeEnd={rangeEnd}
        onRangeEndChange={setRangeEnd}
        workOptions={workOptions}
        selectedWorkOption={selectedWorkOption}
        onWorkChange={setSelectedWorkOption}
      />

      {loading && (
        <div className="rw-report__loading">Загрузка данных...</div>
      )}

      {!loading && !selectedWorkOption && safeWorkData.length > 0 && (
        <div className="rw-chart__empty">
          Выберите работу и период, чтобы построить график
        </div>
      )}

      {!loading && safeWorkData.length === 0 && (
        <div className="rw-chart__empty">Нет данных для графика</div>
      )}

      {!loading && selectedWorkOption && chartData.length === 0 && (
        <div className="rw-chart__empty">
          Нет точек за выбранный период — измените даты или работу
        </div>
      )}

      {!loading && selectedWorkOption && chartData.length > 0 && (
        <>
          <div className="rw-chart__canvas">
            <ResponsiveContainer width="100%" height={400}>
              <LineChart
                data={chartData}
                margin={{ top: 12, right: 16, left: 4, bottom: 8 }}
              >
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatChartDate}
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  axisLine={{ stroke: "#e2e8f0" }}
                  tickLine={false}
                  dy={8}
                />
                <YAxis
                  yAxisId="qty"
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => Number(v).toFixed(1)}
                />
                <YAxis
                  yAxisId="money"
                  orientation="right"
                  tick={{ fontSize: 11, fill: "#059669" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => Number(v).toFixed(0)}
                />
                <Tooltip
                  content={
                    <ChartTooltip
                      currency={currency}
                      workLabel={selectedWorkOption.label}
                    />
                  }
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
                  formatter={(value) =>
                    value === "quantity" ? "Объём" : "Заработок"
                  }
                />
                <Line
                  yAxisId="qty"
                  type="monotone"
                  dataKey="quantity"
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "#2563eb", strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: "#1d4ed8" }}
                  name="quantity"
                />
                <Line
                  yAxisId="money"
                  type="monotone"
                  dataKey="earned"
                  stroke="#059669"
                  strokeWidth={2.5}
                  strokeDasharray="6 4"
                  dot={{ r: 4, fill: "#059669", strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: "#047857" }}
                  name="earned"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="rw-chart__stats-bar">
            <span>
              <strong>{selectedWorkOption.label}</strong>
            </span>
            <span>
              Точек: <strong>{chartData.length}</strong>
            </span>
            <span>
              Объём: <strong>{totals.quantity.toFixed(2)}</strong>
            </span>
            <span>
              Заработок:{" "}
              <strong className="rw-chart__money">
                {formatMoney(totals.earned, currency)}
              </strong>
            </span>
          </div>
        </>
      )}

      <ReportSummaryCards
        rows={currentWorkData}
        currency={currency}
        loading={loading}
      />
    </div>
  );
}
