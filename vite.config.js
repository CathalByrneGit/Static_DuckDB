import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        app: resolve(__dirname, 'pages/app.js'),
        background: resolve(__dirname, 'background.js')
      },
      output: {
        dir: 'dist',
        entryFileNames: '[name].js',
        format: 'es'
      }
    },
    outDir: 'dist',
    emptyOutDir: false, // Don't delete other files in dist
  }
});
