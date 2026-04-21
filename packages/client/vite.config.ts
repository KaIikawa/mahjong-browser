import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  publicDir: '../../public',
  resolve: {
    alias: {
      '@mahjong/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
