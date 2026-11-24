import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // 产物里的资源路径用相对路径，同一份 dist 既能放在域名根目录，
  // 也能放在 GitHub Pages 项目站点的 /<repo>/ 子路径下。
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
  },
});
