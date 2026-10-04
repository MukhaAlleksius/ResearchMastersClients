import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  NOTIFICATION_POLL_MS,
  NOTIFICATIONS_CHANGED_EVENT,
  fetchNotifications,
  markNotificationRead,
} from "../../utils/notifications.js";
import { buildNotificationNavigateTarget } from "../../utils/notificationNavigation.js";

const BANNER_TYPES = ["user_warning", "work_starts_tomorrow"];

export default function WarningBanner() {
  const [warnings, setWarnings] = useState([]);
  const [submittingId, setSubmittingId] = useState(null);
  const navigate = useNavigate();
  const userId = parseInt(localStorage.getItem("user_id"), 10) || null;

  const loadWarning = useCallback(async () => {
    if (!userId) {
      setWarnings([]);
      return;
    }
    try {
      const data = await fetchNotifications(userId, { unreadOnly: true });
      const items = (data.items || [])
        .filter((notification) =>
          BANNER_TYPES.includes(notification.notification_type),
        )
        .sort(
          (left, right) =>
            BANNER_TYPES.indexOf(left.notification_type) -
            BANNER_TYPES.indexOf(right.notification_type),
        );
      setWarnings(items);
    } catch (error) {
      console.error("Не удалось загрузить предупреждение:", error);
    }
  }, [userId]);

  useEffect(() => {
    loadWarning();
    const timerId = setInterval(loadWarning, NOTIFICATION_POLL_MS);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, loadWarning);
    return () => {
      clearInterval(timerId);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, loadWarning);
    };
  }, [loadWarning]);

  const dismissWarning = async (warning, { openOrder = false } = {}) => {
    if (!userId || !warning || submittingId) return;
    setSubmittingId(warning.id);
    try {
      await markNotificationRead(userId, warning.id);
      setWarnings((current) =>
        current.filter((item) => item.id !== warning.id),
      );
      if (openOrder && warning.action_path) {
        const target = buildNotificationNavigateTarget(
          warning.action_path,
          warning.notification_type,
        );
        if (typeof target === "string") {
          navigate(target);
        } else if (target) {
          navigate(
            { pathname: target.pathname, search: target.search || "" },
            { state: target.state },
          );
        }
      }
    } catch (error) {
      console.error("Не удалось подтвердить предупреждение:", error);
    } finally {
      setSubmittingId(null);
    }
  };

  if (!warnings.length) return null;

  return (
    <div className="warning-banner" role="status">
      {warnings.map((warning) => {
        const submitting = submittingId === warning.id;
        const canOpenOrder =
          warning.notification_type === "work_starts_tomorrow" &&
          Boolean(warning.action_path);
        return (
          <div className="warning-banner__inner" key={warning.id}>
            <div className="warning-banner__text">
              <p className="warning-banner__title">{warning.title}</p>
              <p className="warning-banner__message">{warning.message}</p>
            </div>
            <div className="warning-banner__actions">
              {canOpenOrder && (
                <button
                  type="button"
                  className="warning-banner__btn warning-banner__btn--ghost"
                  disabled={Boolean(submittingId)}
                  onClick={() => dismissWarning(warning, { openOrder: true })}
                >
                  Открыть заказ
                </button>
              )}
              <button
                type="button"
                className="warning-banner__btn"
                disabled={Boolean(submittingId)}
                onClick={() => dismissWarning(warning)}
              >
                {submitting ? "…" : "Понял"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
