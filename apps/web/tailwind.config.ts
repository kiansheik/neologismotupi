import type { Config } from "tailwindcss";
import colors from "tailwindcss/colors";

const colorVar = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    colors: {
      ...colors,
      brand: {
        50: colorVar("--brand-50"),
        100: colorVar("--brand-100"),
        200: colorVar("--brand-200"),
        300: colorVar("--brand-300"),
        400: colorVar("--brand-400"),
        500: colorVar("--brand-500"),
        600: colorVar("--brand-600"),
        700: colorVar("--brand-700"),
        800: colorVar("--brand-800"),
        900: colorVar("--brand-900"),
      },
      slate: {
        50: colorVar("--slate-50"),
        100: colorVar("--slate-100"),
        200: colorVar("--slate-200"),
        300: colorVar("--slate-300"),
        400: colorVar("--slate-400"),
        500: colorVar("--slate-500"),
        600: colorVar("--slate-600"),
        700: colorVar("--slate-700"),
        800: colorVar("--slate-800"),
        900: colorVar("--slate-900"),
      },
      surface: {
        DEFAULT: colorVar("--surface"),
        alt: colorVar("--surface-alt"),
        soft: colorVar("--surface-soft"),
        header: colorVar("--surface-header"),
        input: colorVar("--surface-input"),
        hover: colorVar("--surface-hover"),
        chip: colorVar("--surface-chip"),
      },
      line: {
        DEFAULT: colorVar("--line"),
        strong: colorVar("--line-strong"),
        soft: colorVar("--line-soft"),
      },
      ink: {
        DEFAULT: colorVar("--text"),
        muted: colorVar("--muted"),
      },
      accent: {
        DEFAULT: colorVar("--accent"),
        strong: colorVar("--accent-strong"),
        soft: colorVar("--accent-soft"),
        contrast: colorVar("--accent-contrast"),
      },
      "vote-up": colorVar("--vote-up-bg"),
      "vote-up-border": colorVar("--vote-up-border"),
      "vote-up-text": colorVar("--vote-up-text"),
      "vote-down": colorVar("--vote-down-bg"),
      "vote-down-border": colorVar("--vote-down-border"),
      "vote-down-text": colorVar("--vote-down-text"),
      focus: colorVar("--focus"),
      tooltip: colorVar("--tooltip"),
    },
    extend: {},
  },
  plugins: [],
} satisfies Config;
