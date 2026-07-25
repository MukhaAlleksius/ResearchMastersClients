import React from "react";

const svgProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

const ICONS = {
  main_page: (
    <svg {...svgProps}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h4.5v-6h3v6H18a1 1 0 0 0 1-1V9.5" />
    </svg>
  ),
  orders: (
    <svg {...svgProps}>
      <path d="M8 6H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2" />
      <rect x="8" y="2" width="8" height="6" rx="1" />
      <path d="M8 13h8M8 17h5" />
    </svg>
  ),
  my_executors: (
    <svg {...svgProps}>
      <circle cx="9" cy="7.5" r="2.75" />
      <path d="M3.5 19.5c0-2.9 2.5-5 5.5-5s5.5 2.1 5.5 5" />
      <circle cx="16.5" cy="8.5" r="2.25" />
      <path d="M14 19.5c.2-1.8 1.7-3.2 3.5-3.5 1.4.2 2.6 1 3.2 2.2" />
    </svg>
  ),
  services: (
    <svg {...svgProps}>
      <path d="M14.5 4.5 19.5 9.5" />
      <path d="M16.8 2.2a2.1 2.1 0 0 1 3 3L9.2 15.8 5 17l1.2-4.2L16.8 2.2Z" />
      <path d="M3 21h18" />
    </svg>
  ),
  my_customers: (
    <svg {...svgProps}>
      <path d="M16 11.5a3.5 3.5 0 1 0-6.3-2.1" />
      <circle cx="9" cy="8" r="3" />
      <path d="M2.5 20c0-3 2.9-5.2 6.5-5.2 1.1 0 2.1.2 3 .6" />
      <path d="M17 14v6M14 17h6" />
    </svg>
  ),
  specialization: (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  ),
  executor: (
    <svg {...svgProps}>
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5 20.5c0-3.6 3.1-6 7-6s7 2.4 7 6" />
    </svg>
  ),
  portfolio: (
    <svg {...svgProps}>
      <rect x="3" y="7" width="18" height="13" rx="1.5" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
      <path d="M3 12h18" />
      <path d="M10 12v1.5a2 2 0 0 0 4 0V12" />
    </svg>
  ),
  analytics: (
    <svg {...svgProps}>
      <path d="M4 19V9M10 19V5M16 19v-6M22 19H2" />
    </svg>
  ),
  executor_bank_account: (
    <svg {...svgProps}>
      <rect x="2.5" y="5.5" width="19" height="13" rx="1.5" />
      <path d="M2.5 10h19" />
      <path d="M6.5 15h3M12 15h2.5" />
    </svg>
  ),
  administrator: (
    <svg {...svgProps}>
      <path d="M12 3 4.5 6.5v4.2c0 4.6 3.2 8.9 7.5 10.3 4.3-1.4 7.5-5.7 7.5-10.3V6.5L12 3Z" />
      <path d="M9.5 12.2 11.2 14l3.5-4" />
    </svg>
  ),
};

export default function ProfileNavIcon({ id }) {
  return ICONS[id] || null;
}
