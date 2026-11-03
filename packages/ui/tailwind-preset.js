/** One Bank design tokens: premium navy + gold. */
module.exports = {
  theme: {
    extend: {
      colors: {
        navy: { 50: '#EEF1F8', 100: '#D6DCEC', 200: '#AEB9D6', 300: '#7F8FB8', 400: '#4F6194', 500: '#2C3F73', 600: '#1A2C5B', 700: '#122249', 800: '#0B1B3F', 900: '#07122B', 950: '#040B1C' },
        gold: { 50: '#FBF7E9', 100: '#F5EBC6', 200: '#ECD88E', 300: '#E3C55A', 400: '#D7B13A', 500: '#C9A227', 600: '#A9861C', 700: '#856816', 800: '#5F4A10', 900: '#3D2F0A' },
        ivory: '#F7F5EF',
        success: '#0E7A4F',
        danger: '#B42318',
        warning: '#B7791F',
      },
      fontFamily: {
        display: ['var(--font-display)', 'var(--font-serif)', 'Georgia', 'serif'],
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(11,27,63,.04), 0 8px 24px rgba(11,27,63,.06)',
        lift: '0 20px 50px -12px rgba(11,27,63,.35)',
        gold: '0 10px 30px -10px rgba(201,162,39,.55)',
      },
      backgroundImage: {
        'gold-sheen': 'linear-gradient(135deg,#E3C55A 0%,#C9A227 45%,#A9861C 100%)',
        'navy-deep': 'radial-gradient(1200px 600px at 10% -10%, #1A2C5B 0%, #0B1B3F 45%, #07122B 100%)',
      },
      keyframes: {
        'fade-up': { '0%': { opacity: 0, transform: 'translateY(8px)' }, '100%': { opacity: 1, transform: 'none' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: { 'fade-up': 'fade-up .35s ease-out both' },
    },
  },
};
