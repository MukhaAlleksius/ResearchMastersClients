import React from "react";
import { Navigate } from "react-router-dom";
import { useStaffAccess } from "../../../utils/userAccess.js";

/** Страница /admin только для ролей admin и moderator. Роль берётся с сервера. */
export default function AdminStaffGuard({ children }) {
  const isLoggedIn = Boolean(localStorage.getItem("access_token"));
  const { isStaff, loading } = useStaffAccess();

  if (!isLoggedIn) {
    return <Navigate to="/home" replace />;
  }

  if (loading) {
    return null;
  }

  if (!isStaff) {
    return <Navigate to="/home" replace />;
  }

  return children;
}
