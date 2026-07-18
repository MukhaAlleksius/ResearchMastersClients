import { useState, useEffect } from "react";
import { API, apiFetch, buildApiUrl } from "../../../../utils/api.js";
import "./profile_settings.css";
export default function ModalShowContacts({ onClose }) {
  const [userContacts, setUserContacts] = useState([]);

  const fetchUserContacts = async () => {
    try {
      const user_id = localStorage.getItem("user_id");
      if (!user_id) throw new Error("User ID не найден");
      const response_user = await apiFetch(
        `${API.baseURL}/contacts`,
      );
      if (!response_user.ok) {
        throw new Error("Не получили данных с сервера");
      }
      const data_user = await response_user.json();
      setUserContacts(data_user);
    } catch (error) {
      console.log("Ошибка: ", error);
      return null;
    }
  };

  const removeContact = async (contact_id) => {
    try {
      const response = await apiFetch(
        buildApiUrl(`/delete_contact/${contact_id}`),
        { method: "DELETE" },
      );
      if (!response.ok) {
        throw new Error("Ошибка при удалении контакта");
      }
      await fetchUserContacts();
    } catch (error) {
      console.error("Ошибка: ", error);
      alert("Не удалось удалить контакт");
    }
  };

  useEffect(() => {
    fetchUserContacts();
  }, []);

  return (
    <div
      className="ps-modal-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="ps-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="ps-contacts-modal-title"
        aria-modal="true"
      >
        <div className="ps-modal__header">
          <h3 id="ps-contacts-modal-title" className="ps-modal__title">
            Ваши контакты
          </h3>
        </div>
        <div className="ps-modal__body">
          {userContacts.length === 0 ? (
            <p className="ps-modal__empty">Контакты не добавлены</p>
          ) : (
            <ul className="ps-contact-list">
              {userContacts.map(({ contact_id, name_contact, contact }) => (
                <li key={contact_id} className="ps-contact-item">
                  <span className="ps-contact-item__type">{name_contact}</span>
                  <span className="ps-contact-item__value">{contact}</span>
                  <button
                    type="button"
                    className="ps-contact-item__remove"
                    onClick={() => removeContact(contact_id)}
                    title="Удалить контакт"
                    aria-label={`Удалить ${name_contact}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="ps-modal__footer">
          <button
            type="button"
            className="ps-btn ps-btn--primary"
            onClick={onClose}
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
