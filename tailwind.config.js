/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#2563eb', // Helles, klares Blau
        primaryHover: '#1d4ed8',
      }
    },
  },
  plugins: [],
}

