/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  // Dark mode is opt-in via <html data-theme="dark"> (see src/theme.ts). The neutral
  // palette + brand tints below resolve through CSS variables so both themes share
  // one set of utility classes; index.css supplies the light/dark variable values.
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        // Body / UI — Poppins (brand body typeface). Self-hosted via @fontsource.
        sans: ["Poppins", "system-ui", "Segoe UI", "Roboto", "Arial", "sans-serif"],
        // Headlines / titles / display — Nexa (brand headline typeface).
        // Nexa is a commercial font (no files shipped in the brand kit), so it
        // falls back to Montserrat, a close free geometric sans, until the real
        // Nexa woff2 files are dropped in (see the @font-face note in index.css).
        display: ["Nexa", "Montserrat", "Poppins", "system-ui", "sans-serif"],
      },
      colors: {
        // ---- Powerline brand palette (from PL brand guidelines 2026) ----
        // Primary: Powerline Orange  #F16722  (RGB 241·103·34, Pantone 158 C)
        brand: {
          DEFAULT: "#F16722", // primary brand orange (constant in both themes)
          dark: "#D9591C", // hover
          darker: "#B5470F", // active / dark-orange text
          // Light tint fill + very light wash — variable so dark mode uses muted
          // dark-orange washes instead of glaring peach.
          light: "rgb(var(--c-brand-light) / <alpha-value>)",
          tint: "rgb(var(--c-brand-tint) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "#F4824A", // lighter secondary orange
          soft: "#F8A878",
        },
        // Secondary: Charcoal Grey  #585859  (RGB 88·88·89, Pantone Cool Gray 10 C)
        charcoal: "#585859", // exact brand charcoal (wordmark "POWER", accents)
        // Neutral palette — variable-driven so it flips with the theme (light values
        // are the original hex; dark values live in index.css).
        ink: "rgb(var(--c-ink) / <alpha-value>)", // headings & primary text
        muted: "rgb(var(--c-muted) / <alpha-value>)", // secondary text / labels
        line: "rgb(var(--c-line) / <alpha-value>)", // neutral border
        surface: "rgb(var(--c-surface) / <alpha-value>)", // app background
        sidebar: "#2A2A2E", // deep charcoal sidebar (dark in both themes)
      },
      boxShadow: {
        soft: "0 1px 3px rgba(20,20,28,.06), 0 6px 18px rgba(20,20,28,.06)",
        lift: "0 8px 28px rgba(20,20,28,.12)",
        glow: "0 0 0 3px rgba(241,103,34,.18)",
      },
      borderRadius: { xl2: "14px" },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-in": {
          "0%": { opacity: "0", transform: "translateX(14px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        pop: {
          "0%": { transform: "scale(.97)" },
          "60%": { transform: "scale(1.02)" },
          "100%": { transform: "scale(1)" },
        },
        "bar-grow": {
          "0%": { transform: "scaleX(0)" },
          "100%": { transform: "scaleX(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
        blink: {
          "0%, 49%": { opacity: "1" },
          "50%, 100%": { opacity: "0" },
        },
      },
      animation: {
        "fade-up": "fade-up .45s cubic-bezier(.2,.7,.3,1) both",
        "fade-in": "fade-in .3s ease both",
        "slide-in": "slide-in .4s cubic-bezier(.2,.7,.3,1) both",
        pop: "pop .18s ease",
        "bar-grow": "bar-grow .5s ease both",
        shimmer: "shimmer 1.4s linear infinite",
        blink: "blink 1.1s linear infinite",
      },
    },
  },
  plugins: [],
};
