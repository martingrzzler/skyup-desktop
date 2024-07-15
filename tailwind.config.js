import { nextui } from "@nextui-org/theme";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        skytraxx: ["Skytraxx", "sans-serif"],
      },
    },
  },
  plugins: [
    require("daisyui"),
    nextui({
      addCommonColors: true,
      themes: {
        light: {
          colors: {
            primary: "#3b82f6",
            secondary: "#ff0000",
          },
        },
      },
    }),
  ],
};
