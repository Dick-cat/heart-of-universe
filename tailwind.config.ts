import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './hooks/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // 宇宙之心主题：黑红主色，金黄辅色
        cosmic: '#050505',
        'cosmic-100': '#f5f5f5',
        'cosmic-200': '#d4d4d4',
        'cosmic-300': '#a3a3a3',
        'cosmic-400': '#737373',
        'cosmic-500': '#525252',
        'cosmic-600': '#404040',
        'cosmic-700': '#262626',
        'cosmic-800': '#171717',
        'cosmic-900': '#0a0a0a',
        crimson: '#dc2626',
        'crimson-400': '#f87171',
        'crimson-500': '#ef4444',
        'crimson-600': '#dc2626',
        'crimson-700': '#b91c1c',
        'crimson-800': '#991b1b',
        'crimson-900': '#7f1d1d',
        gold: '#facc15',
        'gold-400': '#facc15',
        'gold-500': '#eab308',
        'gold-600': '#ca8a04',
        panel: '#0a0a0a',
        'panel-elevated': '#141414',
        'panel-border': '#262626',
        accent: '#dc2626',
      },
      boxShadow: {
        'crimson-glow': '0 0 20px rgba(220, 38, 38, 0.25)',
        'gold-glow': '0 0 16px rgba(250, 204, 21, 0.2)',
        'inner-glow': 'inset 0 1px 0 rgba(255,255,255,0.06)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};

export default config;
