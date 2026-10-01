import { defineConfig } from 'vite';

export default defineConfig({
  // 相对路径，方便 dist 直接放到任意子目录 / 静态服务器下
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173,
    open: false
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200
  }
});
