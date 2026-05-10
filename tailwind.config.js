/** @type {import('tailwindcss').Config} */
export default {
  // 어떤 파일에서 테일윈드 클래스를 찾을지 지정 (html이랑 js 파일들)
  content: ["./templates/**/*.html", "./static/**/*.js"],
  theme: {
    extend: {
      colors: {
        theme: {
          bg: "var(--bg)",
          panel: "var(--panel)",
          border: "var(--border)",
          text: "var(--text)",
          up: "var(--up)",
          down: "var(--down)",
          accent: "var(--accent)",
        },
      },
    },
  },
  plugins: [],
};
