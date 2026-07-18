import React, { useState, useMemo } from "react";
import Select from "react-select";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

export default function CustomerWorkPeriodChart({ workData = [], filteredData = [] }) {
  const safeWorkData = Array.isArray(workData) ? workData : [];
  const safeFilteredData = Array.isArray(filteredData) ? filteredData : [];

  // ✅ Состояние
  const [selectedWorkOption, setSelectedWorkOption] = useState(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // ✅ УНИКАЛЬНЫЕ РАБОТЫ ПО ИМЕНИ (без дублей!)
  const workOptions = useMemo(() => {
    const workNameMap = new Map();

    safeWorkData.forEach((item) => {
      // Приоритет полей для имени работы
      const workName =
        item.workName ||
        item.name_work ||
        item.name ||
        `Работа ${item.key || item.id || "без ID"}`;

      const workId = item.key || item.id || workName;

      // Сохраняем ТОЛЬКО ПЕРВУЮ встреченную работу с этим именем
      if (!workNameMap.has(workName)) {
        workNameMap.set(workName, {
          value: workId.toString(),
          label: workName,
        });
      }
    });

    const options = Array.from(workNameMap.values());
    console.log("🔍 Уникальных работ:", options.length);
    return options;
  }, [safeWorkData]);

  // ✅ Данные ТОЛЬКО выбранной работы по ВСЕМ датам
  const currentWorkData = useMemo(() => {
    if (!selectedWorkOption?.value) return safeFilteredData;

    return safeFilteredData.filter((item) => {
      const itemWorkName = item.workName || item.name_work || item.name;
      // Ищем по ИМЕНИ работы (а не по ID!)
      return itemWorkName === selectedWorkOption.label;
    });
  }, [safeFilteredData, selectedWorkOption]);

  // ✅ Данные для графика с группировкой по датам + фильтр дат
  const chartData = useMemo(() => {
    if (!selectedWorkOption?.value) return []; // ✅ Пустой график без выбора

    // Группируем по датам, суммируя количество
    const groupedByDate = currentWorkData.reduce((acc, item) => {
      const date = item.date;
      const qty = Number(item.totalQuantity || item.quantity || 0);

      if (date && !acc[date]) {
        acc[date] = { date, quantity: 0 };
      }
      if (date) {
        acc[date].quantity += qty;
      }
      return acc;
    }, {});

    let data = Object.values(groupedByDate);

    // Фильтр по датам
    if (startDate || endDate) {
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;

      data = data.filter((item) => {
        if (!item.date) return false;
        const itemDate = new Date(item.date);
        if (start && itemDate < start) return false;
        if (end && itemDate > end) return false;
        return true;
      });
    }

    return data.sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [currentWorkData, startDate, endDate, selectedWorkOption]);

  return (
    <div style={{ maxWidth: 700, margin: "auto", padding: 20 }}>
      {/* ✅ Select УНИКАЛЬНЫХ РАБОТ */}
      <div
        style={{
          padding: "16px",
          background: "#f8f9fa",
          borderRadius: "12px",
          marginBottom: 20,
        }}
      >
        <div style={{ marginBottom: 12, fontSize: "16px", fontWeight: "500" }}>
          📋 Выберите работу ({workOptions.length} уникальных):
        </div>
        <Select
          options={workOptions}
          value={selectedWorkOption}
          onChange={setSelectedWorkOption}
          isClearable
          isSearchable
          placeholder="Выберите работу..."
          noOptionsMessage={() => "Нет доступных работ"}
          styles={{
            control: (base) => ({
              ...base,
              minHeight: 44,
              borderColor: "#007bff",
              borderRadius: "8px",
            }),
            menu: (base) => ({
              ...base,
              borderRadius: "8px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            }),
          }}
        />
      </div>

      {/* ✅ ФИЛЬТРЫ ДАТ */}
      <div
        style={{
          padding: "16px",
          background: "#e3f2fd",
          borderRadius: "12px",
          marginBottom: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 16,
            alignItems: "center",
            flexWrap: "wrap",
            fontSize: "16px",
            fontWeight: "500",
          }}
        >
          📅 Начало периода:
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{
              padding: "8px 12px",
              border: "1px solid #007bff",
              borderRadius: "6px",
              fontSize: "14px",
            }}
            max={endDate || undefined}
          />
          <span style={{ fontSize: "24px", color: "#666" }}>→</span>
          Конец периода:
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{
              padding: "8px 12px",
              border: "1px solid #007bff",
              borderRadius: "6px",
              fontSize: "14px",
            }}
            min={startDate || undefined}
          />
          <div style={{ color: "#1976d2", fontWeight: "600" }}>
            📊 Точек: <strong>{chartData.length}</strong> | 📝 Записей:{" "}
            <strong>{currentWorkData.length}</strong>
          </div>
        </div>
      </div>

      {/* ✅ ГРАФИК - ТОЛЬКО при выборе работы */}
      {selectedWorkOption && (
        <>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData}>
              <CartesianGrid stroke="#f0f0f0" strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                angle={-45}
                textAnchor="end"
                height={70}
                tick={{ fontSize: 12 }}
              />
              <YAxis tickFormatter={(value) => Number(value).toFixed(1)} />
              <Tooltip
                formatter={(value) => [
                  Number(value).toFixed(2),
                  `${selectedWorkOption.label} (количество)`,
                ]}
                labelFormatter={(label) => `Дата: ${label}`}
              />
              <Line
                type="monotone"
                dataKey="quantity"
                stroke="#007bff"
                strokeWidth={4}
                activeDot={{ r: 10, stroke: "#fff", strokeWidth: 3 }}
                dot={{ fill: "#007bff", strokeWidth: 2 }}
                name={selectedWorkOption.label}
              />
            </LineChart>
          </ResponsiveContainer>

          {/* ✅ СТАТИСТИКА */}
          <div
            style={{
              textAlign: "center",
              padding: "20px",
              background: "#f8f9fa",
              borderRadius: "12px",
              marginTop: 20,
              color: "#1976d2",
              fontWeight: "500",
            }}
          >
            <strong>{selectedWorkOption.label}</strong>
            <br />
            📝 Всего записей: <strong>{currentWorkData.length}</strong> | 📊
            Точек на графике: <strong>{chartData.length}</strong> | 💰 Итого
            выполнено:{" "}
            <strong>
              {chartData.reduce((sum, d) => sum + d.quantity, 0).toFixed(2)} ед.
            </strong>
            {startDate && endDate && ` (период: ${startDate} → ${endDate})`}
          </div>
        </>
      )}

      {/* ✅ Сообщение когда работа не выбрана */}
      {!selectedWorkOption && safeWorkData.length > 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "60px 20px",
            color: "#666",
            fontStyle: "italic",
            background: "#f8f9fa",
            borderRadius: "12px",
            marginTop: 20,
          }}
        >
          📊 Выберите работу выше для просмотра графика динамики выполнения
        </div>
      )}

      {/* ✅ Пустое состояние */}
      {safeWorkData.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "40px 20px",
            color: "#999",
            fontStyle: "italic",
            background: "#f8f9fa",
            borderRadius: "12px",
          }}
        >
          Нет данных для отображения графика
        </div>
      )}
    </div>
  );
}
