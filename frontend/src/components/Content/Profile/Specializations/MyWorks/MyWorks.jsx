import React, { useEffect, useRef, useState } from "react";
import { API, apiFetch, buildApiUrl } from "../../../../../utils/api.js";
import SpecModal from "../SpecModal";
import {
  createMoneyAnchor,
  formatMoney,
  formatMoneyInput,
  normalizeCurrencyCode,
} from "../../../../../utils/currency";
import { useNbrbRates } from "../../../../../hooks/useNbrbRates";
import "../specializations.css";
const unitOptions = ["шт", "м", "м²", "м³", "кг", "т"];



function rebuildMasterWorkAnchors(adminWorks, myselfWorks) {

  const map = new Map();

  adminWorks.forEach((work) => {

    map.set(

      `admin-${work.work_master_from_admin_id}`,

      createMoneyAnchor(work.cost, work.currency || "BYN"),

    );

  });

  myselfWorks.forEach((work) => {

    map.set(

      `myself-${work.work_master_myself_id}`,

      createMoneyAnchor(work.cost, work.currency || "BYN"),

    );

  });

  return map;

}



export default function MyWorks({ category_work_id, currency = "BYN" }) {

  const [worksMasterFromAdmin, setWorksMasterFromAdmin] = useState([]);

  const [worksMasterMyself, setWorksMasterMyself] = useState([]);

  const [loading, setLoading] = useState(true);

  const [addModalOpen, setAddModalOpen] = useState(false);

  const [editModalOpen, setEditModalOpen] = useState(false);

  const [editWorkFromAdmin, setEditWorkFromAdmin] = useState(null);

  const [editWorkMyself, setEditWorkMyself] = useState(null);

  const [newWork, setNewWork] = useState({

    title: "",

    price: "",

    unit: "шт",

    customUnit: "",

  });



  const priceAnchorsRef = useRef(new Map());

  const newWorkPriceAnchorRef = useRef(null);

  const { rates } = useNbrbRates();

  const displayCurrency = normalizeCurrencyCode(currency);



  useEffect(() => {

    fetchWorksMaster();

  }, [category_work_id]);



  useEffect(() => {

    if (!newWorkPriceAnchorRef.current || !rates) return;

    setNewWork((prev) => ({

      ...prev,

      price: formatMoneyInput(

        newWorkPriceAnchorRef.current.priceForCurrency(displayCurrency, rates),

      ),

    }));

  }, [displayCurrency, rates]);



  const fetchWorksMaster = async () => {

    const master_id = localStorage.getItem("user_id");

    if (!master_id) {

      setWorksMasterFromAdmin([]);

      setWorksMasterMyself([]);

      setLoading(false);

      return;

    }

    setLoading(true);

    try {

      const [adminRes, myselfRes] = await Promise.all([

        apiFetch(

          buildApiUrl(`/works_master_from_admin/${master_id}/${category_work_id}`),

        ),

        apiFetch(

          buildApiUrl(`/works_master_myself/${master_id}/${category_work_id}`),

        ),

      ]);

      const admin = adminRes.ok ? await adminRes.json() : [];

      const myself = myselfRes.ok ? await myselfRes.json() : [];

      setWorksMasterFromAdmin(admin);

      setWorksMasterMyself(myself);

      priceAnchorsRef.current = rebuildMasterWorkAnchors(admin, myself);

    } catch (error) {

      console.error(error);

      setWorksMasterFromAdmin([]);

      setWorksMasterMyself([]);

      priceAnchorsRef.current = new Map();

    } finally {

      setLoading(false);

    }

  };



  const getDisplayCost = (work, type) => {

    const idKey =

      type === "admin"

        ? work.work_master_from_admin_id

        : work.work_master_myself_id;

    const anchor = priceAnchorsRef.current.get(`${type}-${idKey}`);

    if (anchor && rates) {

      return anchor.priceForCurrency(displayCurrency, rates);

    }

    return Number(work.cost || 0);

  };



  const handleNewWorkChange = (e) => {

    const { name, value } = e.target;

    if (name === "price") {

      setNewWork((prev) => ({ ...prev, price: value }));

      const amount = Number(value);

      if (value !== "" && Number.isFinite(amount)) {

        newWorkPriceAnchorRef.current = createMoneyAnchor(amount, displayCurrency);

      } else {

        newWorkPriceAnchorRef.current = null;

      }

      return;

    }

    setNewWork((prev) => ({ ...prev, [name]: value }));

  };



  const resetAddForm = () => {

    newWorkPriceAnchorRef.current = null;

    setNewWork({ title: "", price: "", unit: "шт", customUnit: "" });

  };



  const handleAddWorkMasterMyself = async (e) => {

    e.preventDefault();

    if (!newWork.title.trim() || !newWork.price.toString().trim()) {

      alert("Укажите название и цену");

      return;

    }

    const master_id = localStorage.getItem("user_id");

    const unit = newWork.customUnit.trim() || newWork.unit;

    const response = await apiFetch(

      buildApiUrl("/add_work_master_myself"),

      {

        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({

          master_id,

          category_work_id,

          name_work: newWork.title.trim(),

          cost: Number(newWork.price),

          currency: displayCurrency,

          unit_measurement: unit,

        }),

      },

    );

    if (!response.ok) {

      alert("Ошибка при добавлении");

      return;

    }

    await fetchWorksMaster();

    resetAddForm();

    setAddModalOpen(false);

  };



  const openEditAdminModal = (work) => {

    const displayCost = getDisplayCost(work, "admin");

    setEditWorkFromAdmin({

      ...work,

      cost: displayCost,

    });

    setEditWorkMyself(null);

    setEditModalOpen(true);

  };



  const openEditMyselfModal = (work) => {

    const displayCost = getDisplayCost(work, "myself");

    setEditWorkMyself({

      ...work,

      cost: displayCost,

    });

    setEditWorkFromAdmin(null);

    setEditModalOpen(true);

  };



  const handleSaveEditWorkFromAdmin = async (e) => {

    e.preventDefault();

    const master_id = localStorage.getItem("user_id");

    try {

      const response = await apiFetch(

        buildApiUrl("/change_work_master_from_admin"),

        {

          method: "PUT",

          headers: { "Content-Type": "application/json" },

          body: JSON.stringify({

            master_id,

            work_master_from_admin_id:

              editWorkFromAdmin.work_master_from_admin_id,

            cost: Number(editWorkFromAdmin.cost),

            currency: displayCurrency,

          }),

        },

      );

      if (!response.ok) throw new Error();

      priceAnchorsRef.current.set(

        `admin-${editWorkFromAdmin.work_master_from_admin_id}`,

        createMoneyAnchor(editWorkFromAdmin.cost, displayCurrency),

      );

      await fetchWorksMaster();

      setEditModalOpen(false);

      setEditWorkFromAdmin(null);

    } catch {

      alert("Не удалось сохранить");

    }

  };



  const handleSaveEditWorkMyself = async (e) => {

    e.preventDefault();

    const master_id = localStorage.getItem("user_id");

    try {

      const response = await apiFetch(

        buildApiUrl("/change_work_master_myself"),

        {

          method: "PUT",

          headers: { "Content-Type": "application/json" },

          body: JSON.stringify({

            master_id,

            category_work_id,

            work_master_myself_id: editWorkMyself.work_master_myself_id,

            name_work: editWorkMyself.name_work,

            unit_measurement: editWorkMyself.unit_measurement,

            cost: Number(editWorkMyself.cost),

            currency: displayCurrency,

          }),

        },

      );

      if (!response.ok) throw new Error();

      priceAnchorsRef.current.set(

        `myself-${editWorkMyself.work_master_myself_id}`,

        createMoneyAnchor(editWorkMyself.cost, displayCurrency),

      );

      await fetchWorksMaster();

      setEditModalOpen(false);

      setEditWorkMyself(null);

    } catch {

      alert("Не удалось сохранить");

    }

  };



  const handleDeleteWorkFromAdmin = async (id) => {

    if (!window.confirm("Удалить эту работу?")) return;

    const response = await apiFetch(

      buildApiUrl(`/delete_work_master_from_admin/${id}`),

      { method: "DELETE" },

    );

    if (response.ok) await fetchWorksMaster();

  };



  const handleDeleteWorkMyself = async (id) => {

    if (!window.confirm("Удалить эту работу?")) return;

    const response = await apiFetch(

      buildApiUrl(`/delete_work_master_myself/${id}`),

      { method: "DELETE" },

    );

    if (response.ok) await fetchWorksMaster();

  };



  const totalCount = worksMasterFromAdmin.length + worksMasterMyself.length;



  const addModal = (

    <SpecModal

      open={addModalOpen}

      onClose={() => {

        setAddModalOpen(false);

        resetAddForm();

      }}

      title="Новая работа"

    >

      <AddWorkForm

        newWork={newWork}

        currency={displayCurrency}

        onChange={handleNewWorkChange}

        onSubmit={handleAddWorkMasterMyself}

      />

    </SpecModal>

  );



  if (loading) {

    return <div className="spec-empty">Загрузка ваших работ…</div>;

  }



  if (totalCount === 0) {

    return (

      <>

        <div className="spec-empty">

          У вас пока нет своих работ в этой специализации.

        </div>

        <button

          type="button"

          className="spec-btn spec-btn--primary"

          style={{ marginTop: 12, background: "#2563eb", color: "#fff" }}

          onClick={() => setAddModalOpen(true)}

        >

          <i className="fas fa-plus" aria-hidden="true" />

          Добавить работу

        </button>

        {addModal}

      </>

    );

  }



  return (

    <div>

      <div className="spec-section-head">

        <h3>Мои работы</h3>

        <button

          type="button"

          className="spec-btn spec-btn--primary"

          style={{ background: "#2563eb", color: "#fff" }}

          onClick={() => setAddModalOpen(true)}

        >

          <i className="fas fa-plus" aria-hidden="true" />

          Добавить

        </button>

      </div>

      {!rates && (

        <p className="spec-currency-hint">Загрузка курсов валют…</p>

      )}



      <div className="spec-table-wrap">

        <table className="spec-table">

          <thead>

            <tr>

              <th>Работа</th>

              <th className="spec-table__num">Цена ({displayCurrency})</th>

              <th>Ед.</th>

              <th>Тип</th>

              <th>Действия</th>

            </tr>

          </thead>

          <tbody>

            {worksMasterFromAdmin.map((w) => (

              <tr key={w.work_master_from_admin_id}>

                <td>{w.name_work}</td>

                <td className="spec-table__num">

                  {formatMoney(getDisplayCost(w, "admin"), displayCurrency)}

                </td>

                <td>{w.unit_measurement}</td>

                <td>

                  <span className="spec-badge">Каталог</span>

                </td>

                <td>

                  <div className="spec-table__actions">

                    <button

                      type="button"

                      className="spec-btn spec-btn--sm spec-btn--ghost"

                      onClick={() => openEditAdminModal(w)}

                    >

                      Изменить

                    </button>

                    <button

                      type="button"

                      className="spec-btn spec-btn--sm spec-btn--danger"

                      onClick={() =>

                        handleDeleteWorkFromAdmin(w.work_master_from_admin_id)

                      }

                    >

                      Удалить

                    </button>

                  </div>

                </td>

              </tr>

            ))}

            {worksMasterMyself.map((w) => (

              <tr key={w.work_master_myself_id}>

                <td>{w.name_work}</td>

                <td className="spec-table__num">

                  {formatMoney(getDisplayCost(w, "myself"), displayCurrency)}

                </td>

                <td>{w.unit_measurement}</td>

                <td>

                  <span className="spec-badge spec-badge--own">Своя</span>

                </td>

                <td>

                  <div className="spec-table__actions">

                    <button

                      type="button"

                      className="spec-btn spec-btn--sm spec-btn--ghost"

                      onClick={() => openEditMyselfModal(w)}

                    >

                      Изменить

                    </button>

                    <button

                      type="button"

                      className="spec-btn spec-btn--sm spec-btn--danger"

                      onClick={() =>

                        handleDeleteWorkMyself(w.work_master_myself_id)

                      }

                    >

                      Удалить

                    </button>

                  </div>

                </td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>



      {addModal}



      <SpecModal

        open={editModalOpen}

        onClose={() => {

          setEditModalOpen(false);

          setEditWorkFromAdmin(null);

          setEditWorkMyself(null);

        }}

        title="Редактирование работы"

      >

        {editWorkFromAdmin && (

          <EditAdminWorkForm

            work={editWorkFromAdmin}

            currency={displayCurrency}

            onChange={(e) => {

              const { name, value } = e.target;

              setEditWorkFromAdmin((p) => ({ ...p, [name]: value }));

            }}

            onSubmit={handleSaveEditWorkFromAdmin}

          />

        )}

        {editWorkMyself && (

          <EditWorkForm

            work={editWorkMyself}

            currency={displayCurrency}

            onChange={(e) => {

              const { name, value } = e.target;

              setEditWorkMyself((p) => ({ ...p, [name]: value }));

            }}

            onSubmit={handleSaveEditWorkMyself}

            fieldPrefix="myself"

          />

        )}

      </SpecModal>

    </div>

  );

}



function AddWorkForm({ newWork, currency, onChange, onSubmit }) {

  return (

    <form className="spec-modal-form" onSubmit={onSubmit}>

      <div className="spec-field">

        <label className="spec-label">Название</label>

        <input

          name="title"

          type="text"

          className="spec-input"

          placeholder="Название работы"

          value={newWork.title}

          onChange={onChange}

          required

        />

      </div>

      <div className="spec-row-2">

        <div className="spec-field">

          <label className="spec-label">Цена ({currency})</label>

          <input

            name="price"

            type="number"

            min="0"

            step="0.01"

            className="spec-input"

            value={newWork.price}

            onChange={onChange}

            required

          />

        </div>

        <div className="spec-field">

          <label className="spec-label">Валюта</label>

          <span className="spec-currency-readonly">{currency}</span>

        </div>

      </div>

      <div className="spec-row-2">

        <div className="spec-field">

          <label className="spec-label">Ед.</label>

          <select

            name="unit"

            className="spec-input"

            value={newWork.unit}

            onChange={onChange}

          >

            {unitOptions.map((opt) => (

              <option key={opt} value={opt}>

                {opt}

              </option>

            ))}

          </select>

        </div>

      </div>

      <div className="spec-field">

        <label className="spec-label">Своя единица (необяз.)</label>

        <input

          name="customUnit"

          type="text"

          className="spec-input"

          placeholder="Например: услуга"

          value={newWork.customUnit}

          onChange={onChange}

        />

      </div>

      <button type="submit" className="spec-btn spec-btn--primary">

        Добавить

      </button>

    </form>

  );

}



function EditAdminWorkForm({ work, currency, onChange, onSubmit }) {

  return (

    <form className="spec-modal-form" onSubmit={onSubmit}>

      <div className="spec-field">

        <label className="spec-label">Работа</label>

        <input

          type="text"

          className="spec-input"

          value={work.name_work}

          disabled

        />

      </div>

      <div className="spec-field">

        <label className="spec-label">Ед.</label>

        <input

          type="text"

          className="spec-input"

          value={work.unit_measurement}

          disabled

        />

      </div>

      <div className="spec-row-2">

        <div className="spec-field">

          <label className="spec-label">Цена ({currency})</label>

          <input

            name="cost"

            type="number"

            min="0"

            step="0.01"

            className="spec-input"

            value={work.cost}

            onChange={onChange}

            required

          />

        </div>

        <div className="spec-field">

          <label className="spec-label">Валюта</label>

          <span className="spec-currency-readonly">{currency}</span>

        </div>

      </div>

      <button type="submit" className="spec-btn spec-btn--primary">

        Сохранить

      </button>

    </form>

  );

}



function EditWorkForm({ work, currency, onChange, onSubmit, fieldPrefix }) {

  return (

    <form className="spec-modal-form" onSubmit={onSubmit}>

      <div className="spec-field">

        <label className="spec-label">Название</label>

        <input

          name="name_work"

          type="text"

          className="spec-input"

          value={work.name_work}

          onChange={onChange}

          required

        />

      </div>

      <div className="spec-row-2">

        <div className="spec-field">

          <label className="spec-label">Цена ({currency})</label>

          <input

            name="cost"

            type="number"

            min="0"

            step="0.01"

            className="spec-input"

            value={work.cost}

            onChange={onChange}

            required

          />

        </div>

        <div className="spec-field">

          <label className="spec-label">Валюта</label>

          <span className="spec-currency-readonly">{currency}</span>

        </div>

      </div>

      <div className="spec-field">

        <label className="spec-label">Ед.</label>

        <select

          name="unit_measurement"

          className="spec-input"

          value={work.unit_measurement}

          onChange={onChange}

        >

          {unitOptions.map((opt) => (

            <option key={`${fieldPrefix}-${opt}`} value={opt}>

              {opt}

            </option>

          ))}

        </select>

      </div>

      <button type="submit" className="spec-btn spec-btn--primary">

        Сохранить

      </button>

    </form>

  );

}

