// Admin.jsx - ТЕПЕРЬ ТОЛЬКО ГЛАВНАЯ СТРАНИЦА АДМИНКИ
import React from "react";
import AdminLayout from "./AdminLayout";
import AdminMainPage from "./MainPage/MainPage";

const AdminPanel = () => {
  return (
    <AdminLayout activeTab="mainPage">
      <AdminMainPage />
    </AdminLayout>
  );
};

export default AdminPanel;
