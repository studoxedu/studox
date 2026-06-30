/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Public Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        navy: {
          950: '#0d1520',
          900: '#131b2e',
          800: '#1e2d47',
          700: '#2a3f5f',
          600: '#3d5a80',
          400: '#5b7fa6',
          200: '#a8bdd4',
          100: '#dce7f0',
        },
        amber: {
          800: '#92510a',
          500: '#e8a020',
          200: '#f5c96a',
          50: '#fdf3dc',
        },
        surface: '#f4f5f7',
      },
      borderRadius: {
        DEFAULT: '2px',
        sm: '2px',
        md: '2px',
        lg: '2px',
        xl: '4px',
        full: '9999px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.08)',
        modal: '0 8px 24px rgba(0,0,0,0.14)',
      },
    },
  },
  plugins: [],
}
