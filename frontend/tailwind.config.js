/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#3b82f6',
        success: '#10b981',
        warning: '#f59e0b',
        error: '#ef4444',
        bg: {
          DEFAULT: '#0a0a0a',
          surface: '#1a1a1a',
          elevated: '#2a2a2a',
        },
        text: {
          DEFAULT: '#f5f5f5',
          dim: '#a3a3a3',
        },
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};
