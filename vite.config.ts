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

/**
 * Ignore a directory only when it sits at the project root. A match-anywhere
 * glob for .claude would also match when the dev server itself runs inside a
 * Claude worktree (.claude/worktrees/<name>), which silently disables file
 * watching/HMR for every source file in that checkout.
 */
function ignoreRootDir(dirName: string): (watchedPath: string) => boolean {
  const abs = path.resolve(__dirname, dirName).replace(/\\/g, '/').toLowerCase();
  return (watchedPath) => {
    const normalized = watchedPath.replace(/\\/g, '/').toLowerCase();
    return normalized === abs || normalized.startsWith(`${abs}/`);
  };
}

export default defineConfig(({ mode }) => {
  loadEnv(mode, '.', '');
  return {
    server: {
      port: 3002,
      host: '0.0.0.0',
      watch: {
        ignored: ['**/android/**', '**/graphify-out/**', ignoreRootDir('.claude'), '**/dist/**'],
      },
    },
    optimizeDeps: {
      entries: ['index.html'],
    },
    plugins: [react(), devCspPlugin()],
    build: {
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
