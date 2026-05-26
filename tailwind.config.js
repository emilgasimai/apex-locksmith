/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './*.html'],
  theme: {
    extend: {
      screens: {
        xs: '480px',
      },
      colors: {
        bg:      '#1A1A1A',
        bg2:     '#242427',
        bg3:     '#2f2f33',
        ink:     '#EDEDED',
        inkDim:  '#9a9a9a',
        rule:    '#3a3a3e',
        hivis:   '#27E0F5',
        hivisDk: '#1cb8c9',
        caution: '#f4c20a',
        green:   '#5cd97a',
      },
      fontFamily: {
        display: ['"Archivo Black"', 'sans-serif'],
        body:    ['"DM Sans"', 'sans-serif'],
        mono:    ['"Space Grotesk"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
