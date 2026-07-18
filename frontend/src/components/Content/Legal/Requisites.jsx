import React from "react";
import { Link } from "react-router-dom";
import LegalPageLayout from "./LegalPageLayout";
import { LEGAL } from "./legalConfig";

export default function Requisites() {
  const {
    siteName,
    companyName,
    unp,
    legalAddress,
    postalAddress,
    email,
    phone,
    director,
    bankName,
    bankBic,
    bankAccount,
    siteUrl,
  } = LEGAL;

  return (
    <LegalPageLayout title="Реквизиты и контакты" showDraftNotice>
      <section className="legal-section">
        <h2>Оператор сервиса</h2>
        <table className="legal-requisites-table">
          <tbody>
            <tr>
              <th>Наименование</th>
              <td>{companyName}</td>
            </tr>
            <tr>
              <th>УНП</th>
              <td>{unp}</td>
            </tr>
            <tr>
              <th>Юридический адрес</th>
              <td>{legalAddress}</td>
            </tr>
            <tr>
              <th>Почтовый адрес</th>
              <td>{postalAddress}</td>
            </tr>
            <tr>
              <th>Руководитель</th>
              <td>{director}</td>
            </tr>
            <tr>
              <th>Сайт</th>
              <td>
                <a href={siteUrl}>{siteUrl}</a>
              </td>
            </tr>
            <tr>
              <th>Email</th>
              <td>
                <a href={`mailto:${email}`}>{email}</a>
              </td>
            </tr>
            <tr>
              <th>Телефон</th>
              <td>{phone}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="legal-section">
        <h2>Банковские реквизиты</h2>
        <table className="legal-requisites-table">
          <tbody>
            <tr>
              <th>Банк</th>
              <td>{bankName}</td>
            </tr>
            <tr>
              <th>BIC</th>
              <td>{bankBic}</td>
            </tr>
            <tr>
              <th>Расчётный счёт (IBAN)</th>
              <td>{bankAccount}</td>
            </tr>
          </tbody>
        </table>
        <p>
          На указанный счёт зачисляются платежи заказчиков, принятые через
          интернет-эквайринг. Выплаты исполнителям производятся с этого же
          счёта на IBAN, указанный исполнителем в личном кабинете.
        </p>
      </section>

      <section className="legal-section">
        <h2>Описание услуг</h2>
        <p>
          Сервис {siteName} — онлайн-платформа для размещения заказов на
          выполнение работ и услуг, поиска исполнителей, согласования условий,
          оплаты через эскроу и сопровождения сделки между заказчиком и
          исполнителем.
        </p>
        <p>
          Стоимость использования платформы для заказчика включает оплату
          работ исполнителя и комиссию сервиса (см.{" "}
          <Link to="/legal/payment">Условия оплаты</Link>).
        </p>
      </section>

      <section className="legal-section">
        <h2>Документы</h2>
        <ul>
          <li>
            <Link to="/legal/terms">Пользовательское соглашение</Link>
          </li>
          <li>
            <Link to="/legal/privacy">Политика конфиденциальности</Link>
          </li>
          <li>
            <Link to="/legal/payment">Условия оплаты и возврата</Link>
          </li>
        </ul>
      </section>
    </LegalPageLayout>
  );
}
