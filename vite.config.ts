import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * In dev mode, Vite's React Refresh runtime uses `new Function()` which
 * requires 'unsafe-eval' in the CSP. This plugin relaxes the CSP meta tag
 * during development only — production builds keep the strict policy.
 */
function devCspPlugin(): Plugin {
  return {
    name: 'dev-csp-relax',
    transformIndexHtml(html, ctx) {
      if (ctx.server) {
        return html.replace(
          /script-src 'self' 'unsafe-inline'/,
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        ).replace(
          /connect-src 'self'/,
          "connect-src 'self' ws://localhost:* ws://0.0.0.0:*",
        );
      }
      return html;
    },
  };
}

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
    plugins: [react(), devCspPlugin()],
    build: {
      // Vite 8's default CSS minifier (LightningCSS) fuses adjacent filter
      // functions into "blur(18px)saturate(140%)" — invalid CSS that Chrome
      // ignores — and drops the unprefixed backdrop-filter, silently
      // disabling every multi-function glass blur in production. esbuild
      // minifies these correctly.
      cssMinify: 'esbuild',
      chunkSizeWarningLimit: 760,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('@supabase/supabase-js')) return 'supabase';
            if (id.includes('framer-motion')) return 'motion';
            if (id.includes('lucide-react')) return 'icons';
            if (id.includes('date-fns')) return 'date-fns';
            if (id.includes('recharts')) return 'charts';
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
