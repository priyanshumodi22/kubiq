import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const basePath = env.VITE_FRONTEND_BASE_PATH || '/';

  console.log(`🔧 Vite Mode: ${mode}`);
  console.log(`📂 Base Path: ${basePath}`);

  return {
    plugins: [react()],
    base: basePath,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      // Footer imports the public root license; do not expose the rest of the repository.
      fs: { allow: [path.resolve(__dirname), path.resolve(__dirname, '../LICENSE'), path.resolve(__dirname, '../LICENSE?raw')] },
      port: 3000,
      host: true,
      hmr: {
        overlay: true,
      },
      watch: {
        usePolling: true,
      },
      proxy: {
        '/api': {
          target: `http://localhost:3001${env.VITE_BACKEND_CONTEXT_PATH || ''}`,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  };
});
