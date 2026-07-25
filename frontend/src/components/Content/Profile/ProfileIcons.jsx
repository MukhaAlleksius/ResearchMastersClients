import React from "react";

const base = {
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

function Svg({ children, className, ...props }) {
  return (
    <svg {...base} className={className} {...props}>
      {children}
    </svg>
  );
}

export function IconUser(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5 20.5c0-3.6 3.1-6 7-6s7 2.4 7 6" />
    </Svg>
  );
}

export function IconDoc(props) {
  return (
    <Svg {...props}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </Svg>
  );
}

export function IconImage(props) {
  return (
    <Svg {...props}>
      <rect x="3" y="5" width="18" height="14" rx="1.5" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="m21 15-4.5-4.5L6 21" />
    </Svg>
  );
}

export function IconStar(props) {
  return (
    <Svg {...props}>
      <path d="m12 3 2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15.9 7.2 18l.9-5.4L4.2 8.7l5.4-.8L12 3Z" />
    </Svg>
  );
}

export function IconPin(props) {
  return (
    <Svg {...props}>
      <path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.25" />
    </Svg>
  );
}

export function IconMap(props) {
  return (
    <Svg {...props}>
      <path d="m3 7 6-3 6 3 6-3v13l-6 3-6-3-6 3V7Z" />
      <path d="M9 4v13M15 7v13" />
    </Svg>
  );
}

export function IconBuilding(props) {
  return (
    <Svg {...props}>
      <path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16" />
      <path d="M14 10h5a1 1 0 0 1 1 1v10" />
      <path d="M8 8h2M8 12h2M8 16h2M4 21h16" />
    </Svg>
  );
}

export function IconCalendar(props) {
  return (
    <Svg {...props}>
      <rect x="3" y="5" width="18" height="16" rx="1.5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </Svg>
  );
}

export function IconPhone(props) {
  return (
    <Svg {...props}>
      <path d="M8.5 3.5h2.2l1.1 4.2-1.8 1.1a12 12 0 0 0 5.2 5.2l1.1-1.8 4.2 1.1v2.2a2 2 0 0 1-2.1 2A15.5 15.5 0 0 1 3.5 5.6a2 2 0 0 1 2-2.1Z" />
    </Svg>
  );
}

export function IconSend(props) {
  return (
    <Svg {...props}>
      <path d="m4 11 16-7-7 16-2.3-6.7L4 11Z" />
    </Svg>
  );
}

export function IconGlobe(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </Svg>
  );
}

export function IconContact(props) {
  return (
    <Svg {...props}>
      <rect x="4" y="4" width="16" height="16" rx="1.5" />
      <circle cx="10" cy="10" r="2" />
      <path d="M7 16c0-1.7 1.3-3 3-3s3 1.3 3 3M15 9h3M15 13h3" />
    </Svg>
  );
}

export function IconBriefcase(props) {
  return (
    <Svg {...props}>
      <rect x="3" y="7" width="18" height="13" rx="1.5" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
      <path d="M3 12h18" />
    </Svg>
  );
}

export function IconCheck(props) {
  return (
    <Svg {...props}>
      <path d="M20 6 9 17l-5-5" />
    </Svg>
  );
}

export function IconClock(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Svg>
  );
}

export function IconEye(props) {
  return (
    <Svg {...props}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.5" />
    </Svg>
  );
}

export function IconSearch(props) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </Svg>
  );
}

export function IconEdit(props) {
  return (
    <Svg {...props}>
      <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
      <path d="m13.5 6.5 3 3" />
    </Svg>
  );
}

export function IconSettings(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Svg>
  );
}

export function IconGrid(props) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1" />
    </Svg>
  );
}

export function IconCircle(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="7.5" />
    </Svg>
  );
}

export function IconChat(props) {
  return (
    <Svg {...props}>
      <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3h9A2.5 2.5 0 0 1 19 5.5v7A2.5 2.5 0 0 1 16.5 15H10l-4 4v-4H7.5A2.5 2.5 0 0 1 5 12.5v-7Z" />
    </Svg>
  );
}

export function IconContract(props) {
  return (
    <Svg {...props}>
      <path d="M8 3h8a2 2 0 0 1 2 2v14l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2-2 1.2V5a2 2 0 0 1 2-2Z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </Svg>
  );
}

export function IconCard(props) {
  return (
    <Svg {...props}>
      <rect x="2.5" y="5.5" width="19" height="13" rx="1.5" />
      <path d="M2.5 10h19M6.5 15h3M12 15h2.5" />
    </Svg>
  );
}

export function IconClose(props) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

export function IconAlert(props) {
  return (
    <Svg {...props}>
      <path d="M12 3.5 21 19H3L12 3.5Z" />
      <path d="M12 10v4M12 16.5h.01" />
    </Svg>
  );
}

export function IconReply(props) {
  return (
    <Svg {...props}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 6 6v2" />
    </Svg>
  );
}

export function IconMail(props) {
  return (
    <Svg {...props}>
      <rect x="3" y="5" width="18" height="14" rx="1.5" />
      <path d="m4 8 8 5 8-5" />
    </Svg>
  );
}

export function IconMenu(props) {
  return (
    <Svg {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  );
}

export function IconInbox(props) {
  return (
    <Svg {...props}>
      <path d="M4 8.5 5.5 4h13L20 8.5" />
      <path d="M4 8.5h4.5a3.5 3.5 0 0 0 7 0H20V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8.5Z" />
    </Svg>
  );
}

export function IconTag(props) {
  return (
    <Svg {...props}>
      <path d="M3 12V4.5A1.5 1.5 0 0 1 4.5 3H12l9 9-7.5 7.5L3 12Z" />
      <circle cx="7.5" cy="7.5" r="1.25" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconClipboard(props) {
  return (
    <Svg {...props}>
      <path d="M9 4.5h6a1 1 0 0 1 1 1V6h1.5A1.5 1.5 0 0 1 19 7.5v12A1.5 1.5 0 0 1 17.5 21h-11A1.5 1.5 0 0 1 5 19.5v-12A1.5 1.5 0 0 1 6.5 6H8V5.5a1 1 0 0 1 1-1Z" />
      <path d="M9 6h6V5.5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0-.5.5V6Z" />
      <path d="M8 11h8M8 15h5" />
    </Svg>
  );
}

export function IconProgress(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 9 9" />
    </Svg>
  );
}

export function IconTarget(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none" />
    </Svg>
  );
}

const STATUS_ICONS = {
  check: IconCheck,
  clock: IconClock,
  eye: IconEye,
  search: IconSearch,
  edit: IconEdit,
  settings: IconSettings,
  grid: IconGrid,
  circle: IconCircle,
  progress: IconProgress,
};

export function StatusIcon({ name, ...props }) {
  const Icon = STATUS_ICONS[name] || IconCircle;
  return <Icon width={14} height={14} {...props} />;
}

const FILTER_ICONS = {
  completed: IconCheck,
  inProgress: IconProgress,
  awaiting: IconClock,
  considerationCustomer: IconEye,
  offersCustomers: IconMail,
  myselfExecutor: IconSettings,
  graphicOrders: IconGrid,
  researchExecutor: IconSearch,
  waitOfferExecutors: IconEdit,
  all: IconMenu,
};

export function StatusFilterIcon({ name, ...props }) {
  const Icon = FILTER_ICONS[name] || IconCircle;
  return <Icon width={16} height={16} {...props} />;
}

const WORK_TAB_ICONS = {
  schedule: IconGrid,
  graphicWorks: IconGrid,
  chat: IconChat,
  customerInfo: IconUser,
  executorInfo: IconUser,
  orderInfo: IconDoc,
  customerExecutorContract: IconContract,
  payment: IconCard,
  executorCancelOrder: IconClose,
  customerCancelOrder: IconClose,
  complaints: IconAlert,
  commentsRating: IconStar,
  orderResponesExecutors: IconReply,
  estimateWorks: IconDoc,
  estimate: IconDoc,
};

export function WorkDetailTabIcon({ id, className = "work-detail__tab-svg", ...props }) {
  const Icon = WORK_TAB_ICONS[id] || IconCircle;
  return <Icon className={className} width={14} height={14} {...props} />;
}

export function contactTypeIcon(type) {
  const t = (type || "").toLowerCase();
  if (t.includes("телефон") || t.includes("whatsapp")) return <IconPhone />;
  if (t.includes("телеграм")) return <IconSend />;
  if (t.includes("сайт")) return <IconGlobe />;
  return <IconContact />;
}
