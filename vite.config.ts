import path from 'path';
import { defineConfig, loadEnv, splitVendorChunkPlugin } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  loadEnv(mode, '.', '');
  return {
    server: {
      port: 3002,
      host: '0.0.0.0',
      watch: {
        ignored: ['**/android/**', '**/graphify-out/**', '**/.claude/**', '**/dist/**'],
      },
    },
    optimizeDeps: {
      entries: ['index.html'],
    },
    plugins: [react(), splitVendorChunkPlugin()],
    build: {
      chunkSizeWarningLimit: 2200,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('@supabase/supabase-js')) return 'supabase';
            return undefined;
          },
        },
      },
    },
    css: {
      postcss: './postcss.config.cjs',
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
