/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Claude Code 主题色
        'claude': {
          DEFAULT: '#D97757',
          50: '#FFF5ED',
          100: '#FFE8D9',
          200: '#FFCFB3',
          300: '#FFB08C',
          400: '#E88B6F',
          500: '#D97757',
          600: '#C86847',
          700: '#B45A3A',
          800: '#8A4530',
          900: '#5C2E20'
        },
        // 语义化统计颜色
        'stat': {
          tokens: '#D97757',
          cost: '#52c41a',
          sessions: '#722ed1',
          projects: '#E88B6F',
          tools: '#13c2c2',
          time: '#2f54eb'
        },
        // macOS 灰色系列
        'mac-gray': {
          50: '#f9fafb',
          100: '#f3f4f6',
          200: '#e5e7eb',
          300: '#d1d5db',
          400: '#9ca3af',
          500: '#6b7280',
          600: '#4b5563',
          700: '#374151',
          800: '#1f2937',
          900: '#111827'
        }
      }
    }
  },
  plugins: []
}
