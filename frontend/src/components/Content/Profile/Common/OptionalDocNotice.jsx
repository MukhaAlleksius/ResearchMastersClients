import "./optional_doc_notice.css";

const MESSAGES = {
  estimate:
    "Смету составлять необязательно. Если вы уже договорились о цене или она вам не нужна — можно работать без неё.",
  contract:
    "Договор составлять необязательно. Если цена и условия уже согласованы, можно обойтись без него.",
  schedule:
    "График работ вести необязательно. Если не нужно отмечать выполнение по датам, можно обойтись без него.",
};

export default function OptionalDocNotice({ kind = "estimate", tight = false }) {
  const text = MESSAGES[kind] || MESSAGES.estimate;

  return (
    <div
      className={`optional-doc-notice${tight ? " optional-doc-notice--tight" : ""}`}
      role="note"
    >
      <svg
        className="optional-doc-notice__icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5" strokeLinecap="round" />
        <circle cx="12" cy="8" r="0.8" fill="currentColor" stroke="none" />
      </svg>
      <p className="optional-doc-notice__text">{text}</p>
    </div>
  );
}
