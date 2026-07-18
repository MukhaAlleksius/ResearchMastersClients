/**
 * Реквизиты и контакты для юридических документов.
 * Перед подключением WebPay заполните поля совместно с юристом.
 */
export const LEGAL = {
  siteName: "Fixer",
  companyName: "ООО «__________»",
  unp: "000000000",
  legalAddress: "220000, г. Минск, ул. __________, д. __",
  postalAddress: "220000, г. Минск, ул. __________, д. __",
  email: "support@fixer.by",
  phone: "+375 (__) ___-__-__",
  director: "________________",
  bankName: "________________",
  bankBic: "________",
  bankAccount: "BY__ _________________________",
  siteUrl: "https://fixer.by",
  commissionPercent: 10,
  /** Дата редакции документов (отображается на страницах) */
  documentDate: "5 июля 2026 г.",
};

export const LEGAL_LINKS = [
  { path: "/legal/terms", label: "Пользовательское соглашение" },
  { path: "/legal/privacy", label: "Политика конфиденциальности" },
  { path: "/legal/payment", label: "Оплата и возврат" },
  { path: "/legal/requisites", label: "Реквизиты" },
];
