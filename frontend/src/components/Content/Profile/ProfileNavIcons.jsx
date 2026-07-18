import React from "react";

const svgProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

const ICONS = {
  main_page: (
    <svg {...svgProps}>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
    </svg>
  ),
  orders: (
    <svg {...svgProps}>
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <path d="M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2Z" />
      <path d="M9 12h6M9 16h6" />
    </svg>
  ),
  my_executors: (
    <svg {...svgProps}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3 3.5-5 6-5s6 2 6 5" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M14 20c0-2.2 2-3.5 3.5-3.5S21 17.8 21 20" />
    </svg>
  ),
  services: (
    <svg {...svgProps}>
      <path d="M10 2h4a2 2 0 0 1 2 2v1h3a1 1 0 0 1 1 1v3a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V6a1 1 0 0 1 1-1h3V4a2 2 0 0 1 2-2Z" />
      <path d="M8 14v6M12 14v6M16 14v6" />
    </svg>
  ),
  my_customers: (
    <svg {...svgProps}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6" />
      <path d="M18 4v4M16 6h4" />
    </svg>
  ),
  specialization: (
    <svg {...svgProps}>
      <path d="M12 2 15 8l6.5 1-4.5 4.2 1.2 6.3L12 17.8 5.8 19.5 7 13.2 2.5 9 9 8 12 2Z" />
    </svg>
  ),
  executor: (
    <svg {...svgProps}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6" />
    </svg>
  ),
  portfolio: (
    <svg {...svgProps}>
      <path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z" />
      <path d="M4 9h16M9 5v2M15 5v2" />
      <path d="M8 14h8M8 17h5" />
    </svg>
  ),
  analytics: (
    <svg {...svgProps}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  ),
  executor_bank_account: (
    <svg {...svgProps}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18M7 15h2M11 15h2" />
    </svg>
  ),
  administrator: (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
};

export default function ProfileNavIcon({ id }) {
  return ICONS[id] || null;
}
