/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        duna: {
          DEFAULT: "#FE6712",
          50: "#fff7ed",
          100: "#ffedd5",
          200: "#fed7aa",
          500: "#FE6712",
          600: "#ea580c",
          700: "#c2410c"
        }
      }
    },
  },
  plugins: [],
};
