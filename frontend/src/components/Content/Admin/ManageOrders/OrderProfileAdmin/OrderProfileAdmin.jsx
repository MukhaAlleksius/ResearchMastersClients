import React, { useState, useEffect, useCallback } from "react";
import { API, apiFetch, readApiError } from "../../../../../utils/api.js";
import { Link } from "react-router-dom";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import AdminOrderProfileView from "../../shared/AdminOrderProfileView.jsx";
export default function OrderProfileAdmin() {
  const [orderProfile, setOrderProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const { state } = useLocation();
  const navigate = useNavigate();
  const { orderId: orderIdParam } = useParams();
  const orderId = orderIdParam || state?.orderId;

  const goBack = () => navigate("/admin/manage_orders");

  const fetchOrderProfileForAdmin = useCallback(async () => {
    if (!orderId) return;

    try {
      setLoading(true);
      setError(null);
      const response = await apiFetch(
        `${API.baseURL}/order_profile_for_admin/${orderId}`,
      );

      if (!response.ok) {
        const detail = (await readApiError(response)) || `HTTP ${response.status}`;
        throw new Error(detail);
      }

      const orderProfileData = await response.json();
      if (!orderProfileData) {
        throw new Error("Заказ не найден");
      }
      setOrderProfile(orderProfileData);
    } catch (fetchError) {
      console.error("Ошибка получения профиля заказа:", fetchError);
      setError(fetchError.message || "Ошибка загрузки заказа");
      setOrderProfile(null);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchOrderProfileForAdmin();
  }, [fetchOrderProfileForAdmin]);

  return (
    <AdminOrderProfileView
      order={orderProfile}
      loading={loading}
      error={error}
      orderId={orderId}
      onBack={goBack}
      backLabel="← К списку заказов"
      breadcrumb={
        <>
          Админ · <Link to="/admin/manage_orders">Заказы</Link> ·{" "}
          <strong>№ {orderId}</strong>
        </>
      }
      onRetry={fetchOrderProfileForAdmin}
    />
  );
}
