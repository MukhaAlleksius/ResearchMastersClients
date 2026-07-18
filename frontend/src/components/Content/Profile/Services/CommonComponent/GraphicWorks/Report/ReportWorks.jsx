import React, { useMemo, useState } from "react";

import WorkPeriodChart from "./ChatWorks/ChartWorks";

import ReportTablePanel from "./ReportTablePanel";
import { formatMoney } from "../../../../../../../utils/currency";

import { useWorksReportData } from "./useWorksReportData";

import "./report_works.css";



export default function ReportWorks({ orderId }) {

  const [reportTab, setReportTab] = useState("table");

  const { tableData, currency, loading } = useWorksReportData(orderId);



  const workOptions = useMemo(

    () =>

      Array.from(new Set(tableData.map((row) => row.workName)))

        .filter(Boolean)

        .map((workName) => {

          const rows = tableData.filter((r) => r.workName === workName);

          const totalQuantity = rows.reduce((s, r) => s + r.totalQuantity, 0);

          const totalEarned = rows.reduce((s, r) => s + r.earned, 0);

          const unit = rows[0]?.unit || "";

          return {

            value: workName,

            label: `${workName} · ${totalQuantity.toFixed(2)} ${unit} · ${formatMoney(totalEarned, currency)}`,

          };

        })

        .sort((a, b) => a.value.localeCompare(b.value)),

    [tableData, currency],

  );



  const chartWorkOptions = useMemo(

    () =>

      Array.from(new Set(tableData.map((r) => r.workName)))

        .filter(Boolean)

        .map((name) => ({ value: name, label: name }))

        .sort((a, b) => a.label.localeCompare(b.label)),

    [tableData],

  );



  if (!orderId) {

    return (

      <div className="rw-report">

        <div className="rw-report__empty">Заказ не выбран</div>

      </div>

    );

  }



  return (

    <div className="rw-report">

      <header className="rw-report__header">

        <div>

          <h2 className="rw-report__title">Отчёт по работам</h2>

          <p className="rw-report__subtitle">

            {reportTab === "table"

              ? "Объёмы выполненных работ и заработок по смете"

              : "Динамика выполнения по выбранной работе"}

          </p>

        </div>

      </header>

      <div className="rw-report__tabs">

        <button

          type="button"

          className={`rw-report__tab ${reportTab === "table" ? "rw-report__tab--active" : ""}`}

          onClick={() => setReportTab("table")}

        >

          Таблица

        </button>

        <button

          type="button"

          className={`rw-report__tab ${reportTab === "chart" ? "rw-report__tab--active" : ""}`}

          onClick={() => setReportTab("chart")}

        >

          График

        </button>

      </div>



      <div className="rw-report__body">

        {reportTab === "table" ? (

          <ReportTablePanel

            tableData={tableData}

            workOptions={workOptions}

            currency={currency}

            loading={loading}

          />

        ) : (

          <WorkPeriodChart

            workData={tableData}

            workOptions={chartWorkOptions}

            currency={currency}

            loading={loading}

          />

        )}

      </div>
    </div>

  );

}

