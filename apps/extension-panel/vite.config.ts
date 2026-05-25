import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  root: '.',
  base: './',
  build: {
    emptyOutDir: true,
    outDir: 'dist',
    rollupOptions: {
      input: {
        config: resolve(__dirname, 'config.html'),
        video_overlay: resolve(__dirname, 'video_overlay.html'),
      },
    },
  },
})
