/** @type {import('tailwindcss').Config} */
module.exports = {
  // Scans the HTML (including inline JS) so every utility class used —
  // literals and arbitrary values like max-h-[88vh] or bg-[#451a03] — is emitted.
  content: ['./*.html'],
  theme: {
    extend: {},
  },
  plugins: [],
};
