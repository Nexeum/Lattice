import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // JSX lives in .js files (CRA legacy) — teach esbuild to parse them as JSX.
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.js$/,
    // Vite's default exclude is /\.js$/ and exclude wins over include,
    // so it must be cleared for the .js-as-JSX loader to apply.
    exclude: [],
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
      },
    },
  },
  server: {
    port: 3000,
    open: false,
  },
  build: {
    outDir: 'build',
  },
});
