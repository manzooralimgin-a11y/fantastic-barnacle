import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/modules/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#0A2F1F",
          light: "#0D3B27",
        },
        accent: {
          DEFAULT: "#C8A951",
          warm: "#D4A843",
        },
        background: {
          dark: "#0A1A14",
          light: "#F5F2EB",
        },
        surface: {
          dark: "#112A1F",
          light: "#FFFFFF",
        },
        "text-primary": {
          dark: "#E8E0D0",
          light: "#1A1A1A",
        },
        "text-secondary": {
          dark: "#8B9A8F",
          light: "#6B7280",
        },
        status: {
          success: "#22C55E",
          warning: "#F59E0B",
          pending: "#3B82F6",
          error: "#EF4444",
        },
      },
      fontFamily: {
        sans: ["var(--font-dm-sans)", "sans-serif"],
        heading: ["var(--font-playfair)", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
