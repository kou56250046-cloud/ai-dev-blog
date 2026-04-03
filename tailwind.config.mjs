/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        bg: '#FAFAFA',
        'bg-alt': '#F0F4FF',
        'text-main': '#0A0A0A',
        'text-muted': '#6B7280',
        accent: '#4F46E5',
        'accent-2': '#818CF8',
      },
      fontFamily: {
        sans: ['"Noto Sans JP"', 'sans-serif'],
        heading: ['"Inter"', '"Noto Sans JP"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      typography: {
        DEFAULT: {
          css: {
            maxWidth: '70ch',
            lineHeight: '1.9',
            fontFamily: '"Noto Sans JP", sans-serif',
            code: {
              fontFamily: '"JetBrains Mono", monospace',
            },
          },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
