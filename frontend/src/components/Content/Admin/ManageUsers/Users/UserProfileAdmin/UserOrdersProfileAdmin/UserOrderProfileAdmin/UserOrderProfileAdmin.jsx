import React, { useState, useEffect, useCallback } from "react";
import { API, apiFetch, readApiError } from "../../../../../../../../utils/api.js";
import { Link } from "react-router-dom";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import AdminOrderProfileView from "../../../../../shared/AdminOrderProfileView.jsx";
export default function UserOrderProfileAdmin() {
  const [orderProfile, setOrderProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const { state } = useLocation();
  const navigate = useNavigate();
  const { userId, orderId: orderIdParam } = useParams();
  const orderId = orderIdParam || state?.orderId;

  const goBack = () => navigate(`/admin/manage_users/${userId}/orders`);

  const fetchOrderProfileForAdmin = useCallback(async () => {
    if (!orderId) return;

    try {
      setLoading(true);
      setError("");
      const response = await apiFetch(
        `${API.baseURL}/order_profile_for_admin/${orderId}`,
      );

      if (!response.ok) {
        const detail = (await readApiError(response)) || `HTTP ${response.status}`;
        setError(detail);
        setOrderProfile(null);
        return;
      }

      const orderProfileData = await response.json();
      if (!orderProfileData) {
        setError("Заказ не найден");
        setOrderProfile(null);
        return;
      }
      setOrderProfile(orderProfileData);
    } catch (fetchError) {
      setError("Ошибка получения профиля заказа.");
      setOrderProfile(null);
      console.error("Ошибка получения профиля заказа:", fetchError);
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
      backLabel="← К заказам пользователя"
      breadcrumb={
        <>
          <Link to={`/admin/manage_users/${userId}`}>Пользователь #{userId}</Link>
          {" · "}
          <Link to={`/admin/manage_users/${userId}/orders`}>Заказы</Link>
          {" · "}
          <strong>№ {orderId}</strong>
        </>
      }
      onRetry={fetchOrderProfileForAdmin}
    />
  );
}
