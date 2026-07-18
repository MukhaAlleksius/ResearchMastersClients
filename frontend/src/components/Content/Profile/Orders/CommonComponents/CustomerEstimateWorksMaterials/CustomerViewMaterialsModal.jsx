import React from "react";
import "../../../Services/CommonComponent/EstimateWorksMaterials/estimate_works_materials.css";

const formatMoney = (value) =>
  Number(value || 0).toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function CustomerViewMaterialsModal({
  workId,
  work,
  onClose,
}) {
  const materials = work?.materials || [];

  const materialsTotal = materials.reduce(
    (sum, mat) =>
      sum +
      Number(mat.materialPricePerUnit || 0) *
        Number(mat.materialQuantity || 0),
    0,
  );

  const currency = materials[0]?.currency || work?.currency || "BYN";

  return (
    <div
      className="materials-modal-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="materials-modal materials-modal--view"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-materials-modal-title"
      >
        <header className="materials-modal__header">
          <div className="materials-modal__header-text">
            <span className="materials-modal__badge">Просмотр</span>
            <h2
              id="customer-materials-modal-title"
              className="materials-modal__title"
            >
              Материалы
            </h2>
            <p className="materials-modal__subtitle">
              {work?.workDescription
                ? `${work.workDescription} · позиция #${workId}`
                : `Позиция #${workId}`}
            </p>
          </div>
          <button
            type="button"
            className="materials-modal__close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </header>

        <div className="materials-modal__body">
          <section className="materials-modal__card materials-modal__card--list">
            <div className="materials-modal__list-head">
              <h3 className="materials-modal__section-title">
                Материалы по работе
              </h3>
              {materials.length > 0 && (
                <span className="materials-modal__total">
                  Итого: {formatMoney(materialsTotal)} {currency}
                </span>
              )}
            </div>

            {materials.length > 0 ? (
              <div className="materials-modal__table-wrap">
                <table className="materials-modal__table">
                  <thead>
                    <tr>
                      <th>Название</th>
                      <th>Кол-во</th>
                      <th>Ед.</th>
                      <th className="th-right">Цена</th>
                      <th className="th-right">Сумма</th>
                    </tr>
                  </thead>
                  <tbody>
                    {materials.map((mat) => (
                      <tr key={mat.id ?? `${workId}-${mat.materialDescription}`}>
                        <td className="col-name">{mat.materialDescription}</td>
                        <td>{formatMoney(mat.materialQuantity)}</td>
                        <td>
                          <span className="unit-badge">{mat.materialUnit}</span>
                        </td>
                        <td className="col-money">
                          {formatMoney(mat.materialPricePerUnit)}{" "}
                          <span className="currency-inline">
                            {mat.currency || currency}
                          </span>
                        </td>
                        <td className="col-money col-total">
                          {formatMoney(
                            Number(mat.materialPricePerUnit || 0) *
                              Number(mat.materialQuantity || 0),
                          )}{" "}
                          <span className="currency-inline">
                            {mat.currency || currency}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="materials-modal__empty">
                <p>Материалы не добавлены</p>
                <span>Исполнитель ещё не указал материалы для этой работы</span>
              </div>
            )}
          </section>
        </div>

        <footer className="materials-modal__footer">
          <button
            type="button"
            className="materials-modal__btn-secondary"
            onClick={onClose}
          >
            Закрыть
          </button>
        </footer>
      </div>
    </div>
  );
}
