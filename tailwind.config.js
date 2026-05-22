/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        page: 'var(--bg-page)',
        panel: 'var(--bg-panel)',
        surface: 'var(--bg-surface)',
        elevated: 'var(--bg-elevated)',
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
        },
      },
      fontFamily: {
        sans: ['Inter Variable', 'SF Pro Display', '-apple-system', 'system-ui', 'sans-serif'],
        mono: ['Berkeley Mono', 'ui-monospace', 'SF Mono', 'Menlo', 'monospace'],
      },
      borderColor: {
        subtle: 'var(--border-subtle)',
        default: 'var(--border-default)',
      },
    },
  },
  plugins: [],
}
