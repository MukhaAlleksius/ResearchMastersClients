import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  NOTIFICATION_POLL_MS,
  acknowledgeNotification,
  fetchNotifications,
  formatNotificationDate,
} from "../../utils/notifications.js";
import { buildNotificationNavigateTarget } from "../../utils/notificationNavigation.js";
import "./notifications.css";

function NotificationItem({ item, userId, onUpdated, onClose }) {
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const isDeletedOrder = item.notification_type === "order_deleted_by_customer";

  const runAcknowledge = async (reaction, target) => {
    if (!userId || submitting) return;
    setSubmitting(true);
    try {
      await acknowledgeNotification(userId, item.id, reaction);
      onUpdated();
      if (target) {
        if (typeof target === "string") {
          navigate(target);
        } else {
          navigate(
            { pathname: target.pathname, search: target.search || "" },
            { state: target.state },
          );
        }
      }
    } catch (error) {
      console.error("Ошибка реакции на уведомление:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenOrder = () => {
    if (!item.action_path) return;
    onClose?.();
    runAcknowledge("open_order", buildNotificationNavigateTarget(
      item.action_path,
      item.notification_type,
    ));
  };

  return (
    <article
      className={`notif-item ${item.is_read ? "" : "notif-item--unread"} ${
        isDeletedOrder || item.action_path ? "notif-item--action" : ""
      }`}
    >
      <div className="notif-item__head">
        <h4 className="notif-item__title">{item.title}</h4>
        <time className="notif-item__time" dateTime={item.created_at}>
          {formatNotificationDate(item.created_at)}
        </time>
      </div>

      <p className="notif-item__message">{item.message}</p>

      {item.order_title && (
        <p className="notif-item__meta">
          Заказ: <strong>{item.order_title}</strong>
          {item.order_id ? ` (№ ${item.order_id})` : ""}
        </p>
      )}

      {isDeletedOrder && (
        <p className="notif-item__hint">
          Заказ больше недоступен в системе — данные сохранены только в этом
          уведомлении.
        </p>
      )}

      {isDeletedOrder ? (
        <div className="notif-item__actions">
          <button
            type="button"
            className="notif-item__btn notif-item__btn--primary"
            disabled={submitting}
            onClick={() => runAcknowledge("understood")}
          >
            Понял
          </button>
          <button
            type="button"
            className="notif-item__btn notif-item__btn--secondary"
            disabled={submitting}
            onClick={() => runAcknowledge("find_other_orders", "/orders")}
          >
            Искать другие заказы
          </button>
        </div>
      ) : item.action_path ? (
        <div className="notif-item__actions">
          <button
            type="button"
            className="notif-item__btn notif-item__btn--primary"
            disabled={submitting}
            onClick={handleOpenOrder}
          >
            Перейти
          </button>
        </div>
      ) : null}
    </article>
  );
}

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const panelRef = useRef(null);

  const userId = parseInt(localStorage.getItem("user_id"), 10) || null;

  const loadNotifications = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await fetchNotifications(userId);
      setItems(data.items || []);
      setUnreadCount(data.unread_count || 0);
      setError(null);
    } catch (err) {
      console.error("Ошибка загрузки уведомлений:", err);
      if (open) setError(err?.message || "Не удалось загрузить уведомления");
    }
  }, [userId, open]);

  useEffect(() => {
    loadNotifications();
    const timerId = setInterval(loadNotifications, NOTIFICATION_POLL_MS);
    return () => clearInterval(timerId);
  }, [loadNotifications]);

  useEffect(() => {
    if (!open) return undefined;

    const handleClickOutside = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleToggle = () => {
    setOpen((value) => !value);
    if (!open) {
      setLoading(true);
      loadNotifications().finally(() => setLoading(false));
    }
  };

  if (!userId) return null;

  return (
    <div className="notif-bell" ref={panelRef}>
      <button
        type="button"
        className="notif-bell__trigger"
        onClick={handleToggle}
        aria-expanded={open}
        aria-label={
          unreadCount > 0
            ? `Уведомления: ${unreadCount} непрочитанных`
            : "Уведомления"
        }
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          aria-hidden="true"
        >
          <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5" />
          <path d="M9.5 17a2.5 2.5 0 0 0 5 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="notif-bell__badge" aria-hidden="true">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="notif-bell__panel" role="dialog" aria-label="Уведомления">
          <div className="notif-bell__panel-head">
            <h3 className="notif-bell__panel-title">Уведомления</h3>
            {unreadCount > 0 && (
              <span className="notif-bell__panel-count">{unreadCount} новых</span>
            )}
          </div>

          <div className="notif-bell__panel-body">
            {loading && <p className="notif-bell__empty">Загрузка…</p>}
            {!loading && error && <p className="notif-bell__error">{error}</p>}
            {!loading && !error && items.length === 0 && (
              <p className="notif-bell__empty">Нет уведомлений</p>
            )}
            {!loading &&
              !error &&
              items.map((item) => (
                <NotificationItem
                  key={item.id}
                  item={item}
                  userId={userId}
                  onUpdated={loadNotifications}
                  onClose={() => setOpen(false)}
                />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
