import React, { useMemo } from "react";
import { computeEarnings, formatMoney } from "./reportUtils";
import "./report_works.css";

export default function ReportSummaryCards({
  rows = [],
  currency = "BYN",
  loading = false,
}) {
  const summary = useMemo(
    () => computeEarnings(rows, currency),
    [rows, currency],
  );

  const workBreakdown = useMemo(
    () =>
      [...summary.breakdown].sort((a, b) =>
        a.name.localeCompare(b.name, "ru"),
      ),
    [summary.breakdown],
  );

  if (loading) {
    return (
      <div className="rw-report__summary-footer rw-report__summary-footer--loading">
        <div className="rw-report__stat rw-report__stat--highlight">
          <span className="rw-report__stat-label">Загрузка</span>
          <span className="rw-report__stat-value">…</span>
        </div>
      </div>
    );
  }

  if (workBreakdown.length === 0) {
    return null;
  }

  return (
    <div className="rw-report__summary-footer">
      <div className="rw-report__work-cards">
        <div className="rw-report__work-card rw-report__work-card--total">
          <span className="rw-report__work-card-name">Общий заработок</span>
          <span className="rw-report__work-card-qty rw-report__work-card-qty--money">
            {formatMoney(summary.totalEarned, currency)}
          </span>
        </div>

        {workBreakdown.map((work) => (
          <div key={work.name} className="rw-report__work-card">
            <span className="rw-report__work-card-name">{work.name}</span>
            <span className="rw-report__work-card-qty">
              {work.quantity.toFixed(2)} {work.unit || "ед."}
            </span>
            <span className="rw-report__work-card-earned">
              {formatMoney(work.earned, currency)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
