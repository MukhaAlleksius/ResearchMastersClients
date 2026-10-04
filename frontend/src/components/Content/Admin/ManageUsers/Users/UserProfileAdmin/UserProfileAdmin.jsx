import React, { useState, useEffect, useCallback } from "react";
import {
  useParams,
  useNavigate,
  useLocation,
  Outlet,
  NavLink,
  Link,
} from "react-router-dom";
import { API, apiFetch, normalizeListResponse, readApiError, resolveMediaUrl } from "../../../../../../utils/api.js";
import { getExecutorProfileLink } from "../../../../../../utils/executorProfile.js";
import { formatGeoAddress, hasGeoAddress } from "../../../../../../utils/geoAddress.js";
import { uiConfirm } from "../../../../../UiDialog/uiDialog.js";
import "./user_profile_admin.css";
import "../manage_users.css";

const ROLE_LABELS = {
  admin: "Администратор",
  moderator: "Модератор",
  user: "Пользователь",
};

function getInitials(firstName, lastName) {
  const a = (firstName || "").trim()[0] || "";
  const b = (lastName || "").trim()[0] || "";
  return (a + b).toUpperCase() || "?";
}

function formatRole(role) {
  return ROLE_LABELS[role] || role || "Пользователь";
}

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function formatDateTime(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("ru-RU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function toDatetimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function isEffectivelyBlocked(profile) {
  if (!profile) return false;
  if (profile.blocked_until) {
    const until = new Date(profile.blocked_until);
    if (!Number.isNaN(until.getTime())) return until > new Date();
  }
  return Boolean(profile.blocked);
}

function InfoField({ label, value, muted = false }) {
  return (
    <div>
      <span className="admin-user-profile__field-label">{label}</span>
      <div
        className={`admin-user-profile__field-value ${
          muted || !value ? "admin-user-profile__field-value--muted" : ""
        }`}
      >
        {value || "—"}
      </div>
    </div>
  );
}

function ProfileCard({ iconClass, icon, title, subtitle, children, className = "" }) {
  return (
    <section className={`admin-user-profile__card ${className}`}>
      <div className="admin-user-profile__card-head">
        <span
          className={`admin-user-profile__card-icon admin-user-profile__card-icon--${iconClass}`}
          aria-hidden="true"
        >
          {icon}
        </span>
        <div>
          <h2 className="admin-user-profile__card-title">{title}</h2>
          {subtitle && (
            <p className="admin-user-profile__card-subtitle">{subtitle}</p>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

function PublicProfileLink({ userId, firstName, lastName, className = "" }) {
  const profileLink = getExecutorProfileLink(userId, {
    first_name: firstName,
    last_name: lastName,
  });

  if (!profileLink) return null;

  return (
    <Link
      to={{
        pathname: profileLink.pathname,
        search: profileLink.search,
      }}
      state={profileLink.state}
      className={`admin-user-profile__public-link ${className}`.trim()}
      target="_blank"
      rel="noopener noreferrer"
    >
      Страница мастера на сайте
      <span aria-hidden="true">↗</span>
    </Link>
  );
}

function UserModerationPanel({ userProfile, onSaved }) {
  const [adminNote, setAdminNote] = useState(userProfile.admin_note || "");
  const [blocked, setBlocked] = useState(isEffectivelyBlocked(userProfile));
  const [blockedUntil, setBlockedUntil] = useState(
    toDatetimeLocal(userProfile.blocked_until),
  );
  const [warningsCount, setWarningsCount] = useState(
    Number(userProfile.warnings_count || 0),
  );
  const [role, setRole] = useState(userProfile.role || "user");
  const [warningReason, setWarningReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    setAdminNote(userProfile.admin_note || "");
    setBlocked(isEffectivelyBlocked(userProfile));
    setBlockedUntil(toDatetimeLocal(userProfile.blocked_until));
    setWarningsCount(Number(userProfile.warnings_count || 0));
    setRole(userProfile.role || "user");
    setWarningReason("");
    setError("");
    setSuccess("");
  }, [userProfile]);

  const saveModeration = async (event, overrides = {}) => {
    event?.preventDefault?.();
    if (saving) return;

    const nextBlocked = overrides.blocked ?? blocked;
    const nextNote = overrides.adminNote ?? adminNote;
    const nextWarnings = overrides.warningsCount ?? warningsCount;

    if (nextBlocked && !isEffectivelyBlocked(userProfile) && !overrides.skipBlockConfirm) {
      const ok = await uiConfirm(
        blockedUntil
          ? `Заблокировать пользователя до ${new Date(blockedUntil).toLocaleString("ru-RU")}?`
          : "Заблокировать пользователя без срока (постоянно)?",
      );
      if (!ok) return;
    }

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const res = await apiFetch(
        `${API.baseURL}/user_profile_for_admin/${userProfile.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            admin_note: String(nextNote || "").trim() || null,
            blocked: nextBlocked,
            blocked_until: nextBlocked && blockedUntil
              ? new Date(blockedUntil).toISOString()
              : null,
            warnings_count: Math.max(0, Math.min(999, Number(nextWarnings) || 0)),
            is_active: userProfile.is_active !== false,
            is_verified: Boolean(userProfile.is_verified),
            role,
            warning_reason: overrides.warningReason || null,
          }),
        },
      );
      if (!res.ok) {
        throw new Error(
          (await readApiError(res)) || "Не удалось сохранить параметры",
        );
      }
      const updated = await res.json();
      setSuccess(overrides.successText || "Параметры пользователя сохранены");
      if (overrides.adminNote != null) setAdminNote(nextNote);
      if (overrides.warningsCount != null) setWarningsCount(nextWarnings);
      onSaved?.(updated);
      return updated;
    } catch (err) {
      setError(err.message || "Ошибка сохранения");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const issueWarning = async () => {
    const reason = warningReason.trim();
    if (reason.length < 3) {
      setError("Напишите, за что выносится предупреждение");
      setSuccess("");
      return;
    }
    const ok = await uiConfirm(`Вынести предупреждение: «${reason}»?`);
    if (!ok) return;
    const when = new Date().toLocaleString("ru-RU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const line = `${when} — предупреждение: ${reason}`;
    const nextNote = [adminNote.trim(), line].filter(Boolean).join("\n");
    const saved = await saveModeration(null, {
      warningsCount: Number(warningsCount || 0) + 1,
      adminNote: nextNote,
      warningReason: reason,
      skipBlockConfirm: true,
      successText: "Предупреждение вынесено",
    });
    if (saved) setWarningReason("");
  };

  const removeWarning = async () => {
    if (Number(warningsCount || 0) <= 0) return;
    const saved = await saveModeration(null, {
      warningsCount: Number(warningsCount || 0) - 1,
      skipBlockConfirm: true,
      successText: "Одно предупреждение снято",
    });
    if (saved) setWarningReason("");
  };

  return (
    <form className="admin-user-moderation" onSubmit={saveModeration}>
      <div className="admin-user-moderation__head">
        <div>
          <h2 className="admin-user-moderation__title">Модерация</h2>
          <p className="admin-user-moderation__subtitle">
            Замечания, блокировка и параметры аккаунта из базы
          </p>
        </div>
        <button
          type="submit"
          className="manage-users-btn manage-users-btn--primary"
          disabled={saving}
        >
          {saving ? "Сохранение…" : "Сохранить"}
        </button>
      </div>

      {error && (
        <p className="admin-user-moderation__alert admin-user-moderation__alert--error">
          {error}
        </p>
      )}
      {success && (
        <p className="admin-user-moderation__alert admin-user-moderation__alert--ok">
          {success}
        </p>
      )}

      <label className="admin-user-moderation__label">
        Замечания администратора
        <textarea
          className="admin-user-moderation__textarea"
          rows={4}
          maxLength={4000}
          value={adminNote}
          onChange={(e) => setAdminNote(e.target.value)}
          placeholder="Служебные заметки, не связанные с предупреждениями…"
        />
      </label>

      <div className="admin-user-moderation__grid">
        <label className="admin-user-moderation__check">
          <input
            type="checkbox"
            checked={blocked}
            onChange={(e) => setBlocked(e.target.checked)}
          />
          Заблокирован
        </label>
        <label className="admin-user-moderation__label">
          Блокировка до
          <input
            type="datetime-local"
            className="admin-user-moderation__input"
            value={blockedUntil}
            disabled={!blocked}
            onChange={(e) => setBlockedUntil(e.target.value)}
          />
          <span className="admin-user-moderation__hint">
            Пусто — постоянная блокировка
          </span>
        </label>
        <label className="admin-user-moderation__label admin-user-moderation__label--span">
          Предупреждения
          <span className="admin-user-moderation__count">
            Сейчас: {Number(warningsCount || 0)}
          </span>
          <textarea
            className="admin-user-moderation__textarea"
            rows={3}
            maxLength={500}
            value={warningReason}
            onChange={(e) => setWarningReason(e.target.value)}
            placeholder="Обязательно напишите, за что предупреждение. Например: срыв срока по заказу №12"
          />
          <div className="admin-user-moderation__warn-actions">
            <button
              type="button"
              className="manage-users-btn manage-users-btn--primary"
              disabled={saving || warningReason.trim().length < 3}
              onClick={issueWarning}
            >
              Вынести предупреждение
            </button>
            <button
              type="button"
              className="manage-users-btn manage-users-btn--outline"
              disabled={saving || Number(warningsCount || 0) <= 0}
              onClick={removeWarning}
            >
              Снять одно
            </button>
          </div>
        </label>
        <label className="admin-user-moderation__label">
          Роль
          <select
            className="admin-user-moderation__input"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="user">Пользователь</option>
            <option value="moderator">Модератор</option>
            <option value="admin">Администратор</option>
          </select>
        </label>
      </div>
    </form>
  );
}

function UserProfileOverview({
  userProfile,
  stats,
  specializations,
  onOpenOrders,
  onOpenServices,
  onProfileSaved,
}) {
  return (
    <>
      <UserModerationPanel
        userProfile={userProfile}
        onSaved={onProfileSaved}
      />
      <div className="admin-user-profile__actions">
        <button
          type="button"
          className="admin-user-profile__action"
          onClick={onOpenOrders}
        >
          <span
            className="admin-user-profile__action-icon admin-user-profile__action-icon--orders"
            aria-hidden="true"
          >
            📋
          </span>
          <span className="admin-user-profile__action-body">
            <p className="admin-user-profile__action-title">
              Заказы заказчика
            </p>
            <p className="admin-user-profile__action-desc">
              {stats.orders > 0
                ? `${stats.orders} заказ(ов) — просмотр, фильтры и детали`
                : "Заказов пока нет"}
            </p>
          </span>
          <span className="admin-user-profile__action-arrow" aria-hidden="true">
            →
          </span>
        </button>

        <button
          type="button"
          className="admin-user-profile__action"
          onClick={onOpenServices}
        >
          <span
            className="admin-user-profile__action-icon admin-user-profile__action-icon--services"
            aria-hidden="true"
          >
            🛠
          </span>
          <span className="admin-user-profile__action-body">
            <p className="admin-user-profile__action-title">
              Услуги исполнителя
            </p>
            <p className="admin-user-profile__action-desc">
              {stats.services > 0
                ? `${stats.services} услуг(и) — статусы и история`
                : "Услуг пока нет"}
            </p>
          </span>
          <span className="admin-user-profile__action-arrow" aria-hidden="true">
            →
          </span>
        </button>
      </div>

      <div className="admin-user-profile__grid">
        <ProfileCard
          iconClass="geo"
          icon="📍"
          title="География"
          subtitle="Местоположение пользователя"
          className="admin-user-profile__card--third"
        >
          <div className="admin-user-profile__fields">
            <InfoField label="Страна" value={userProfile.country} />
            <InfoField label="Регион" value={userProfile.region} />
            <InfoField label="Город" value={userProfile.town} />
          </div>
        </ProfileCard>

        <ProfileCard
          iconClass="business"
          icon="💼"
          title="Бизнес"
          subtitle="Юридическая информация"
          className="admin-user-profile__card--third"
        >
          <div className="admin-user-profile__fields">
            <InfoField
              label="Форма"
              value={userProfile.name_business_form}
              muted
            />
            <InfoField
              label="Регистрация"
              value={userProfile.registration_number}
              muted
            />
            <InfoField
              label="Название"
              value={userProfile.name_business}
              muted
            />
            <InfoField label="Адрес" value={userProfile.location} muted />
          </div>
        </ProfileCard>

        <ProfileCard
          iconClass="profile"
          icon="👤"
          title="Профиль"
          subtitle="Публичные данные мастера"
          className="admin-user-profile__card--third"
        >
          <PublicProfileLink
            userId={userProfile.id}
            firstName={userProfile.first_name}
            lastName={userProfile.last_name}
            className="admin-user-profile__public-link--card"
          />
          <div className="admin-user-profile__fields">
            <InfoField
              label="Режим работы"
              value={userProfile.operating_mode}
              muted
            />
            <InfoField
              label="Краткое описание"
              value={userProfile.short_review_master}
              muted
            />
          </div>
          {userProfile.bio ? (
            <p className="admin-user-profile__prose" style={{ marginTop: "1rem" }}>
              {userProfile.bio}
            </p>
          ) : (
            <p className="admin-user-profile__empty" style={{ marginTop: "0.75rem" }}>
              Описание не заполнено
            </p>
          )}
        </ProfileCard>

        {specializations.length > 0 && (
          <ProfileCard
            iconClass="spec"
            icon="⚡"
            title="Специализации"
            subtitle={`${specializations.length} направлений`}
          >
            <div className="admin-user-profile__chips">
              {specializations.map((spec) => (
                <span
                  key={spec.category_work_master_id || spec.category_work_id}
                  className="admin-user-profile__chip"
                >
                  {spec.name}
                </span>
              ))}
            </div>
          </ProfileCard>
        )}

        <ProfileCard
          iconClass="profile"
          icon="🔐"
          title="Аккаунт"
          subtitle="Системная информация"
          className="admin-user-profile__card--half"
        >
          <div className="admin-user-profile__fields admin-user-profile__fields--2">
            <InfoField label="Email" value={userProfile.email} />
            <InfoField label="ID" value={String(userProfile.id)} />
            <InfoField
              label="Верификация"
              value={userProfile.is_verified ? "Подтверждён" : "Не подтверждён"}
            />
            <InfoField
              label="Последний вход"
              value={formatDateTime(userProfile.last_login)}
              muted
            />
            <InfoField
              label="Блокировка до"
              value={formatDateTime(userProfile.blocked_until)}
              muted
            />
            <InfoField
              label="Предупреждения"
              value={String(userProfile.warnings_count ?? 0)}
            />
          </div>
        </ProfileCard>
      </div>
    </>
  );
}

export default function UserProfileAdmin() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [userProfile, setUserProfile] = useState(null);
  const [stats, setStats] = useState({ orders: 0, services: 0 });
  const [specializations, setSpecializations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const basePath = `/admin/manage_users/${userId}`;

  const isOverview =
    location.pathname === basePath || location.pathname === `${basePath}/`;

  const fetchUserData = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    setError(null);

    try {
      const [profileRes, ordersRes, servicesRes, specsRes] = await Promise.all([
        apiFetch(`${API.baseURL}/user_profile_for_admin/${userId}`),
        apiFetch(`${API.baseURL}/orders_customer_admin?user_id=${userId}`),
        apiFetch(`${API.baseURL}/services_executor_admin?user_id=${userId}`),
        apiFetch(`${API.baseURL}/categories_works_master/${userId}`),
      ]);

      if (!profileRes.ok) {
        const detail = await readApiError(profileRes);
        if (profileRes.status === 404) {
          throw new Error("Пользователь не найден");
        }
        if (profileRes.status === 403) {
          throw new Error(
            detail ||
              "Нет прав для просмотра профиля. Войдите под учётной записью с ролью admin или moderator.",
          );
        }
        throw new Error(detail || "Не удалось загрузить профиль");
      }

      const profile = await profileRes.json();
      if (!profile) {
        throw new Error("Пользователь не найден");
      }
      setUserProfile(profile);

      const orders = ordersRes.ok
        ? normalizeListResponse(await ordersRes.json())
        : [];
      const services = servicesRes.ok
        ? normalizeListResponse(await servicesRes.json())
        : [];
      const specs = specsRes.ok ? normalizeListResponse(await specsRes.json()) : [];

      if (!ordersRes.ok && ordersRes.status === 403) {
        console.warn("Нет прав для просмотра заказов пользователя");
      }
      if (!servicesRes.ok && servicesRes.status === 403) {
        console.warn("Нет прав для просмотра услуг пользователя");
      }

      setStats({
        orders: orders.length,
        services: services.length,
      });
      setSpecializations(specs);
    } catch (err) {
      console.error("Ошибка загрузки профиля:", err);
      setError(err.message || "Ошибка загрузки данных");
      setUserProfile(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);

  const goBackToList = () => navigate("/admin/manage_users");
  const goToOrders = () => navigate(`${basePath}/orders`);
  const goToServices = () => navigate(`${basePath}/services`);

  if (loading) {
    return (
      <div className="admin-user-profile">
        <div className="admin-user-profile__state">
          <div className="admin-user-profile__spinner" aria-hidden="true" />
          <p>Загрузка профиля пользователя…</p>
        </div>
      </div>
    );
  }

  if (error || !userProfile) {
    return (
      <div className="admin-user-profile">
        <div className="admin-user-profile__topbar">
          <button
            type="button"
            className="admin-user-profile__back"
            onClick={goBackToList}
          >
            ← К списку
          </button>
        </div>
        <div className="admin-user-profile__state">
          <p>{error || "Пользователь не найден"}</p>
          <button
            type="button"
            className="manage-users-btn manage-users-btn--primary"
            onClick={fetchUserData}
          >
            Повторить
          </button>
        </div>
      </div>
    );
  }

  const fullName =
    [userProfile.first_name, userProfile.last_name].filter(Boolean).join(" ") ||
    "Пользователь";

  const statusPill = isEffectivelyBlocked(userProfile)
    ? { label: "Заблокирован", className: "blocked" }
    : userProfile.is_active === false
      ? { label: "Неактивен", className: "inactive" }
      : { label: "Активен", className: "active" };

  return (
    <div className="admin-user-profile">
      <div className="admin-user-profile__topbar">
        <button
          type="button"
          className="admin-user-profile__back"
          onClick={goBackToList}
        >
          ← К списку пользователей
        </button>
        <p className="admin-user-profile__breadcrumb">
          Админ · Пользователи · <strong>{fullName}</strong>
        </p>
      </div>

      <header className="admin-user-profile__hero">
        <div className="admin-user-profile__hero-glow" aria-hidden="true" />
        <div className="admin-user-profile__hero-inner">
          <div className="admin-user-profile__avatar-wrap">
            {userProfile.avatar_url ? (
              <img
                src={resolveMediaUrl(userProfile.avatar_url)}
                alt=""
                className="admin-user-profile__avatar"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : (
              <div
                className="admin-user-profile__avatar admin-user-profile__avatar--placeholder"
                aria-hidden="true"
              >
                {getInitials(userProfile.first_name, userProfile.last_name)}
              </div>
            )}
          </div>

          <div className="admin-user-profile__hero-main">
            <div className="admin-user-profile__badge-row">
              <span className="admin-user-profile__pill admin-user-profile__pill--muted">
                ID {userProfile.id}
              </span>
              <span
                className={`admin-user-profile__pill admin-user-profile__pill--${statusPill.className}`}
              >
                {statusPill.label}
              </span>
              <span className="admin-user-profile__pill admin-user-profile__pill--role">
                {formatRole(userProfile.role)}
              </span>
              {userProfile.is_verified && (
                <span className="admin-user-profile__pill admin-user-profile__pill--active">
                  ✓ Верифицирован
                </span>
              )}
            </div>

            <h1 className="admin-user-profile__name">{fullName}</h1>

            {userProfile.short_review_master && (
              <p className="admin-user-profile__tagline">
                {userProfile.short_review_master}
              </p>
            )}

            <div className="admin-user-profile__meta">
              {userProfile.email && (
                <span className="admin-user-profile__meta-item">
                  ✉ <strong>{userProfile.email}</strong>
                </span>
              )}
              {hasGeoAddress(userProfile) && (
                <span className="admin-user-profile__meta-item">
                  📍{" "}
                  <strong>{formatGeoAddress(userProfile)}</strong>
                </span>
              )}
              <span className="admin-user-profile__meta-item">
                📅 Регистрация:{" "}
                <strong>{formatDate(userProfile.created_at)}</strong>
              </span>
            </div>

            <PublicProfileLink
              userId={userProfile.id}
              firstName={userProfile.first_name}
              lastName={userProfile.last_name}
            />
          </div>

          <div className="admin-user-profile__hero-stats">
            <div className="admin-user-profile__stat">
              <span className="admin-user-profile__stat-value">
                {stats.orders}
              </span>
              <span className="admin-user-profile__stat-label">Заказов</span>
            </div>
            <div className="admin-user-profile__stat">
              <span className="admin-user-profile__stat-value">
                {stats.services}
              </span>
              <span className="admin-user-profile__stat-label">Услуг</span>
            </div>
            <div className="admin-user-profile__stat">
              <span className="admin-user-profile__stat-value">
                {userProfile.warnings_count ?? 0}
              </span>
              <span className="admin-user-profile__stat-label">
                Замечаний
              </span>
            </div>
          </div>
        </div>
      </header>

      <nav className="admin-user-profile__tabs" aria-label="Разделы профиля">
        <NavLink
          to={basePath}
          end
          className={({ isActive }) =>
            `admin-user-profile__tab ${isActive ? "is-active" : ""}`
          }
        >
          Обзор
        </NavLink>
        <NavLink
          to={`${basePath}/orders`}
          className={({ isActive }) =>
            `admin-user-profile__tab ${isActive ? "is-active" : ""}`
          }
        >
          Заказы
          {stats.orders > 0 && (
            <span className="admin-user-profile__tab-count">{stats.orders}</span>
          )}
        </NavLink>
        <NavLink
          to={`${basePath}/services`}
          className={({ isActive }) =>
            `admin-user-profile__tab ${isActive ? "is-active" : ""}`
          }
        >
          Услуги
          {stats.services > 0 && (
            <span className="admin-user-profile__tab-count">
              {stats.services}
            </span>
          )}
        </NavLink>
      </nav>

      {isOverview ? (
        <UserProfileOverview
          userProfile={userProfile}
          stats={stats}
          specializations={specializations}
          onOpenOrders={goToOrders}
          onOpenServices={goToServices}
          onProfileSaved={(updated) => setUserProfile(updated)}
        />
      ) : (
        <div className="admin-user-profile__outlet admin-user-profile__outlet-wrap">
          <Outlet />
        </div>
      )}
    </div>
  );
}
