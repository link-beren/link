export const themeTokens = {
  colors: {
    primary: '#3b82f6',
    primarySoft: 'rgba(59, 130, 246, 0.15)',
    primaryMid: 'rgba(59, 130, 246, 0.4)',
    green: '#10b981',
    greenSoft: 'rgba(16, 185, 129, 0.15)',
    amber: '#f59e0b',
    amberSoft: 'rgba(245, 158, 11, 0.15)',
    red: '#ef4444',
    redSoft: 'rgba(239, 68, 68, 0.15)',
    blue: '#60a5fa',
    blueSoft: 'rgba(96, 165, 250, 0.15)',
    text: '#f1f5f9',
    textMuted: '#94a3b8',
    textSubtle: '#64748b',
    border: 'rgba(255, 255, 255, 0.07)',
    borderStrong: 'rgba(255, 255, 255, 0.14)',
    bg: '#0f172a',
    surface: '#1e293b',
  },
  shadows: {
    sm: '0 2px 12px rgba(0, 0, 0, 0.4)',
    md: '0 4px 20px rgba(59, 130, 246, 0.12)',
    lg: '0 8px 32px rgba(0, 0, 0, 0.5)',
  },
  radii: {
    xs: '8px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '20px',
  },
  fonts: {
    base: 'Heebo, Arial, sans-serif',
  },
} as const;

export const socialThemeOverrides = {
  colors: {
    primaryMid: 'rgba(59, 130, 246, 0.35)',
    text: '#e8f0ff',
    textMuted: '#a0b4cc',
    textSubtle: '#4a6080',
    border: 'rgba(59, 130, 246, 0.14)',
    borderStrong: 'rgba(59, 130, 246, 0.28)',
    bg: '#0d1117',
    surface: '#1e2a40',
  },
  shadows: {
    sm: '0 4px 24px rgba(0, 0, 0, 0.35)',
  },
  radii: {
    sm: '12px',
  },
} as const;
