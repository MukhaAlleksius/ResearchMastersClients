import React, { useCallback, useEffect, useMemo, useState } from "react";
import { API, apiFetch } from "../../../../utils/api.js";
import { Link } from "react-router-dom";
import ExecutorInfo from "../Orders/CommonComponents/CustomerOrderInfo/ExecutorInfo";
import { getExecutorProfileLink } from "../../../../utils/executorProfile";
import "./my_executors.css";
const getInitials = (name) => {
  if (!name || name === "—") return "?";
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.charAt(0) || "";
  const b = parts[1]?.charAt(0) || "";
  return (a + b).toUpperCase() || name.charAt(0).toUpperCase();
};

export default function MyExecutors() {
  const [executors, setExecutors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedExecutorId, setSelectedExecutorId] = useState(null);
  const [search, setSearch] = useState("");

  const customerId = useMemo(
    () => parseInt(localStorage.getItem("user_id"), 10) || null,
    [],
  );

  const fetchExecutors = useCallback(async () => {
    if (!customerId) {
      setError("Не удалось определить пользователя");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await apiFetch(
        `${API.baseURL}/customer_executors/${customerId}`,
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      setExecutors(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setError("Не удалось загрузить список исполнителей");
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    fetchExecutors();
  }, [fetchExecutors]);

  const filteredExecutors = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return executors;

    return executors.filter((item) => {
      const haystack = [
        item.name_executor,
        item.address,
        item.phone,
        item.notification,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [executors, search]);

  const handleSelect = (executorId) => {
    setSelectedExecutorId((prev) => (prev === executorId ? null : executorId));
  };

  const handleSaved = () => {
    fetchExecutors();
  };

  const handleExecutorRemoved = (executorId) => {
    setSelectedExecutorId((prev) => (prev === executorId ? null : prev));
    fetchExecutors();
  };

  const selectedExecutor = useMemo(
    () =>
      filteredExecutors.find((item) => item.executor_id === selectedExecutorId) ||
      null,
    [filteredExecutors, selectedExecutorId],
  );

  if (loading) {
    return (
      <div className="my-executors">
        <div className="my-executors__state">
          <div className="my-executors__spinner" aria-hidden="true" />
          <p>Загрузка исполнителей…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="my-executors">
        <div className="my-executors__state my-executors__state--error">
          <p>{error}</p>
          <button type="button" className="my-executors__retry" onClick={fetchExecutors}>
            Повторить
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="my-executors">
      <header className="my-executors__header">
        <div>
          <h1 className="my-executors__title">Мои исполнители</h1>
          <p className="my-executors__subtitle">
            Контакты сохраняются в базе и подставляются в заказах при совпадении
            исполнителя
          </p>
        </div>
        <input
          type="search"
          className="my-executors__search"
          placeholder="Поиск по имени, адресу или телефону…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Поиск исполнителей"
        />
      </header>

      {filteredExecutors.length === 0 ? (
        <div className="my-executors__state">
          <p>
            {executors.length === 0
              ? "Пока нет исполнителей. Они появятся после откликов или назначения на заказы."
              : "По вашему запросу ничего не найдено."}
          </p>
        </div>
      ) : (
        <div className="my-executors__layout">
          <ul className="my-executors__list">
            {filteredExecutors.map((item) => {
              const isActive = selectedExecutorId === item.executor_id;
              const hasContacts = Boolean(item.phone || item.notification);
              const profileLink = getExecutorProfileLink(
                item.executor_id,
                item.name_executor,
              );

              return (
                <li key={item.executor_id}>
                  <div
                    className={`my-executors__card ${isActive ? "my-executors__card--active" : ""}`}
                  >
                    <button
                      type="button"
                      className="my-executors__card-main"
                      onClick={() => handleSelect(item.executor_id)}
                    >
                      <span className="my-executors__avatar" aria-hidden="true">
                        {getInitials(item.name_executor)}
                      </span>
                      <span className="my-executors__card-body">
                        <span className="my-executors__name">
                          {profileLink ? (
                            <Link
                              to={profileLink.pathname}
                              state={profileLink.state}
                              className="my-executors__profile-link"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {item.name_executor || "—"}
                            </Link>
                          ) : (
                            item.name_executor || "—"
                          )}
                        </span>
                        <span className="my-executors__meta">
                          {item.address || "Адрес не указан"}
                        </span>
                        <span className="my-executors__meta">
                          {hasContacts
                            ? item.phone || "Телефон не указан"
                            : "Контакты не добавлены"}
                        </span>
                      </span>
                      {!hasContacts && (
                        <span className="my-executors__badge">Нет контактов</span>
                      )}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <aside className="my-executors__detail">
            {selectedExecutorId ? (
              <ExecutorInfo
                key={selectedExecutorId}
                executorId={selectedExecutorId}
                onSaved={handleSaved}
                showRemoveFromList
                executorName={selectedExecutor?.name_executor}
                onRemoved={handleExecutorRemoved}
              />
            ) : (
              <div className="my-executors__detail-placeholder">
                <p>Выберите исполнителя из списка, чтобы просмотреть или изменить контакты</p>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
