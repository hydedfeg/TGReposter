import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

const isGithubPages = process.env.GITHUB_PAGES === 'true';

export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },

  server: {
    host: '0.0.0.0',
    allowedHosts: ['terminal.local'],
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },

  build: {
    sourcemap: true,
  },

  base: isGithubPages ? '/TGReposter/' : '/',
});
