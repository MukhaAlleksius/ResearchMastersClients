import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiFetch, buildApiUrl, readApiError } from "../../utils/api.js";
import "./auth_page.css";

export default function VerifyEmailPage({ openModal }) {
  const navigate = useNavigate();
  const location = useLocation();
  const token = new URLSearchParams(location.search).get("token") || "";
  const [status, setStatus] = useState(token ? "loading" : "error");
  const [message, setMessage] = useState(
    token ? "Подтверждаем email…" : "В ссылке нет токена подтверждения.",
  );

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const response = await apiFetch(
          buildApiUrl(`/verify-email?token=${encodeURIComponent(token)}`),
          { headers: { Accept: "application/json" } },
        );
        if (cancelled) return;
        if (!response.ok) {
          const detail = await readApiError(
            response,
            "Не удалось подтвердить email",
          );
          setStatus("error");
          setMessage(detail || "Ссылка недействительна или устарела.");
          return;
        }
        const data = await response.json().catch(() => ({}));
        setStatus("ok");
        setMessage(data.message || "Email подтверждён. Теперь можно войти.");
        navigate("/verify-email", { replace: true });
      } catch (error) {
        if (cancelled) return;
        setStatus("error");
        setMessage(error.message || "Не удалось подтвердить email");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, navigate]);

  const goLogin = () => {
    navigate("/home");
    if (typeof openModal === "function") openModal("loginModal");
  };

  return (
    <div className="page active auth-page">
      <div className="auth-page__card">
        <span className="auth-page__badge">Fixer</span>
        <h1 className="auth-page__title">Подтверждение email</h1>
        <p
          className={
            status === "error"
              ? "auth-page__text auth-page__text--error"
              : "auth-page__text"
          }
        >
          {message}
        </p>
        {status !== "loading" && (
          <div className="auth-page__actions">
            <button type="button" className="auth-page__btn" onClick={goLogin}>
              Войти
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
