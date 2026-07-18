import React, { useRef, useState } from "react";
import { API, apiFetch } from "../../../../../../utils/api.js";
import {
  createMoneyAnchor,
  formatMoney,
  normalizeCurrencyCode,
} from "../../../../../../utils/currency";
import "./estimate_works_materials.css";
export default function EditWorkModal({

  userId,

  orderId,

  work,

  onClose,

  onSave,

  currency: estimateCurrency = "BYN",

}) {

  const resolvedCurrency = normalizeCurrencyCode(estimateCurrency || "BYN");



  const [editedWork, setEditedWork] = useState({

    workId: work.id,

    workDescription: work.workDescription,

    workQuantity: work.workQuantity.toString(),

    workUnit: work.workUnit,

    workPricePerUnit: work.workPricePerUnit.toString(),

  });



  const [isSaving, setIsSaving] = useState(false);

  const priceAnchorRef = useRef(

    createMoneyAnchor(work.workPricePerUnit, resolvedCurrency),

  );



  const lineTotal =

    Number(editedWork.workPricePerUnit || 0) *

    Number(editedWork.workQuantity || 0);



  const handleKeyDown = (e) => {

    const allowedKeys = [

      "Backspace",

      "Tab",

      "ArrowLeft",

      "ArrowRight",

      "Delete",

      "Home",

      "End",

      "Enter",

    ];



    if (allowedKeys.includes(e.key)) return;

    if (e.key >= "0" && e.key <= "9") return;



    const currentValue = e.currentTarget.value;

    const hasDecimal = /\./.test(currentValue) || /,/.test(currentValue);



    if ((e.key === "." || e.key === ",") && !hasDecimal) return;



    e.preventDefault();

  };



  const handleChange = (field, value) => {

    if (field === "workPricePerUnit") {

      priceAnchorRef.current.set(value, resolvedCurrency);

    }

    setEditedWork((prev) => ({

      ...prev,

      [field]: value,

    }));

  };



  const handleSave = async () => {

    if (

      !editedWork.workDescription ||

      !editedWork.workQuantity ||

      !editedWork.workUnit ||

      !editedWork.workPricePerUnit

    ) {

      alert("Заполните все поля!");

      return;

    }



    const numQty = Number(editedWork.workQuantity);

    if (numQty <= 0) {

      alert("Количество должно быть больше 0");

      return;

    }



    const numPrice = Number(editedWork.workPricePerUnit);

    if (numPrice < 0) {

      alert("Цена не может быть отрицательной");

      return;

    }



    setIsSaving(true);



    try {

      const update_work_estimate = {

        name_work: editedWork.workDescription,

        quantity: numQty,

        unit_measurement: editedWork.workUnit,

        cost_unit: numPrice,

        currency: resolvedCurrency,

      };



      const response = await apiFetch(

        `${API.baseURL}/update_work_into_estimate/${work.id}/${userId}/${orderId}`,

        {

          method: "PUT",

          headers: { "Content-Type": "application/json" },

          body: JSON.stringify(update_work_estimate),

        },

      );



      if (response && response.ok === false) {

        const text = await response.text?.();

        console.error("Backend error:", text);

        throw new Error("Ошибка сохранения");

      }



      if (typeof onSave === "function") {

        onSave({

          ...work,

          workDescription: editedWork.workDescription,

          workQuantity: Number(editedWork.workQuantity),

          workUnit: editedWork.workUnit,

          workPricePerUnit: Number(editedWork.workPricePerUnit),

          currency: resolvedCurrency,

          materials: work.materials || [],

        });

      }



      onClose();

    } catch (e) {

      console.error(e);

      alert("Не удалось сохранить изменения");

    } finally {

      setIsSaving(false);

    }

  };



  return (

    <div

      className="materials-modal-overlay"

      onClick={onClose}

      role="presentation"

    >

      <div

        className="materials-modal materials-modal--edit"

        onClick={(e) => e.stopPropagation()}

        role="dialog"

        aria-modal="true"

        aria-labelledby="edit-work-modal-title"

      >

        <header className="materials-modal__header">

          <div className="materials-modal__header-text">

            <span className="materials-modal__badge">Смета</span>

            <h2 id="edit-work-modal-title" className="materials-modal__title">

              Редактировать работу

            </h2>

            <p className="materials-modal__subtitle">

              {work.workDescription

                ? `${work.workDescription} · позиция #${work.id}`

                : `Позиция #${work.id}`}

            </p>

          </div>

          <button

            type="button"

            className="materials-modal__close"

            onClick={onClose}

            aria-label="Закрыть"

            disabled={isSaving}

          >

            ×

          </button>

        </header>



        <div className="materials-modal__body">

          <section className="materials-modal__card">

            <h3 className="materials-modal__section-title">Параметры работы</h3>

            <div className="materials-modal__form">

              <label className="materials-modal__field">

                <span className="materials-modal__label">Наименование</span>

                <input

                  type="text"

                  className="materials-modal__input"

                  value={editedWork.workDescription}

                  onChange={(e) =>

                    handleChange("workDescription", e.target.value)

                  }

                  placeholder="Название работы"

                />

              </label>



              <div className="materials-modal__form-row">

                <label className="materials-modal__field">

                  <span className="materials-modal__label">Количество</span>

                  <input

                    type="text"

                    className="materials-modal__input"

                    value={editedWork.workQuantity}

                    onChange={(e) =>

                      handleChange("workQuantity", e.target.value)

                    }

                    onKeyDown={handleKeyDown}

                    placeholder="0.00"

                  />

                </label>

                <label className="materials-modal__field">

                  <span className="materials-modal__label">Ед. изм.</span>

                  <input

                    type="text"

                    className="materials-modal__input"

                    value={editedWork.workUnit}

                    onChange={(e) => handleChange("workUnit", e.target.value)}

                    placeholder="м², шт, кг..."

                  />

                </label>

              </div>



              <div className="materials-modal__form-row">

                <label className="materials-modal__field">

                  <span className="materials-modal__label">

                    Цена за ед. ({resolvedCurrency})

                  </span>

                  <input

                    type="text"

                    className="materials-modal__input"

                    value={editedWork.workPricePerUnit}

                    onChange={(e) =>

                      handleChange("workPricePerUnit", e.target.value)

                    }

                    onKeyDown={handleKeyDown}

                    placeholder="0.00"

                  />

                </label>

                <label className="materials-modal__field">

                  <span className="materials-modal__label">Валюта сметы</span>

                  <span className="estimate-currency-readonly">

                    {resolvedCurrency}

                  </span>

                </label>

              </div>

            </div>



            <div className="materials-modal__preview">

              <span className="materials-modal__preview-label">

                Сумма по позиции

              </span>

              <span className="materials-modal__preview-value">

                {formatMoney(lineTotal, resolvedCurrency)}

              </span>

            </div>

          </section>

        </div>



        <footer className="materials-modal__footer materials-modal__footer--actions">

          <button

            type="button"

            className="materials-modal__btn-secondary"

            onClick={onClose}

            disabled={isSaving}

          >

            Отмена

          </button>

          <button

            type="button"

            className="materials-modal__btn-primary materials-modal__btn-primary--inline"

            onClick={handleSave}

            disabled={isSaving}

          >

            {isSaving ? "Сохранение…" : "Сохранить"}

          </button>

        </footer>

      </div>

    </div>

  );

}

