/**
 * Modern Design System for Profile Components
 */

export const colors = {
  primary: "#667eea",
  primaryDark: "#764ba2",
  primaryLight: "#f093fb",

  success: "#22c55e",
  warning: "#f59e0b",
  danger: "#ef4444",
  info: "#3b82f6",

  gray50: "#f9fafb",
  gray100: "#f3f4f6",
  gray200: "#e5e7eb",
  gray300: "#d1d5db",
  gray500: "#6b7280",
  gray700: "#374151",
  gray900: "#1f2937",

  text: "#1f2937",
  textSecondary: "#6b7280",
  background: "#f8f9fa",
  surface: "#ffffff",
};

export const shadows = {
  sm: "0 1px 2px rgba(0, 0, 0, 0.05)",
  md: "0 4px 6px rgba(0, 0, 0, 0.1)",
  lg: "0 10px 15px rgba(0, 0, 0, 0.1)",
  xl: "0 20px 25px rgba(0, 0, 0, 0.1)",
};

export const spacing = {
  xs: "4px",
  sm: "8px",
  md: "12px",
  lg: "16px",
  xl: "24px",
  xxl: "32px",
};

export const borderRadius = {
  sm: "6px",
  md: "8px",
  lg: "12px",
  xl: "16px",
};

export const transitions = {
  default: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
  fast: "all 0.15s ease-in-out",
};

export const STATUS_TONES = {
  success: { variant: "success", bg: "#bbf7d0", text: "#14532d", border: "#16a34a", icon: "check" },
  warning: { variant: "warning", bg: "#fde68a", text: "#78350f", border: "#d97706", icon: "progress" },
  sky: { variant: "sky", bg: "#bae6fd", text: "#0c4a6e", border: "#0284c7", icon: "clock" },
  indigo: { variant: "indigo", bg: "#c7d2fe", text: "#312e81", border: "#4f46e5", icon: "eye" },
  slate: { variant: "slate", bg: "#e2e8f0", text: "#334155", border: "#64748b", icon: "edit" },
  purple: { variant: "purple", bg: "#ddd6fe", text: "#5b21b6", border: "#7c3aed", icon: "search" },
  orange: { variant: "orange", bg: "#fed7aa", text: "#7c2d12", border: "#ea580c", icon: "mail" },
  cyan: { variant: "cyan", bg: "#a5f3fc", text: "#155e75", border: "#0891b2", icon: "settings" },
  rose: { variant: "rose", bg: "#f5d0fe", text: "#86198f", border: "#c026d3", icon: "close" },
  danger: { variant: "danger", bg: "#fecaca", text: "#7f1d1d", border: "#dc2626", icon: "alert" },
  teal: { variant: "teal", bg: "#99f6e4", text: "#115e59", border: "#0d9488", icon: "grid" },
  muted: { variant: "muted", bg: "#e5e7eb", text: "#374151", border: "#9ca3af", icon: "circle" },
};

export const getStatusTone = (status) => {
  const normalizedStatus = status?.toLowerCase() || "";

  if (normalizedStatus.includes("процесс")) return STATUS_TONES.warning;
  if (normalizedStatus.includes("выполнен")) return STATUS_TONES.success;
  if (
    normalizedStatus.includes("ожидают") ||
    normalizedStatus.includes("ожидает")
  ) {
    return STATUS_TONES.sky;
  }
  if (normalizedStatus.includes("рассмотрен")) return STATUS_TONES.indigo;
  if (
    normalizedStatus.includes("не предложен") ||
    normalizedStatus.includes("чернов")
  ) {
    return STATUS_TONES.slate;
  }
  if (normalizedStatus.includes("поиск")) return STATUS_TONES.purple;
  if (normalizedStatus.includes("предложен")) return STATUS_TONES.orange;
  if (normalizedStatus.includes("самостоятель")) return STATUS_TONES.cyan;
  if (normalizedStatus.includes("отказано")) return STATUS_TONES.rose;
  if (normalizedStatus.includes("отказ")) return STATUS_TONES.danger;
  if (normalizedStatus.includes("график")) return STATUS_TONES.teal;

  return STATUS_TONES.muted;
};

export const getStatusColor = (status) => {
  const tone = getStatusTone(status);
  return {
    bg: tone.bg,
    text: tone.text,
    border: tone.border,
    icon: tone.icon,
    variant: tone.variant,
  };
};

export const cardStyles = {
  base: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    border: `1px solid ${colors.gray200}`,
    boxShadow: shadows.sm,
    padding: spacing.lg,
    transition: transitions.default,
  },
  interactive: {
    cursor: "pointer",
    "&:hover": {
      boxShadow: shadows.lg,
      borderColor: colors.primary,
      transform: "translateY(-2px)",
    },
  },
};

export const buttonStyles = {
  primary: {
    backgroundColor: colors.primary,
    color: colors.surface,
    padding: `${spacing.sm} ${spacing.lg}`,
    border: "none",
    borderRadius: borderRadius.md,
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "14px",
    transition: transitions.default,
    "&:hover": {
      backgroundColor: colors.primaryDark,
      boxShadow: shadows.md,
    },
  },
  secondary: {
    backgroundColor: colors.gray100,
    color: colors.gray900,
    padding: `${spacing.sm} ${spacing.lg}`,
    border: `1px solid ${colors.gray200}`,
    borderRadius: borderRadius.md,
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "14px",
    transition: transitions.default,
    "&:hover": {
      backgroundColor: colors.gray200,
    },
  },
};

export const gradients = {
  primary: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  success: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
  warning: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
};

export default {
  colors,
  shadows,
  spacing,
  borderRadius,
  transitions,
  cardStyles,
  buttonStyles,
  gradients,
  getStatusColor,
  getStatusTone,
  STATUS_TONES,
};
