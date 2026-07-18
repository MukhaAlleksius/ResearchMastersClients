// OrdersScientist.js - ПОЛНАЯ ОПТИМИЗИРОВАННАЯ ВЕРСИЯ С ЛОКАЛЬНЫМ СКРОЛЛОМ
import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { useLocation, useOutletContext } from "react-router-dom";
import { API, apiFetch, buildApiUrl, normalizeListResponse } from "../../../../../../../../utils/api.js";
import "./orders_scientist.css";

export default function UserOrdersScientist({
  userId,
  endpoint = "orders_customer_admin",
  title = "Анализ заказов",
  statusKey = "status_order_customer",
  emptyLabel = "заказов",
  emptyMessage,
}) {
  const location = useLocation();
  const { refetchUserData } = useOutletContext() || {};

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [visibleColumns, setVisibleColumns] = useState({
    id: true,
    title: true,
    category_work: true,
    status_order_customer: true,
    budget: true,
    budget_contract: true,
    created_at: true,
    customer_id: true,
    executor_name: true,
    country: true,
    town: true,
  });

  const itemsPerPage = 15;
  const tableRef = useRef(null);

  // 🔥 КОНФИГУРАЦИЯ КОЛОНОК
  const columnsConfig = useMemo(
    () => [
      { key: "id", label: "ID", width: "60px", mobile: true },
      { key: "title", label: "Название", width: "220px", mobile: true },
      {
        key: "category_work",
        label: "Категория",
        width: "140px",
        mobile: true,
      },
      {
        key: "status_order_customer",
        label: "Статус",
        width: "120px",
        mobile: true,
      },
      { key: "budget", label: "Бюджет", width: "120px", mobile: true },
      {
        key: "budget_contract",
        label: "Контракт",
        width: "130px",
        mobile: false,
      },
      { key: "created_at", label: "Создан", width: "110px", mobile: true },
      { key: "updated_at", label: "Обновлен", width: "110px", mobile: false },
      { key: "customer_id", label: "Заказчик", width: "90px", mobile: true },
      {
        key: "executor_name",
        label: "Исполнитель",
        width: "140px",
        mobile: false,
      },
      { key: "executor_id", label: "ID исполн.", width: "90px", mobile: false },
      { key: "country", label: "Страна", width: "100px", mobile: false },
      { key: "region", label: "Регион", width: "100px", mobile: false },
      { key: "town", label: "Город", width: "100px", mobile: true },
      { key: "description", label: "Описание", width: "250px", mobile: false },
      {
        key: "date_start_work",
        label: "Начало работ",
        width: "120px",
        mobile: false,
      },
      {
        key: "date_end_work",
        label: "Конец работ",
        width: "120px",
        mobile: false,
      },
      {
        key: "currency_contract",
        label: "Валюта",
        width: "90px",
        mobile: false,
      },
    ],
    [],
  );

  // 🔥 ОБРАБОТКА ФИЛЬТРОВ ИЗ URL
  const buildQueryParams = useCallback(() => {
    const params = new URLSearchParams();
    if (userId != null && userId !== "") {
      params.set("user_id", String(userId));
    }
    const urlParams = new URLSearchParams(location.search);

    const filterKeys = [
      "category_work_slug",
      "country",
      "region",
      "town",
      endpoint === "services_executor_admin" ? "status_service" : "status_order",
      "budget_from",
      "budget_to",
      "start_date_orders",
      "end_date_orders",
    ];

    filterKeys.forEach((key) => {
      const value = urlParams.get(key);
      if (value) params.set(key, value);
    });

    return params;
  }, [userId, location.search, endpoint]);

  // 🔥 ЗАГРУЗКА ДАННЫХ
  const fetchOrdersData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const backendParams = buildQueryParams();
      const url = buildApiUrl(`/${endpoint}`, backendParams);

      const response = await apiFetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const ordersData = await response.json();
      setData(normalizeListResponse(ordersData));
    } catch (error) {
      console.error("Ошибка аналитики:", error);
      setError("Не удалось загрузить данные для анализа");
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [buildQueryParams, endpoint]);

  useEffect(() => {
    fetchOrdersData();
  }, [fetchOrdersData]);

  // 🔥 ВЫЧИСЛЯЕМЫЕ ЗНАЧЕНИЯ
  const totalPages = useMemo(
    () => Math.ceil(data.length / itemsPerPage),
    [data.length],
  );
  const paginatedData = useMemo(
    () =>
      data.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage),
    [data, currentPage],
  );

  const visibleColumnsCount = useMemo(
    () => columnsConfig.filter((col) => visibleColumns[col.key]).length,
    [visibleColumns, columnsConfig],
  );

  // 🔥 РЕНДЕР ЗНАЧЕНИЙ
  const renderCell = useCallback((order, column) => {
    let value = order[column.key];

    if (column.key === statusKey || column.key === "status_order_customer" || column.key === "status_service_executor") {
      return value || "—";
    }

    if (column.key === "budget" || column.key === "budget_contract") {
      return `${value || 0} ${order.currency || order.currency_contract || "BYN"}`;
    }

    if (column.key === "created_at" || column.key === "updated_at") {
      return value ? new Date(value).toLocaleDateString("ru-RU") : "—";
    }

    return value || "—";
  }, [statusKey]);

  const handlePageChange = useCallback(
    (page) => {
      if (page >= 1 && page <= totalPages) {
        setCurrentPage(page);
        tableRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
    [totalPages],
  );

  // СОСТОЯНИЯ
  if (loading) return <LoadingState />;
  if (error) return <ErrorState onRetry={fetchOrdersData} />;
  if (data.length === 0)
    return (
      <EmptyState
        filtersApplied={location.search !== ""}
        emptyLabel={emptyLabel}
        emptyMessage={emptyMessage}
        userId={userId}
      />
    );

  const displayTitle = userId ? `${title} #${userId}` : title;

  return (
    <div className="scientist-container">
      <div className="scientist-header">
        <div className="scientist-title-group">
          <span className="scientist-eyebrow">Табличный режим</span>
          <h2 className="scientist-title">{displayTitle}</h2>
          <div className="scientist-stats">
            <span className="stat-item">
              Всего: <strong>{data.length}</strong>
            </span>
            <span className="stat-item">
              На странице: <strong>{paginatedData.length}</strong>
            </span>
            <span className="stat-item">
              Колонок: <strong>{visibleColumnsCount}</strong>
            </span>
          </div>
        </div>

        <div className="scientist-controls">
          <ColumnVisibilityDropdown
            columns={columnsConfig}
            visibleColumns={visibleColumns}
            onVisibilityChange={setVisibleColumns}
          />
          <button
            className="scientist-refresh-btn"
            onClick={fetchOrdersData}
            title="Обновить данные (⌘+R)"
          >
            <i className="fas fa-sync-alt"></i>
          </button>
        </div>
      </div>

      {/* 🔥 ТАБЛИЦА С ЛОКАЛЬНЫМ СКРОЛЛОМ */}
      <div className="scientist-table-wrapper" ref={tableRef}>
        <div className="table-scroll-container">
          <table className="scientist-table">
            <thead>
              <tr className="table-header">
                {columnsConfig.map(
                  (column) =>
                    visibleColumns[column.key] && (
                      <th
                        key={column.key}
                        className="table-header-cell"
                        style={{
                          width: column.width,
                          minWidth: column.width,
                          maxWidth: column.width,
                        }}
                      >
                        {column.label}
                      </th>
                    ),
                )}
              </tr>
            </thead>
            <tbody>
              {paginatedData.map((order) => (
                <tr key={order.id} className="table-row">
                  {columnsConfig.map(
                    (column) =>
                      visibleColumns[column.key] && (
                        <td
                          key={column.key}
                          className="table-cell"
                          style={{
                            width: column.width,
                            minWidth: column.width,
                            maxWidth: column.width,
                          }}
                          title={renderCell(order, column).toString()}
                        >
                          {renderCell(order, column)}
                        </td>
                      ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ПАГИНАЦИЯ */}
      <ScientistPagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={handlePageChange}
        totalItems={data.length}
        itemsPerPage={itemsPerPage}
      />
    </div>
  );
}

// 🔥 ВСПОМОГАТЕЛЬНЫЕ КОМПОНЕНТЫ
function LoadingState() {
  return (
    <div className="scientist-empty-state">
      <div className="loading-spinner" aria-hidden="true" />
      <p className="empty-state-text">Загрузка аналитики…</p>
    </div>
  );
}

function ErrorState({ onRetry }) {
  return (
    <div className="scientist-empty-state scientist-empty-state--error">
      <span className="scientist-empty-state__icon" aria-hidden="true">
        ⚠
      </span>
      <p className="empty-state-text">Ошибка загрузки данных</p>
      <button type="button" className="retry-btn" onClick={onRetry}>
        Повторить
      </button>
    </div>
  );
}

function EmptyState({ filtersApplied, emptyLabel = "заказов", emptyMessage, userId }) {
  const defaultMessage = userId
    ? `У пользователя пока нет ${emptyLabel}`
    : `На платформе пока нет ${emptyLabel}`;

  return (
    <div className="scientist-empty-state">
      <span className="scientist-empty-state__icon" aria-hidden="true">
        📊
      </span>
      <h3 className="empty-title">
        {filtersApplied ? "Нет данных по фильтрам" : `${emptyLabel.charAt(0).toUpperCase()}${emptyLabel.slice(1)} не найдены`}
      </h3>
      <p className="empty-state-text">
        {filtersApplied
          ? "Попробуйте изменить фильтры"
          : emptyMessage || defaultMessage}
      </p>
    </div>
  );
}

function ColumnVisibilityDropdown({
  columns,
  visibleColumns,
  onVisibilityChange,
}) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  const toggleColumn = (columnKey) => {
    onVisibilityChange((prev) => ({
      ...prev,
      [columnKey]: !prev[columnKey],
    }));
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="column-dropdown" ref={dropdownRef}>
      <button className="column-toggle-btn" onClick={() => setOpen(!open)}>
        <i className="fas fa-columns"></i>
        Колонки ({Object.values(visibleColumns).filter(Boolean).length}/
        {columns.length})
        <i className={`fas fa-chevron-${open ? "up" : "down"} ml-1`}></i>
      </button>

      {open && (
        <div className="column-dropdown-menu">
          <div className="column-list">
            {columns.map((column) => (
              <label key={column.key} className="column-item">
                <input
                  type="checkbox"
                  checked={visibleColumns[column.key]}
                  onChange={() => toggleColumn(column.key)}
                />
                <span>{column.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ScientistPagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  itemsPerPage,
}) {
  if (totalPages <= 1) return null;

  const getVisiblePages = () => {
    const delta = 2;
    const range = [];
    const rangeWithDots = [];

    for (
      let i = Math.max(2, currentPage - delta);
      i <= Math.min(totalPages - 1, currentPage + delta);
      i++
    ) {
      range.push(i);
    }

    if (currentPage - delta > 2) rangeWithDots.push("...");
    rangeWithDots.push(...range);
    if (currentPage + delta < totalPages - 1) rangeWithDots.push("...");

    return [1, ...rangeWithDots, totalPages].filter(Boolean);
  };

  return (
    <div className="scientist-pagination">
      <div className="pagination-info">
        {(currentPage - 1) * itemsPerPage + 1}–
        {Math.min(currentPage * itemsPerPage, totalItems)}
        из {totalItems}
      </div>

      <div className="pagination-controls">
        <button
          className="page-btn prev"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
        >
          <i className="fas fa-chevron-left"></i>
        </button>

        {getVisiblePages().map((page, index) =>
          page === "..." ? (
            <span key={`dots-${index}`} className="page-dots">
              ...
            </span>
          ) : (
            <button
              key={page}
              className={`page-btn ${currentPage === page ? "active" : ""}`}
              onClick={() => onPageChange(page)}
            >
              {page}
            </button>
          ),
        )}

        <button
          className="page-btn next"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
        >
          <i className="fas fa-chevron-right"></i>
        </button>
      </div>
    </div>
  );
}
