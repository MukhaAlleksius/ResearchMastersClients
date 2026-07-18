import React, { useState, useEffect, useCallback } from "react";
import { API, apiFetch, readApiError } from "../../../../../../../../utils/api.js";
import { Link } from "react-router-dom";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import AdminOrderProfileView from "../../../../../shared/AdminOrderProfileView.jsx";
export default function UserServiceProfileAdmin() {
  const [serviceProfile, setServiceProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const { state } = useLocation();
  const navigate = useNavigate();
  const { userId, orderId: serviceIdParam } = useParams();
  const serviceId = serviceIdParam || state?.serviceId;

  const goBack = () => navigate(`/admin/manage_users/${userId}/services`);

  const fetchServiceProfileForAdmin = useCallback(async () => {
    if (!serviceId) return;

    try {
      setLoading(true);
      setError(null);
      const response = await apiFetch(
        `${API.baseURL}/service_profile_for_admin/${serviceId}`,
      );

      if (!response.ok) {
        const detail = (await readApiError(response)) || `HTTP ${response.status}`;
        throw new Error(detail);
      }

      const serviceProfileData = await response.json();
      if (!serviceProfileData) {
        throw new Error("Услуга не найдена");
      }
      setServiceProfile(serviceProfileData);
    } catch (fetchError) {
      console.error("Ошибка получения профиля услуги:", fetchError);
      setError(fetchError.message || "Ошибка загрузки услуги");
      setServiceProfile(null);
    } finally {
      setLoading(false);
    }
  }, [serviceId]);

  useEffect(() => {
    fetchServiceProfileForAdmin();
  }, [fetchServiceProfileForAdmin]);

  return (
    <AdminOrderProfileView
      order={serviceProfile}
      loading={loading}
      error={error}
      orderId={serviceId}
      onBack={goBack}
      backLabel="← К услугам пользователя"
      variant="service"
      breadcrumb={
        <>
          <Link to={`/admin/manage_users/${userId}`}>Пользователь #{userId}</Link>
          {" · "}
          <Link to={`/admin/manage_users/${userId}/services`}>Услуги</Link>
          {" · "}
          <strong>№ {serviceId}</strong>
        </>
      }
      onRetry={fetchServiceProfileForAdmin}
    />
  );
}
