import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const dashboardRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(dashboardRoot, '..');

function devCspPlugin(): Plugin {
  return {
    name: 'admin-dev-csp-relax',
    transformIndexHtml(html, ctx) {
      if (!ctx.server) return html;
      return html
        .replace(
          /script-src 'self' 'unsafe-inline'/,
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        )
        .replace(
          /connect-src 'self'/,
          "connect-src 'self' ws://localhost:* ws://0.0.0.0:*",
        );
    },
  };
}

export default defineConfig({
  root: dashboardRoot,
  envDir: dashboardRoot,
  publicDir: resolve(dashboardRoot, 'public'),
  server: {
    port: 3002,
    host: '0.0.0.0',
    fs: {
      allow: [dashboardRoot, repoRoot],
    },
  },
  preview: {
    port: 3002,
    host: '0.0.0.0',
  },
  plugins: [react(), devCspPlugin()],
  build: {
    outDir: resolve(dashboardRoot, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(dashboardRoot, 'index.html'),
    },
  },
  css: {
    postcss: resolve(dashboardRoot, 'postcss.config.cjs'),
  },
  resolve: {
    alias: {
      '@admin': resolve(repoRoot, 'admin'),
    },
  },
});
