import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, buildApiUrl, readApiError } from "../../../utils/api.js";
import { useLocation, useNavigate } from "react-router-dom";
import OrderCustomer from "./OrderCustomer.jsx";
import "../shared/public_content_layout.css";
import "./orders_customers.css";
export default function CatalogOrderPage({ openModal }) {
  const location = useLocation();
  const navigate = useNavigate();

  const orderId = useMemo(() => {
    const fromState = location.state?.orderId;
    if (fromState) return String(fromState);

    const fromQuery = new URLSearchParams(location.search).get("id");
    if (fromQuery) return fromQuery;

    return null;
  }, [location.state?.orderId, location.search]);

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchOrder = useCallback(async () => {
    if (!orderId) {
      setError("Заказ не найден. Откройте его из каталога заказов.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await apiFetch(buildApiUrl(`/order/${orderId}`));
      if (!response.ok) {
        const detail = await readApiError(response);
        if (response.status === 401) {
          throw new Error(
            detail || "Войдите в аккаунт, чтобы открыть этот заказ",
          );
        }
        throw new Error(detail || `HTTP ${response.status}`);
      }

      setOrder(await response.json());
    } catch (err) {
      console.error("Ошибка загрузки заказа:", err);
      setError("Не удалось загрузить информацию о заказе");
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  const handleBack = () => {
    if (location.state?.returnTo) {
      navigate(location.state.returnTo);
      return;
    }
    navigate("/orders");
  };

  return (
    <div className="catalog-page catalog-page--order-detail public-content-narrow">
      <div className="catalog-container">
        {loading && (
          <div className="catalog-order-detail__state">
            <div className="catalog-order-detail__spinner" aria-hidden="true" />
            <p>Загрузка заказа…</p>
          </div>
        )}

        {!loading && error && (
          <div className="catalog-order-detail__state catalog-order-detail__state--error">
            <p>{error}</p>
            <button type="button" className="retry-button" onClick={handleBack}>
              ← Назад к каталогу
            </button>
          </div>
        )}

        {!loading && !error && order && (
          <OrderCustomer
            order={order}
            onBack={handleBack}
            openModal={openModal}
          />
        )}
      </div>
    </div>
  );
}
