import React from "react";
import "./work-detail-layout.css";
import { WorkDetailTabIcon } from "../ProfileIcons.jsx";

/**
 * Общая оболочка страницы заказа/услуги:
 * кнопка «Назад», заголовок, вкладки и children (контент активной вкладки).
 *
 * В родительском файле: onBack от Orders/Services, OrderInfo с embedded.
 *   {activeTab === "orderInfo" && <OrderInfo order={order} embedded />}
 */

export function getWorkDetailTabIcon(tabId) {
  return <WorkDetailTabIcon id={tabId} />;
}

export default function WorkDetailLayout({
  title,
  subtitle,
  meta,
  backLabel = "Назад",
  onBack,
  headerExtra,
  notice,
  tabs = [],
  activeTab,
  onTabChange,
  loading = false,
  loadingText = "Загрузка...",
  error,
  onDismissError,
  narrow = false,
  showPanelHead = true,
  rootClassName = "",
  children,
}) {
  const activeTabMeta = tabs.find((t) => t.id === activeTab);

  if (loading) {
    return (
      <div className="work-detail work-detail--loading">
        <div className="work-detail__spinner" aria-hidden="true" />
        <p>{loadingText}</p>
      </div>
    );
  }

  const showContent = !error;

  return (
    <div
      className={`work-detail ${narrow ? "work-detail--narrow" : ""} ${rootClassName}`.trim()}
    >
      <div className="work-detail__top">
        <div className="work-detail__top-left">
          {onBack && (
            <button
              type="button"
              className="work-detail__back"
              onClick={onBack}
            >
              ← {backLabel}
            </button>
          )}
          <h1 className="work-detail__title">{title}</h1>
          {subtitle && <p className="work-detail__subtitle">{subtitle}</p>}
        </div>
        {headerExtra && (
          <div className="work-detail__header-extra">{headerExtra}</div>
        )}
      </div>

      {meta && <div className="work-detail__meta">{meta}</div>}

      {notice && (
        <div
          className={`work-detail__notice work-detail__notice--${notice.variant || "info"}`}
          role="status"
        >
          <div className="work-detail__notice-content">
            {notice.title && (
              <p className="work-detail__notice-title">{notice.title}</p>
            )}
            <p className="work-detail__notice-text">{notice.text}</p>
          </div>
          {notice.actionLabel && notice.onAction && (
            <button
              type="button"
              className="work-detail__notice-action"
              onClick={notice.onAction}
            >
              {notice.actionLabel}
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="work-detail__alert" role="alert">
          <span>{error}</span>
          {onDismissError && (
            <button
              type="button"
              className="work-detail__alert-dismiss"
              onClick={onDismissError}
              aria-label="Закрыть"
            >
              ×
            </button>
          )}
        </div>
      )}

      <div className="work-detail__main">
        {tabs.length > 0 && (
          <nav className="work-detail__tabs" aria-label="Разделы работы">
            <div className="work-detail__tabs-scroll">
              {tabs.map((tab, index) => {
                const isActive = activeTab === tab.id;
                const prevTab = tabs[index - 1];
                const showGroupDivider =
                  index > 0 &&
                  tab.group &&
                  prevTab?.group &&
                  tab.group !== prevTab.group;

                return (
                  <React.Fragment key={tab.id}>
                    {showGroupDivider && (
                      <span
                        className="work-detail__tab-divider"
                        aria-hidden="true"
                      />
                    )}
                    <button
                      type="button"
                      className={`work-detail__tab ${isActive ? "work-detail__tab--active" : ""}`}
                      onClick={() => onTabChange(tab.id)}
                      aria-current={isActive ? "page" : undefined}
                      title={tab.label}
                    >
                      <span className="work-detail__tab-icon" aria-hidden="true">
                        {tab.icon || getWorkDetailTabIcon(tab.id)}
                      </span>
                      <span className="work-detail__tab-label">
                        {tab.shortLabel || tab.label}
                      </span>
                      {tab.badge && (
                        <span className="work-detail__tab-badge">{tab.badge}</span>
                      )}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          </nav>
        )}

        {tabs.length > 0 && showPanelHead && (
          <div className="work-detail__panel-head">
            <h2 className="work-detail__panel-title">
              {activeTabMeta?.label || "Раздел"}
            </h2>
            {activeTabMeta?.description && (
              <p className="work-detail__panel-desc">
                {activeTabMeta.description}
              </p>
            )}
          </div>
        )}

        <div className="work-detail__panel-body">
          {showContent ? children : null}
        </div>
      </div>
    </div>
  );
}
