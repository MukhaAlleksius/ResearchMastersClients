import { useEffect, useState } from "react";
import { API, apiFetch } from "./api.js";

export const STAFF_ROLES = new Set(["admin", "moderator"]);

export function isStaffRole(role) {
  return STAFF_ROLES.has(String(role || "").toLowerCase());
}

export function getStoredUserRole() {
  return localStorage.getItem("user_role");
}

export function setStoredUserRole(role) {
  if (role) {
    localStorage.setItem("user_role", role);
  } else {
    localStorage.removeItem("user_role");
  }
}

export async function fetchCurrentUserAccess() {
  const response = await apiFetch(`${API.baseURL}/users/me`);
  if (!response.ok) {
    return null;
  }
  const data = await response.json();
  if (data?.role) {
    setStoredUserRole(data.role);
  }
  return data;
}

export function useStaffAccess() {
  const [isStaff, setIsStaff] = useState(() =>
    isStaffRole(getStoredUserRole()),
  );
  const [loading, setLoading] = useState(
    () => Boolean(localStorage.getItem("access_token")) && !getStoredUserRole(),
  );

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      setIsStaff(false);
      setLoading(false);
      return;
    }

    const cachedRole = getStoredUserRole();
    if (cachedRole) {
      setIsStaff(isStaffRole(cachedRole));
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchCurrentUserAccess()
      .then((data) => {
        if (cancelled) return;
        setIsStaff(isStaffRole(data?.role));
      })
      .catch(() => {
        if (!cancelled) setIsStaff(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { isStaff, loading };
}
