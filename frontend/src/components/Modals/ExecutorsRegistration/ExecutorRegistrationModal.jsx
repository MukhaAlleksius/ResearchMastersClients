import React, { useState } from "react";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "./executor_registration_modal.css";

export default function ExecutorModal({ isOpen, onClose }) {
  const [specialization, setSpecialization] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();

    console.log({
      specialization,
      firstName,
      lastName,
      phone,
    });

    alert("Заявка отправлена!");

    setSpecialization("");
    setFirstName("");
    setLastName("");
    setPhone("");

    onClose();
  };

  return (
    <div
      className="modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="executorModalTitle"
    >
      <div className="modal-content">
        <div className="modal-header">
          <h3 id="executorModalTitle" className="modal-title">
            Стать исполнителем
          </h3>
          <button
            onClick={onClose}
            className="close-button"
            aria-label="Закрыть модальное окно"
            type="button"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="benefits">
          <h4 className="benefits-title">Преимущества работы с Fixer:</h4>
          <ul className="benefits-list">
            <li>
              <i className="fas fa-check"></i>Постоянный поток заказов
            </li>
            <li>
              <i className="fas fa-check"></i>Гарантированная оплата
            </li>
            <li>
              <i className="fas fa-check"></i>Поддержка 24/7
            </li>
            <li>
              <i className="fas fa-check"></i>Удобное мобильное приложение
            </li>
          </ul>
        </div>

        <form onSubmit={handleSubmit}>
          <div>
            <label htmlFor="specialization">Специализация</label>
            <select
              id="specialization"
              value={specialization}
              onChange={(e) => setSpecialization(e.target.value)}
              required
            >
              <option value="">Выберите специализацию</option>
              <option>Ремонт и строительство</option>
              <option>Уборка и хозяйство</option>
              <option>Курьерские услуги</option>
              <option>IT-услуги</option>
              <option>Красота и здоровье</option>
            </select>
          </div>

          <div className="grid">
            <div>
              <label htmlFor="firstName">Имя</label>
              <input
                type="text"
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </div>

            <div>
              <label htmlFor="lastName">Фамилия</label>
              <input
                type="text"
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="phone">Телефон</label>
            <input
              type="tel"
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="submit-button">
            Подать заявку
          </button>
        </form>
      </div>
    </div>
  );
}
