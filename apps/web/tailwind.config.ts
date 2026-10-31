import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "var(--color-canvas)",
        ink: "var(--color-ink)",
        line: "var(--color-line)",
        accent: "var(--color-accent)",
        accentSoft: "var(--color-accent-soft)",
        accentWarm: "var(--color-accent-warm)",
        panel: "var(--color-panel)",
        surface: "var(--color-surface)",
        surfaceSoft: "var(--color-surface-soft)",
        field: "var(--color-field)",
        input: "var(--color-input)"
      },
      boxShadow: {
        studio: "var(--shadow-studio)"
      },
      fontFamily: {
        sans: ["var(--font-space-grotesk)"],
        mono: ["var(--font-ibm-plex-mono)"]
      }
    }
  },
  plugins: []
};

export default config;
