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

export const getStatusColor = (status) => {
  const normalizedStatus = status?.toLowerCase() || "";

  if (normalizedStatus.includes("выполнен")) {
    return { bg: "#dcfce7", text: "#166534", border: "#22c55e", icon: "✓" };
  }
  if (normalizedStatus.includes("процесс")) {
    return { bg: "#fef3c7", text: "#92400e", border: "#f59e0b", icon: "⏳" };
  }
  if (
    normalizedStatus.includes("ожидают") ||
    normalizedStatus.includes("ожидает")
  ) {
    return { bg: "#dbeafe", text: "#1e40af", border: "#3b82f6", icon: "⏱" };
  }
  if (normalizedStatus.includes("рассмотрен")) {
    return { bg: "#e0e7ff", text: "#3730a3", border: "#6366f1", icon: "👀" };
  }
  if (
    normalizedStatus.includes("поиск") ||
    normalizedStatus.includes("предложен")
  ) {
    return { bg: "#f3e8ff", text: "#6b21a8", border: "#a855f7", icon: "⌕" };
  }
  if (
    normalizedStatus.includes("не предложен") ||
    normalizedStatus.includes("чернов")
  ) {
    return { bg: "#f1f5f9", text: "#475569", border: "#94a3b8", icon: "✎" };
  }
  if (normalizedStatus.includes("самостоятель")) {
    return { bg: "#ecfeff", text: "#0e7490", border: "#06b6d4", icon: "⚙" };
  }
  if (normalizedStatus.includes("график")) {
    return { bg: "#f0fdfa", text: "#0f766e", border: "#14b8a6", icon: "▦" };
  }

  return { bg: "#f3f4f6", text: "#4b5563", border: "#d1d5db", icon: "○" };
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
};
