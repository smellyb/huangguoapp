import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    hmr: false,
    watch: {
      ignored: ['**/*.apk*', '**/android/**', '**/dist/**', '**/hongguo/**', '**/.git/**'],
    },
    proxy: {
      '/api-hg': {
        target: 'https://huangguoai.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api-hg/, ''),
      },
      '/pic-hg': {
        target: 'https://pic.qnlycc.cn',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/pic-hg/, ''),
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
  },
});
