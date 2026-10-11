/** Generated CSS for the existing Bán hàng shell, not the Chat or 1988 apps. */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,html}'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Be Vietnam Pro"', 'sans-serif']
      },
      colors: {
        primary: '#16a34a',
        primaryLight: '#f0fdf4',
        success: '#16a34a',
        danger: '#ef4444',
        warning: '#f97316',
        dark: '#1e293b'
      }
    }
  },
  // Some app states assemble class lists at runtime; preserve known status styles.
  safelist: [
    'bg-primary','bg-success','bg-danger','bg-warning','bg-dark',
    'text-primary','text-success','text-danger','text-warning','text-dark',
    'text-white','text-gray-400','text-gray-700',
    'border-primary','border-danger',
    'hidden','flex','opacity-0','opacity-100',
    'pointer-events-none','pointer-events-auto',
    'scale-95','scale-100','translate-y-full','translate-y-0'
  ],
  plugins: []
};
