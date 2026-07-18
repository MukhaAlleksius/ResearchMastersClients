import React from "react";
import { Navigate } from "react-router-dom";
import { useStaffAccess } from "../../../utils/userAccess.js";

export default function AdminStaffGuard({ children }) {
  const { isStaff, loading } = useStaffAccess();

  if (loading) {
    return (
      <div className="admin-user-profile__state" style={{ margin: "2rem auto" }}>
        <div className="admin-user-profile__spinner" aria-hidden="true" />
        <p>Проверка доступа…</p>
      </div>
    );
  }

  if (!isStaff) {
    return <Navigate to="/profile" replace />;
  }

  return children;
}
