import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "var(--color-line)",
        input: "var(--color-line)",
        ring: "var(--color-brand)",
        background: "var(--color-bg)",
        foreground: "var(--color-ink)",
        primary: {
          DEFAULT: "var(--color-brand)",
          foreground: "var(--color-bg)",
        },
        secondary: {
          DEFAULT: "var(--color-surface)",
          foreground: "var(--color-fg-soft)",
        },
        destructive: {
          DEFAULT: "var(--color-danger)",
          foreground: "var(--color-bg)",
        },
        muted: {
          DEFAULT: "var(--color-surface)",
          foreground: "var(--color-fg-soft)",
        },
        card: {
          DEFAULT: "var(--color-bg)",
          foreground: "var(--color-ink)",
        },
        sidebar: "var(--color-surface)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
