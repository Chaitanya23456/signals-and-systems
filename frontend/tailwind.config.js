/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0f172a',
        primary: '#38bdf8',
        secondary: '#818cf8',
        accent: '#f472b6',
      },
    },
  },
  plugins: [],
}
