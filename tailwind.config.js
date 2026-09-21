/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        // App-wide default body/UI font. Was Inter — Manrope is a Geist-adjacent
        // geometric grotesk, confirmed available via the Google Fonts link below.
        sans:    ['Manrope', '"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Manrope', 'sans-serif'],
        ui:      ['Manrope', '"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Minimalist workspace palette (pilot: ResultsTab). Namespaced under
        // paper/ink/line/pastel so it never collides with the existing
        // navy/brand tokens other pages still use.
        paper: {
          DEFAULT: '#FBFBFA',
          bone:    '#F7F6F3',
          card:    '#FFFFFF',
        },
        ink: {
          DEFAULT: '#111111',
          muted:   '#787774',
          faint:   '#B4B4B2',
        },
        line: '#EAEAEA',
        // Tag/badge pastels — usage: bg-tagRed-bg text-tagRed-text, etc.
        tagRed:    { bg: '#FDEBEC', text: '#9F2F2D' },
        tagBlue:   { bg: '#E1F3FE', text: '#1F6C9F' },
        tagGreen:  { bg: '#EDF3EC', text: '#346538' },
        tagYellow: { bg: '#FBF3DB', text: '#956400' },
        brand: {
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        navy: {
          950: '#04080f',
          900: '#080c16',
          800: '#0d1526',
          700: '#111e35',
          600: '#162440',
          500: '#1e3054',
        },
      },
      backgroundImage: {
        'grid-dark': "url(\"data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.03'%3E%3Cpath d='M0 0h1v40H0zm39 0h1v40h-1zM0 0v1h40V0zM0 39v1h40v-1z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow':  'spin 8s linear infinite',
        'ping-slow':  'ping 2.5s cubic-bezier(0, 0, 0.2, 1) infinite',
      },
    },
  },
  plugins: [],
}
