import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  FaCalendarAlt,
  FaClock,
  FaMapMarkerAlt,
  FaTrashAlt,
  FaSyncAlt,
} from "react-icons/fa";
import { API, apiFetch } from "../../../../../utils/api.js";
import "./graphic_orders.css";

function toDateKey(year, monthIndex, day) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatLocalDate(date) {
  return toDateKey(date.getFullYear(), date.getMonth(), date.getDate());
}

function toLocalDateKey(value) {
  if (!value) return "";
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    const isoPart = raw.split(/[T\s]/)[0];
    return /^\d{4}-\d{2}-\d{2}$/.test(isoPart) ? isoPart : "";
  }
  return formatLocalDate(d);
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

function useFlashMessage(timeout = 3500) {
  const [message, setMessage] = useState({ type: "", text: "" });
  const show = useCallback(
    (type, text) => {
      setMessage({ type, text });
      if (text) setTimeout(() => setMessage({ type: "", text: "" }), timeout);
    },
    [timeout],
  );
  return [message, show];
}

export default function ExecutorOrdersSchedule() {
  const today = new Date();
  const todayKey = formatLocalDate(today);

  const [orders, setOrders] = useState([]);
  const [graphicOrders, setGraphicOrders] = useState([]);
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [newOrderId, setNewOrderId] = useState("");
  const [loading, setLoading] = useState(false);
  const [flash, showFlash] = useFlashMessage();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState(null);

  const userId = Number(localStorage.getItem("user_id"));

  const normalizedGraphicOrders = useMemo(
    () =>
      graphicOrders.map((item) => ({
        ...item,
        dateKey: toLocalDateKey(item.date_start),
      })),
    [graphicOrders],
  );

  const ordersByDate = useMemo(() => {
    const map = {};
    normalizedGraphicOrders.forEach((item) => {
      if (!item.dateKey) return;
      if (!map[item.dateKey]) map[item.dateKey] = [];
      map[item.dateKey].push(item);
    });
    return map;
  }, [normalizedGraphicOrders]);

  const days = getDaysInMonth(currentYear, currentMonth);
  const dateOrders = ordersByDate[selectedDate] || [];

  const sortedGraphicOrders = useMemo(
    () =>
      [...normalizedGraphicOrders].sort((a, b) =>
        String(a.date_start || "").localeCompare(String(b.date_start || "")),
      ),
    [normalizedGraphicOrders],
  );

  const fetchOrders = useCallback(async () => {
    try {
      const res = await apiFetch(`${API.baseURL}/services_executor`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setOrders(
        list.filter(
          (order) => order.status_service_executor === "Ожидают выполнения",
        ),
      );
    } catch (err) {
      console.error("Ошибка загрузки заказов:", err);
      showFlash("error", "Не удалось загрузить заказы");
    }
  }, [showFlash]);

  const fetchGraphicOrders = useCallback(async () => {
    try {
      const res = await apiFetch(
        `${API.baseURL}/graphic_orders_master/${userId}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setGraphicOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Ошибка загрузки графика:", err);
      showFlash("error", "Не удалось загрузить график заказов");
    }
  }, [userId, showFlash]);

  const refreshData = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([fetchOrders(), fetchGraphicOrders()]);
    } finally {
      setLoading(false);
    }
  }, [fetchOrders, fetchGraphicOrders]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const changeMonth = (diff) => {
    let newMonth = currentMonth + diff;
    let newYear = currentYear;
    if (newMonth < 0) {
      newMonth = 11;
      newYear -= 1;
    } else if (newMonth > 11) {
      newMonth = 0;
      newYear += 1;
    }
    setCurrentMonth(newMonth);
    setCurrentYear(newYear);
  };

  const goToToday = () => {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
    setSelectedDate(todayKey);
  };

  const handleDayClick = (day) => {
    setSelectedDate(formatLocalDate(day));
  };

  const addOrderDate = async (e) => {
    e.preventDefault();
    if (!newOrderId || !selectedDate) return;

    setLoading(true);
    try {
      const res = await apiFetch(
        `${API.baseURL}/add_date_start_execute_order/${userId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            order_id: Number(newOrderId),
            date_start: `${selectedDate}T12:00:00`,
          }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      setNewOrderId("");
      await refreshData();
      showFlash("success", "Заказ запланирован");
    } catch (err) {
      console.error("Ошибка добавления:", err);
      showFlash("error", "Не удалось добавить дату выполнения");
    } finally {
      setLoading(false);
    }
  };

  const confirmDeleteOrder = (id) => {
    setOrderToDelete(id);
    setShowDeleteConfirm(true);
  };

  const deleteOrderDate = async () => {
    if (!orderToDelete) return;
    setLoading(true);
    try {
      const res = await apiFetch(
        `${API.baseURL}/delete_date_start_execute_order/${userId}/${orderToDelete}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setShowDeleteConfirm(false);
      setOrderToDelete(null);
      await refreshData();
      showFlash("success", "Дата удалена");
    } catch (err) {
      console.error("Ошибка удаления:", err);
      showFlash("error", "Не удалось удалить дату");
    } finally {
      setLoading(false);
    }
  };

  if (loading && orders.length === 0 && graphicOrders.length === 0) {
    return (
      <div className="gos-page">
        <div className="gos-loading">
          <span className="gos-spinner" />
          Загружаем график…
        </div>
      </div>
    );
  }

  return (
    <div className="gos-page">
      <header className="gos-hero">
        <div className="gos-hero__text">
          <span className="gos-hero__badge">Личный кабинет</span>
          <h1 className="gos-hero__title">График выполнения заказов</h1>
          <p className="gos-hero__subtitle">
            Выберите день в календаре и назначьте заказ на эту дату
          </p>
        </div>
        <div className="gos-hero__stats">
          <div className="gos-stat">
            <span className="gos-stat__value">{orders.length}</span>
            <span className="gos-stat__label">ожидают</span>
          </div>
          <div className="gos-stat">
            <span className="gos-stat__value">
              {Object.keys(ordersByDate).length}
            </span>
            <span className="gos-stat__label">дат</span>
          </div>
          <div className="gos-stat">
            <span className="gos-stat__value">{graphicOrders.length}</span>
            <span className="gos-stat__label">запланировано</span>
          </div>
        </div>
      </header>

      {flash.text && (
        <div className={`gos-alert gos-alert--${flash.type}`} role="alert">
          <span>{flash.text}</span>
          {flash.type === "error" && (
            <button
              type="button"
              className="gos-btn gos-btn--ghost gos-btn--sm"
              onClick={refreshData}
            >
              <FaSyncAlt aria-hidden="true" />
              Обновить
            </button>
          )}
        </div>
      )}

      <div className="gos-layout">
        <section className="gos-card gos-card--calendar" aria-label="Календарь">
          <div className="gos-card__head">
            <h2 className="gos-card__title">Календарь</h2>
            <button
              type="button"
              className="gos-btn gos-btn--ghost gos-btn--sm"
              onClick={refreshData}
              disabled={loading}
              title="Обновить"
            >
              <FaSyncAlt aria-hidden="true" />
            </button>
          </div>
          <div className="gos-card__body">
            <div className="gos-cal">
              <div className="gos-cal__nav">
                <button
                  type="button"
                  className="gos-cal__arrow"
                  onClick={() => changeMonth(-1)}
                  aria-label="Предыдущий месяц"
                >
                  ‹
                </button>
                <div className="gos-cal__title-wrap">
                  <div className="gos-cal__title">
                    {new Date(currentYear, currentMonth).toLocaleString("ru-RU", {
                      month: "long",
                      year: "numeric",
                    })}
                  </div>
                  <button
                    type="button"
                    className="gos-cal__today"
                    onClick={goToToday}
                  >
                    Сегодня
                  </button>
                </div>
                <button
                  type="button"
                  className="gos-cal__arrow"
                  onClick={() => changeMonth(1)}
                  aria-label="Следующий месяц"
                >
                  ›
                </button>
              </div>

              <div className="gos-cal__weekdays">
                {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d, index) => (
                  <div
                    key={d}
                    className={`gos-cal__weekday ${index >= 5 ? "gos-cal__weekday--weekend" : ""}`}
                  >
                    {d}
                  </div>
                ))}
              </div>

              <div className="gos-cal__grid">
                {Array((days[0].getDay() + 6) % 7)
                  .fill(null)
                  .map((_, i) => (
                    <span
                      key={`empty-${i}`}
                      className="gos-cal__cell gos-cal__cell--empty"
                      aria-hidden="true"
                    />
                  ))}
                {days.map((day) => {
                  const dateKey = formatLocalDate(day);
                  const isSelected = dateKey === selectedDate;
                  const isToday = dateKey === todayKey;
                  const dayOrders = ordersByDate[dateKey] || [];
                  const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                  return (
                    <button
                      key={dateKey}
                      type="button"
                      onClick={() => handleDayClick(day)}
                      className={[
                        "gos-cal__cell",
                        isSelected ? "gos-cal__cell--selected" : "",
                        isToday ? "gos-cal__cell--today" : "",
                        dayOrders.length > 0 ? "gos-cal__cell--has-work" : "",
                        isWeekend ? "gos-cal__cell--weekend" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      aria-label={`${day.getDate()}${dayOrders.length ? `, заказов: ${dayOrders.length}` : ""}`}
                      aria-pressed={isSelected}
                    >
                      <span className="gos-cal__day-num">{day.getDate()}</span>
                      {dayOrders.length > 0 && (
                        <span className="gos-cal__badge" aria-hidden="true">
                          {dayOrders.length}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="gos-cal__legend">
                <span className="gos-cal__legend-item">
                  <span className="gos-cal__legend-dot gos-cal__legend-dot--today" />
                  Сегодня
                </span>
                <span className="gos-cal__legend-item">
                  <span className="gos-cal__legend-dot gos-cal__legend-dot--work" />
                  Есть заказы
                </span>
              </div>
            </div>
          </div>
        </section>

        <div className="gos-layout__side">
          <section className="gos-card" aria-label="Запланировать заказ">
            <div className="gos-card__head">
              <h2 className="gos-card__title">Запланировать</h2>
            </div>
            <div className="gos-card__body">
              <form className="gos-form" onSubmit={addOrderDate}>
                <label className="gos-label">
                  Заказ
                  <select
                    className="gos-select"
                    value={newOrderId}
                    onChange={(e) => setNewOrderId(e.target.value)}
                    disabled={loading}
                  >
                    <option value="">Выберите заказ</option>
                    {orders.map((order) => (
                      <option key={order.id} value={order.id}>
                        #{order.id} — {order.title}
                        {order.budget ? ` (${order.budget} BYN)` : ""}
                      </option>
                    ))}
                  </select>
                </label>

                <p className="gos-form__hint">
                  Дата берётся из выбранного дня в календаре слева.
                </p>

                <button
                  type="submit"
                  className="gos-btn gos-btn--primary"
                  disabled={!newOrderId || !selectedDate || loading}
                >
                  <FaCalendarAlt aria-hidden="true" />
                  {loading ? "Сохранение…" : "Запланировать на выбранный день"}
                </button>
              </form>
            </div>
          </section>

          <section className="gos-card" aria-label="Заказы на выбранный день">
            <div className="gos-card__head">
              <h2 className="gos-card__title">На выбранный день</h2>
              <span className="gos-card__count">{dateOrders.length}</span>
            </div>
            <div className="gos-card__body">
              {dateOrders.length === 0 ? (
                <div className="gos-empty">
                  <p className="gos-empty__text">
                    На выбранный день заказов нет. Выберите другой день или
                    запланируйте заказ выше.
                  </p>
                </div>
              ) : (
                <div className="gos-list">
                  {dateOrders.map((item) => (
                    <OrderRow
                      key={item.id}
                      item={item}
                      onDelete={() => confirmDeleteOrder(item.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="gos-card" aria-label="Ожидают выполнения">
            <div className="gos-card__head">
              <h2 className="gos-card__title">Ожидают выполнения</h2>
              <span className="gos-card__count">{orders.length}</span>
            </div>
            <div className="gos-card__body">
              {orders.length === 0 ? (
                <div className="gos-empty">
                  <p className="gos-empty__text">
                    Все заказы запланированы или уже в работе
                  </p>
                </div>
              ) : (
                orders.map((order) => (
                  <div key={order.id} className="gos-await-item">
                    <div className="gos-await-item__title">
                      #{order.id} — {order.title}
                    </div>
                    {order.budget != null && (
                      <div className="gos-await-item__budget">
                        Бюджет: {order.budget} BYN
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="gos-card" aria-label="Весь график">
            <div className="gos-card__head">
              <h2 className="gos-card__title">Весь график</h2>
              <span className="gos-card__count">{sortedGraphicOrders.length}</span>
            </div>
            <div className="gos-card__body">
              {sortedGraphicOrders.length === 0 ? (
                <div className="gos-empty">
                  <span className="gos-empty__icon" aria-hidden="true">
                    <FaCalendarAlt />
                  </span>
                  <p className="gos-empty__text">График пока пуст</p>
                </div>
              ) : (
                <div className="gos-list">
                  {sortedGraphicOrders.map((item) => (
                    <OrderRow
                      key={item.id}
                      item={item}
                      onDelete={() => confirmDeleteOrder(item.id)}
                      onSelectDate={() => {
                        if (!item.dateKey) return;
                        setSelectedDate(item.dateKey);
                        const [year, month] = item.dateKey.split("-").map(Number);
                        setCurrentYear(year);
                        setCurrentMonth(month - 1);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {showDeleteConfirm && (
        <div
          className="gos-modal-overlay"
          onClick={() => !loading && setShowDeleteConfirm(false)}
          role="presentation"
        >
          <div
            className="gos-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="gos-delete-title"
          >
            <div className="gos-modal__icon" aria-hidden="true">
              <FaTrashAlt />
            </div>
            <h3 className="gos-modal__title" id="gos-delete-title">
              Удалить дату начала?
            </h3>
            <p className="gos-modal__text">
              Заказ останется в списке ожидающих выполнения. Это действие нельзя
              отменить.
            </p>
            <div className="gos-modal__actions">
              <button
                type="button"
                className="gos-btn gos-btn--danger"
                onClick={deleteOrderDate}
                disabled={loading}
              >
                {loading ? "Удаление…" : "Удалить"}
              </button>
              <button
                type="button"
                className="gos-btn gos-btn--ghost"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setOrderToDelete(null);
                }}
                disabled={loading}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OrderRow({ item, onDelete, onSelectDate }) {
  const timeLabel = item.date_start
    ? new Date(item.date_start).toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  return (
    <div className="gos-order">
      <button
        type="button"
        className="gos-order__body gos-order__body--clickable"
        onClick={onSelectDate}
        disabled={!onSelectDate}
      >
        <h3 className="gos-order__title">
          {item.name_order || "Без названия"}
        </h3>
        <div className="gos-order__meta">
          <span className="gos-order__meta-item">
            <FaClock aria-hidden="true" />
            {timeLabel}
          </span>
          {item.address && (
            <span className="gos-order__meta-item">
              <FaMapMarkerAlt aria-hidden="true" />
              {item.address}
            </span>
          )}
        </div>
      </button>
      <div className="gos-order__actions">
        <button
          type="button"
          className="gos-btn gos-btn--danger gos-btn--sm"
          onClick={onDelete}
          title="Удалить дату"
        >
          <FaTrashAlt aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
