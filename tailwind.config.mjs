/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        ink: '#0a0a0b',
        'ink-soft': '#121214',
        'ink-line': '#26262b',
        cream: '#ede9e0',
        'cream-dim': '#a3a097',
        emerald: {
          DEFAULT: '#00e599',
          glow: '#5fffc4',
          deep: '#04140e',
          dim: '#0c3a2a',
        },
      },
      fontFamily: {
        display: ['"Clash Display"', 'system-ui', 'sans-serif'],
        sans: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        tightest: '-0.045em',
      },
    },
  },
  plugins: [],
};
