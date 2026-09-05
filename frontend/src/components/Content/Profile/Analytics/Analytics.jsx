import React, { useEffect, useRef, useState } from "react";
import { API, apiFetch } from "../../../../utils/api.js";
import "./analytics.css";
const PERIOD_PRESETS = [
  { id: "7d", label: "7 дней", days: 7 },
  { id: "30d", label: "30 дней", days: 30 },
  { id: "90d", label: "90 дней", days: 90 },
];

function formatDateInput(date) {
  return date.toISOString().slice(0, 10);
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M4 20V10M10 20V4M16 20v-6M22 20H2" strokeLinecap="round" />
    </svg>
  );
}

function OrdersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" />
    </svg>
  );
}

function ServicesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MoneyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" strokeLinejoin="round" />
    </svg>
  );
}

function CancelIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9l-6 6M9 9l6 6" strokeLinecap="round" />
    </svg>
  );
}

function formatMoney(value, currency = "") {
  const amount = Number(value ?? 0);
  const formatted = amount.toLocaleString("ru-RU", {
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  });
  return currency ? `${formatted} ${currency}` : formatted;
}

function RatingStars({ rating }) {
  const full = Math.min(5, Math.max(0, Math.round(rating)));
  return (
    <span className="an-rating__stars" aria-hidden="true">
      {"★".repeat(full)}
      {"☆".repeat(5 - full)}
    </span>
  );
}

function StatusBreakdown({ totalCount, emptyText, ariaLabel, segments }) {
  const total = Math.max(totalCount ?? 0, 1);

  if ((totalCount ?? 0) === 0) {
    return <p className="an-empty">{emptyText}</p>;
  }

  return (
    <div className="an-breakdown">
      <div className="an-breakdown__bar" role="img" aria-label={ariaLabel}>
        {segments.map((item) =>
          item.value > 0 ? (
            <div
              key={item.key}
              className={`an-breakdown__segment ${item.className}`}
              style={{ width: `${(item.value / total) * 100}%` }}
            />
          ) : null,
        )}
      </div>
      <div className="an-breakdown__legend">
        {segments.map((item) => (
          <div key={item.key} className="an-breakdown__row">
            <span className="an-breakdown__row-label">
              <span className="an-breakdown__dot" style={{ background: item.dot }} />
              {item.label}
            </span>
            <span className="an-breakdown__row-value">
              {item.value}
              <span style={{ color: "var(--an-muted)", fontWeight: 500 }}>
                {" "}
                ({Math.round((item.value / total) * 100)}%)
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AnalyticsDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const initialLoadDone = useRef(false);
  const [activePreset, setActivePreset] = useState("30d");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return formatDateInput(d);
  });
  const [endDate, setEndDate] = useState(() => formatDateInput(new Date()));

  const userId = localStorage.getItem("user_id");

  const applyPreset = (preset) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - preset.days);
    setActivePreset(preset.id);
    setStartDate(formatDateInput(start));
    setEndDate(formatDateInput(end));
  };

  useEffect(() => {
    const fetchAnalytics = async () => {
      if (!userId) {
        setError("Не найден user_id");
        setLoading(false);
        return;
      }

      try {
        if (!initialLoadDone.current) {
          setLoading(true);
        } else {
          setRefreshing(true);
        }
        setError("");

        const res = await apiFetch(
          `${API.baseURL}/analytics/summary?start_date=${startDate}&end_date=${endDate}`,
        );

        if (!res.ok) {
          throw new Error("Не удалось загрузить аналитику");
        }

        const json = await res.json();
        setData(json);
        initialLoadDone.current = true;
      } catch (e) {
        setError(e.message || "Ошибка загрузки");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    };

    fetchAnalytics();
  }, [userId, startDate, endDate]);

  const currency = data?.money?.currency || "BYN";

  const kpiCards = [
    {
      key: "orders",
      label: "Заказы",
      value: data?.orders?.total_orders ?? 0,
      hint: `Выполнено ${data?.orders?.completed_orders ?? 0} · в работе ${data?.orders?.in_progress_orders ?? 0}`,
      icon: OrdersIcon,
      iconClass: "an-kpi__icon--blue",
    },
    {
      key: "services",
      label: "Услуги",
      value: data?.services?.total_services ?? 0,
      hint: `Выполнено ${data?.services?.completed_services ?? 0} · в работе ${data?.services?.in_progress_services ?? 0}`,
      icon: ServicesIcon,
      iconClass: "an-kpi__icon--violet",
    },
    {
      key: "money",
      label: "Прибыль",
      value: formatMoney(data?.money?.total_amount, currency),
      hint: `Среднее с заказа ${formatMoney(data?.money?.average_amount, currency)}`,
      icon: MoneyIcon,
      iconClass: "an-kpi__icon--green",
    },
    {
      key: "rating",
      label: "Рейтинг",
      value: Number(data?.ratings?.average_rating ?? 0).toFixed(1),
      hint: `${data?.ratings?.reviews_count ?? 0} отзывов`,
      icon: StarIcon,
      iconClass: "an-kpi__icon--amber",
      extra: <RatingStars rating={Number(data?.ratings?.average_rating ?? 0)} />,
    },
    {
      key: "cancellations",
      label: "Отмены",
      value: data?.cancellations?.total_cancellations ?? 0,
      hint: `Заказчик ${data?.cancellations?.customer_cancellations ?? 0} · исполнитель ${data?.cancellations?.executor_cancellations ?? 0}`,
      icon: CancelIcon,
      iconClass: "an-kpi__icon--rose",
    },
  ];

  return (
    <div className="an-page">
      <header className="an-header">
        <div className="an-header__main">
          <div className="an-header__icon">
            <ChartIcon />
          </div>
          <div>
            <h1 className="an-header__title">Аналитика</h1>
            <p className="an-header__subtitle">
              Заказы, услуги, прибыль от выполненных работ, рейтинг и отмены за период
            </p>
          </div>
        </div>

        <div className="an-filters">
          <div className="an-periods">
            {PERIOD_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`an-period-btn ${activePreset === preset.id ? "an-period-btn--active" : ""}`}
                onClick={() => applyPreset(preset)}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="an-dates">
            <label className="an-field">
              <span className="an-label">С</span>
              <input
                type="date"
                className="an-input"
                value={startDate}
                onChange={(e) => {
                  setActivePreset("");
                  setStartDate(e.target.value);
                }}
              />
            </label>
            <label className="an-field">
              <span className="an-label">По</span>
              <input
                type="date"
                className="an-input"
                value={endDate}
                onChange={(e) => {
                  setActivePreset("");
                  setEndDate(e.target.value);
                }}
              />
            </label>
          </div>
        </div>
      </header>

      {loading && !data ? (
        <div className="an-loading">
          <span className="an-loading__spinner" aria-hidden="true" />
          Загрузка аналитики…
        </div>
      ) : error && !data ? (
        <div className="an-error" role="alert">
          {error}
        </div>
      ) : (
        <div
          className={`an-content ${refreshing ? "an-content--refreshing" : ""}`}
          aria-busy={refreshing}
        >
          {error && (
            <div className="an-error an-error--inline" role="alert">
              {error}
            </div>
          )}

          <div className="an-kpi-grid">
            {kpiCards.map((card) => {
              const Icon = card.icon;
              return (
                <article key={card.key} className="an-kpi">
                  <div className={`an-kpi__icon ${card.iconClass}`}>
                    <Icon />
                  </div>
                  <div className="an-kpi__body">
                    <p className="an-kpi__label">{card.label}</p>
                    <p className="an-kpi__value">{card.value}</p>
                    {card.extra}
                    <p className="an-kpi__hint">{card.hint}</p>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="an-panels">
            <section className="an-panel">
              <h2 className="an-panel__title">Распределение заказов</h2>
              <StatusBreakdown
                totalCount={data?.orders?.total_orders}
                emptyText="За выбранный период заказов нет"
                ariaLabel="Распределение заказов по статусам"
                segments={[
                  {
                    key: "completed",
                    label: "Выполнено",
                    value: data?.orders?.completed_orders ?? 0,
                    className: "an-breakdown__segment--success",
                    dot: "var(--an-success)",
                  },
                  {
                    key: "progress",
                    label: "В работе",
                    value: data?.orders?.in_progress_orders ?? 0,
                    className: "an-breakdown__segment--primary",
                    dot: "var(--an-primary)",
                  },
                  {
                    key: "cancelled",
                    label: "Отменено",
                    value: data?.orders?.cancelled_orders ?? 0,
                    className: "an-breakdown__segment--danger",
                    dot: "var(--an-danger)",
                  },
                ]}
              />
            </section>

            <section className="an-panel">
              <h2 className="an-panel__title">Распределение услуг</h2>
              <StatusBreakdown
                totalCount={data?.services?.total_services}
                emptyText="За выбранный период услуг нет"
                ariaLabel="Распределение услуг по статусам"
                segments={[
                  {
                    key: "completed",
                    label: "Выполнено",
                    value: data?.services?.completed_services ?? 0,
                    className: "an-breakdown__segment--success",
                    dot: "var(--an-success)",
                  },
                  {
                    key: "progress",
                    label: "В работе",
                    value: data?.services?.in_progress_services ?? 0,
                    className: "an-breakdown__segment--primary",
                    dot: "var(--an-primary)",
                  },
                  {
                    key: "awaiting",
                    label: "Ожидают",
                    value: data?.services?.awaiting_services ?? 0,
                    className: "an-breakdown__segment--violet",
                    dot: "var(--an-violet)",
                  },
                  {
                    key: "refused",
                    label: "Отказы",
                    value: data?.services?.refused_services ?? 0,
                    className: "an-breakdown__segment--danger",
                    dot: "var(--an-danger)",
                  },
                ]}
              />
            </section>

            <section className="an-panel">
              <h2 className="an-panel__title">Финансовые показатели</h2>
              {(data?.money?.total_amount ?? 0) > 0 ? (
                <ul className="an-stat-list">
                  <li className="an-stat-list__item">
                    <span className="an-stat-list__label">Прибыль от работ</span>
                    <span className="an-stat-list__value">
                      {formatMoney(data?.money?.total_amount, currency)}
                    </span>
                  </li>
                  <li className="an-stat-list__item">
                    <span className="an-stat-list__label">Среднее с заказа</span>
                    <span className="an-stat-list__value">
                      {formatMoney(data?.money?.average_amount, currency)}
                    </span>
                  </li>
                  <li className="an-stat-list__item">
                    <span className="an-stat-list__label">Минимум</span>
                    <span className="an-stat-list__value">
                      {formatMoney(data?.money?.min_amount, currency)}
                    </span>
                  </li>
                  <li className="an-stat-list__item">
                    <span className="an-stat-list__label">Максимум</span>
                    <span className="an-stat-list__value">
                      {formatMoney(data?.money?.max_amount, currency)}
                    </span>
                  </li>
                </ul>
              ) : (
                <p className="an-empty">Нет прибыли от выполненных работ за период</p>
              )}
            </section>

            {data?.popular_categories?.length > 0 && (
              <section className="an-panel">
                <h2 className="an-panel__title">Популярные услуги</h2>
                <ul className="an-stat-list">
                  {data.popular_categories.map((item) => (
                    <li key={item.category_id} className="an-stat-list__item">
                      <span className="an-stat-list__label">
                        {item.category_name || `Категория ${item.category_id}`}
                      </span>
                      <span className="an-stat-list__value">{item.orders_count}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {data?.monthly_stats?.length > 0 && (
              <section className="an-panel">
                <h2 className="an-panel__title">По месяцам</h2>
                <ul className="an-stat-list">
                  {data.monthly_stats.map((item) => (
                    <li key={item.month} className="an-stat-list__item">
                      <span className="an-stat-list__label">{item.month} месяц</span>
                      <span className="an-stat-list__value">
                        {item.orders_count} заказов · {formatMoney(item.total_amount, currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
