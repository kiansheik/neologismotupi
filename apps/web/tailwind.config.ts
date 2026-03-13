import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f3f7ef",
          100: "#e0ebd7",
          200: "#bfd6ad",
          300: "#96ba78",
          400: "#709d4f",
          500: "#5a8240",
          600: "#476834",
          700: "#3a522b",
          800: "#314125",
          900: "#2a371f"
        }
      }
    }
  },
  plugins: [],
} satisfies Config;
