/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        space: {
          950: '#0A192F',
          900: '#112240',
          800: '#1E3A5F',
          700: '#2D4A6F',
        },
        cosmic: {
          500: '#64FFDA',
          400: '#7FFFE4',
        },
        nebula: {
          200: '#CCD6F6',
          300: '#A8B2D1',
          400: '#8892B0',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Consolas', 'Monaco', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px #64FFDA, 0 0 10px #64FFDA' },
          '100%': { boxShadow: '0 0 20px #64FFDA, 0 0 30px #64FFDA' },
        }
      }
    },
  },
  plugins: [],
};
