import { useCallback, useEffect, useRef, useState } from "react";
import {
  DETAIL_ACTIVITY_POLL_MS,
  fetchOrderActivity,
  getRoleFromPreset,
  syncSeenCancelAck,
} from "../../../../utils/orderActivity.js";

function activityEquals(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function useLiveOrderActivity({
  orderId,
  userId,
  presetKey,
  role: roleProp,
  initialActivity,
  enabled = true,
  pollIntervalMs = DETAIL_ACTIVITY_POLL_MS,
  onActivityChange,
}) {
  const role = roleProp || getRoleFromPreset(presetKey);
  const [activity, setActivity] = useState(initialActivity ?? null);
  const onActivityChangeRef = useRef(onActivityChange);
  onActivityChangeRef.current = onActivityChange;

  useEffect(() => {
    setActivity(initialActivity ?? null);
  }, [orderId, initialActivity]);

  const refreshActivity = useCallback(async () => {
    if (!orderId || !userId || !role) return null;

    const fresh = await fetchOrderActivity(orderId, userId, role);
    const ackChanged = syncSeenCancelAck(userId, orderId, fresh);

    setActivity((prev) => {
      if (activityEquals(prev, fresh)) {
        if (ackChanged) onActivityChangeRef.current?.(fresh);
        return prev;
      }
      onActivityChangeRef.current?.(fresh);
      return fresh;
    });

    return fresh;
  }, [orderId, userId, role]);

  useEffect(() => {
    if (!enabled || !orderId || !userId || !role) return undefined;

    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        await refreshActivity();
      } catch {
        // keep last known activity on transient errors
      }
    };

    poll();
    const timerId = setInterval(poll, pollIntervalMs);

    return () => {
      cancelled = true;
      clearInterval(timerId);
    };
  }, [enabled, orderId, userId, role, pollIntervalMs, refreshActivity]);

  return { activity, refreshActivity, role };
}
