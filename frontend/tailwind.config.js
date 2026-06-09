/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Segoe UI", "Roboto", "system-ui", "Arial", "sans-serif"],
      },
      colors: {
        // Powerline brand palette (from the technical-offer documents)
        brand: {
          DEFAULT: "#ff6600", // primary orange (user-specified)
          dark: "#d95500",
          darker: "#a64200",
          light: "#ffe2d1", // light tint for fills
          tint: "#fff4ec", // very light wash for backgrounds
        },
        accent: {
          DEFAULT: "#ff8a3d", // secondary orange
          soft: "#ffab73",
        },
        ink: "#2b2421", // warm near-black text
        muted: "#7a716b", // warm grey (docx 767070)
        line: "#ece5e0", // warm border
        surface: "#faf7f5", // warm off-white background
        sidebar: "#241c18", // solid warm-dark sidebar
      },
      boxShadow: {
        soft: "0 1px 3px rgba(80,40,20,.07), 0 6px 18px rgba(80,40,20,.06)",
        lift: "0 8px 28px rgba(80,40,20,.12)",
        glow: "0 0 0 3px rgba(225,85,35,.18)",
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
