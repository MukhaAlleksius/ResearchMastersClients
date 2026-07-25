import React from "react";
import { Navigate } from "react-router-dom";

/** Для тестирования (пустая Docker-БД) админку открываем любому вошедшему пользователю. */
export default function AdminStaffGuard({ children }) {
  const isLoggedIn = Boolean(localStorage.getItem("access_token"));

  if (!isLoggedIn) {
    return <Navigate to="/home" replace />;
  }

  return children;
}
