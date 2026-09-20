import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        deped: {
          50: '#eef5ff',
          100: '#d9e8ff',
          200: '#bcd7ff',
          300: '#8ebeff',
          400: '#599bff',
          500: '#3377ff',
          600: '#1d56f5',
          700: '#1743e1',
          800: '#1938b6',
          900: '#1b358f',
          950: '#142157',
        },
        ink: '#0f172a',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
      minHeight: { touch: '3rem' },
      minWidth: { touch: '3rem' },
    },
  },
  plugins: [],
};

export default config;
