import React from "react";
import "../Services/services.css";

const TAB_ICONS = {
  completed: "✓",
  inProgress: "◷",
  awaiting: "⏱",
  considerationCustomer: "◎",
  offersCustomers: "✉",
  myselfExecutor: "⚙",
  graphicOrders: "▦",
  researchExecutor: "⌕",
  waitOfferExecutors: "✎",
  all: "☰",
};

const TAB_VARIANTS = {
  completed: "success",
  inProgress: "warning",
  awaiting: "info",
  considerationCustomer: "purple",
  offersCustomers: "indigo",
  myselfExecutor: "slate",
  graphicOrders: "teal",
  researchExecutor: "info",
  waitOfferExecutors: "muted",
  all: "primary",
};

export default function StatusFilterTabs({
  tabs,
  activeId,
  onChange,
  allTab,
  getCount,
  getUpdatesCount,
}) {
  const renderItem = (id, label, count, _updatesCount, variant, iconKey) => {
    const isActive = activeId === id;

    return (
      <button
        key={id}
        type="button"
        className={`status-filter__item status-filter__item--${variant} ${
          isActive ? "status-filter__item--active" : ""
        }`.trim()}
        onClick={() => onChange(id)}
        aria-pressed={isActive}
      >
        <span className="status-filter__icon" aria-hidden="true">
          {TAB_ICONS[iconKey] || "•"}
        </span>
        <span className="status-filter__text">
          <span className="status-filter__label">{label}</span>
          <span className="status-filter__hint">
            {count === 0 ? "Нет записей" : `${count} шт.`}
          </span>
        </span>
      </button>
    );
  };

  return (
    <aside className="status-filter" aria-label="Фильтр по статусу">
      <p className="status-filter__heading">Статус</p>
      <div className="status-filter__list">
        {allTab &&
          renderItem(
            allTab.id,
            allTab.label,
            allTab.count,
            allTab.updatesCount || 0,
            TAB_VARIANTS.all,
            "all",
          )}
        {tabs.map((tab) =>
          renderItem(
            tab.id,
            tab.shortLabel || tab.label,
            getCount(tab.statusKey),
            getUpdatesCount?.(tab.statusKey) || 0,
            TAB_VARIANTS[tab.id] || "muted",
            tab.id,
          ),
        )}
      </div>
    </aside>
  );
}
