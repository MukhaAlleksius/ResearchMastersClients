import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import PasswordField from "../Modals/Regisration/PasswordField.jsx";
import { apiFetch, buildApiUrl, readApiError } from "../../utils/api.js";
import { validatePassword } from "../../utils/passwordRules.js";
import "../Modals/Regisration/registration_modal.css";
import "./auth_page.css";

export default function ResetPasswordPage({ openModal }) {
  const navigate = useNavigate();
  const location = useLocation();
  const token = new URLSearchParams(location.search).get("token") || "";
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(token ? "" : "В ссылке нет токена сброса пароля.");
  const [done, setDone] = useState(false);

  const goLogin = () => {
    navigate("/home");
    if (typeof openModal === "function") openModal("loginModal");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    setError("");
    setLoading(true);
    try {
      const response = await apiFetch(buildApiUrl("/reset-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!response.ok) {
        const detail = await readApiError(
          response,
          "Не удалось обновить пароль",
        );
        throw new Error(detail || "Ссылка недействительна или устарела");
      }
      setDone(true);
      navigate("/reset-password", { replace: true });
    } catch (err) {
      setError(err.message || "Не удалось обновить пароль");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page active auth-page">
      <div className="auth-page__card">
        <span className="auth-page__badge">Fixer</span>
        <h1 className="auth-page__title">Новый пароль</h1>
        {done ? (
          <>
            <p className="auth-page__text">
              Пароль обновлён. Теперь можно войти в аккаунт.
            </p>
            <div className="auth-page__actions">
              <button type="button" className="auth-page__btn" onClick={goLogin}>
                Войти
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="auth-page__text">
              Придумайте пароль: от 8 символов, буквы и цифры.
            </p>
            {error && (
              <p className="auth-page__text auth-page__text--error" role="alert">
                {error}
              </p>
            )}
            <form className="auth-page__form" onSubmit={handleSubmit} noValidate>
              <label className="auth-page__label" htmlFor="reset-password">
                Пароль *
                <PasswordField
                  id="reset-password"
                  name="fixer_reset_secret"
                  className="reg-modal__input"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  disabled={loading || !token}
                  required
                />
              </label>
              <button
                type="submit"
                className="auth-page__btn"
                disabled={loading || !token}
              >
                {loading ? "Сохраняем…" : "Сохранить пароль"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
