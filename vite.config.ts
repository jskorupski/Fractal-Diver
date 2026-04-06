import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const isProd = mode === 'production';
  const env = loadEnv(mode, '.', '');
  
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in production or if DISABLE_HMR env var is set.
      // In production builds, Vite automatically removes the HMR client.
      hmr: !isProd && process.env.DISABLE_HMR !== 'true',
    },
  };
});
