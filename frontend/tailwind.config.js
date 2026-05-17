/** @type {import('tailwindcss').Config} */

function themeColor(varName) {
  return `rgb(var(${varName}) / <alpha-value>)`;
}

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Semantic theme colors (driven by CSS variables) ──
        'brand':        themeColor('--color-brand'),
        'brand-dark':   themeColor('--color-brand-dark'),
        'accent':       themeColor('--color-accent'),
        'accent-hover': themeColor('--color-accent-hover'),
        'accent-text':  themeColor('--color-accent-text'),
        'canvas':       themeColor('--color-bg-base'),
        'surface':      themeColor('--color-bg-surface'),
        'surface-light': themeColor('--color-bg-surface-light'),
        'surface-dark': themeColor('--color-bg-surface-dark'),
        'ink':          themeColor('--color-ink'),
        'ink-secondary': themeColor('--color-ink-secondary'),
        'ink-muted':    themeColor('--color-ink-muted'),
        'paper':        themeColor('--color-paper'),
        'danger':       themeColor('--color-danger'),
        'spirit':       themeColor('--color-spirit'),

        // ── Legacy aliases (resolve to the same CSS variables) ──
        'moss-green':     themeColor('--color-brand'),
        'forest-shadow':  themeColor('--color-brand-dark'),
        'warm-amber':     themeColor('--color-accent'),
        'sunset-orange':  themeColor('--color-accent-hover'),
        'soft-cream':     themeColor('--color-bg-base'),
        'parchment':      themeColor('--color-bg-surface'),
        'parchment-light': themeColor('--color-bg-surface-light'),
        'parchment-dark': themeColor('--color-bg-surface-dark'),
        'charcoal':       themeColor('--color-ink'),
        'warm-gray':      themeColor('--color-ink-secondary'),
        'stone-gray':     themeColor('--color-ink-muted'),
        'paper-white':    themeColor('--color-paper'),
        'spirit-red':     themeColor('--color-danger'),
        'spirit-purple':  themeColor('--color-spirit'),

        // Call of Cthulhu 7e - Vintage 1920s Palette (static, not themed)
        'sepia': {
          100: '#F5EBD9',
          200: '#E8D5B7',
          300: '#D4B896',
          400: '#C19A6B',
          500: '#A67C52',
          600: '#8B6939',
          700: '#6B5230',
          800: '#4A3C28',
          900: '#2E2419',
        },
      },
      fontFamily: {
        'heading': ['var(--font-heading)'],
        'body': ['var(--font-body)'],
        'mono': ['var(--font-mono)'],
      },
      borderRadius: {
        'cozy': '12px',
        'cozy-lg': '20px',
      },
      backdropBlur: {
        'cozy': '10px',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-in': 'slideIn 0.4s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
      },
    },
  },
  plugins: [],
}
