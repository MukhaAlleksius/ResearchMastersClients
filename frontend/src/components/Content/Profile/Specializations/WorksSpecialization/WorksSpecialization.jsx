import React, { useEffect, useRef } from "react";
import { API, apiFetch, buildApiUrl } from "../../../../../utils/api.js";
import {
  createMoneyAnchor,
  formatMoney,
  normalizeCurrencyCode,
} from "../../../../../utils/currency";
import { useNbrbRates } from "../../../../../hooks/useNbrbRates";
import "../specializations.css";
export default function WorksSpecialization({ category_work_id, currency = "BYN" }) {

  const [works, setWorks] = React.useState([]);

  const [worksMaster, setWorksMaster] = React.useState([]);

  const [loading, setLoading] = React.useState(true);

  const catalogAnchorsRef = useRef(new Map());

  const { rates } = useNbrbRates();

  const displayCurrency = normalizeCurrencyCode(currency);



  useEffect(() => {

    const load = async () => {

      setLoading(true);

      try {

        await fetchWorksForCategoryWork(category_work_id);

        await fetchWorksMaster();

      } finally {

        setLoading(false);

      }

    };

    load();

  }, [category_work_id]);



  useEffect(() => {

    const map = new Map();

    works.forEach((work) => {

      map.set(

        work.work_id,

        createMoneyAnchor(work.cost, work.currency || "BYN"),

      );

    });

    catalogAnchorsRef.current = map;

  }, [works]);



  const fetchWorksForCategoryWork = async (catId) => {

    const response = await apiFetch(

      buildApiUrl(`/works_for_category_work/${catId}`),

    );

    if (!response.ok) throw new Error("Не получили данных");

    setWorks(await response.json());

  };



  const fetchWorksMaster = async () => {

    const master_id = localStorage.getItem("user_id");

    if (!master_id) {

      setWorksMaster([]);

      return;

    }

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

    setWorksMaster([...admin, ...myself]);

  };



  const getDisplayCost = (work) => {

    const anchor = catalogAnchorsRef.current.get(work.work_id);

    if (anchor && rates) {

      return anchor.priceForCurrency(displayCurrency, rates);

    }

    return Number(work.cost || 0);

  };



  const handleAddMyselfWork = async (e, work) => {

    e.preventDefault();

    try {

      const master_id = localStorage.getItem("user_id");

      const anchor = catalogAnchorsRef.current.get(work.work_id);

      let costToSave = Number(work.cost || 0);

      if (anchor && rates) {

        costToSave = anchor.priceForCurrency(displayCurrency, rates);

      }



      const response = await apiFetch(

        buildApiUrl("/add_work_master_from_admin"),

        {

          method: "POST",

          headers: { "Content-Type": "application/json" },

          body: JSON.stringify({

            master_id,

            work_id: work.work_id,

            cost: costToSave,

            currency: displayCurrency,

          }),

        },

      );

      if (!response.ok) throw new Error("Ошибка");

      await fetchWorksMaster();

    } catch (error) {

      console.error(error);

      alert("Не удалось добавить работу");

    }

  };



  if (loading) {

    return <div className="spec-empty">Загрузка каталога работ…</div>;

  }



  if (works.length === 0) {

    return (

      <div className="spec-empty">

        В этой категории пока нет работ в общем каталоге.

      </div>

    );

  }



  return (

    <div>

      <div className="spec-section-head">

        <h3>Работы из каталога</h3>

        <span className="spec-badge">{works.length} позиций</span>

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

              <th>Действие</th>

            </tr>

          </thead>

          <tbody>

            {works.map((work) => {

              const { work_id, name_work, unit_measurement } = work;

              const isAdded = worksMaster.some((m) => m.work_id === work_id);

              return (

                <tr key={work_id}>

                  <td>{name_work}</td>

                  <td className="spec-table__num">

                    {formatMoney(getDisplayCost(work), displayCurrency)}

                  </td>

                  <td>{unit_measurement}</td>

                  <td>

                    {isAdded ? (

                      <span

                        className="spec-pill"

                        style={{ fontSize: "0.6875rem" }}

                      >

                        <i className="fas fa-check" aria-hidden="true" /> В

                        списке

                      </span>

                    ) : (

                      <button

                        type="button"

                        className="spec-btn spec-btn--sm spec-btn--success"

                        disabled={!rates}

                        onClick={(e) => handleAddMyselfWork(e, work)}

                      >

                        Добавить

                      </button>

                    )}

                  </td>

                </tr>

              );

            })}

          </tbody>

        </table>

      </div>

    </div>

  );

}

