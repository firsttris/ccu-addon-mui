import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import fs from 'node:fs';
import Icons from 'unplugin-icons/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';

// WebSocket target of the go-server, selected via `vite --mode <name>`
const proxyTargets: Record<string, string> = {
  development: 'ws://localhost:8088',
  ccu3: 'ws://192.168.178.26',
  // Server against the fake CCU in the Playwright stack tests
  stack: 'ws://127.0.0.1:28088',
};

// MUI_APP_VERSION: the update test (e2e-update) builds an installed and a
// new version of the app
const appVersion = process.env.MUI_APP_VERSION ?? JSON.parse(fs.readFileSync('./package.json', 'utf8')).version;

export default defineConfig(({ command, mode, isPreview }) => ({
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
  },
  base: command === 'build' || isPreview ? '/addons/mui/' : '/',

  server: {
    port: 4200,
    host: '0.0.0.0',
    proxy: {
      '/ws/mui': {
        target: proxyTargets[mode] ?? proxyTargets.development,
        ws: true,
        changeOrigin: true,
      },
    },
  },

  preview: {
    port: 4300,
    host: 'localhost',
  },

  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
    // Texts from messages/<locale>.json, compiled to typed functions (m.KEY())
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/paraglide',
      // The browser's language, else English
      strategy: ['preferredLanguage', 'baseLocale'],
      emitTsDeclarations: true,
    }),
    // Icons are compiled into the bundle (no requests at runtime, works
    // offline on the CCU).
    Icons({
      compiler: 'jsx',
      jsx: 'react',
      scale: 0,
    }),
    VitePWA({
      // A new version waits until the user reloads (components/UpdatePrompt):
      // reloading on its own would drop a program or layout being edited
      registerType: 'prompt',
      workbox: {
        // The direct link profiles (several MB, one chunk per receiver
        // type, named in build.rollupOptions) are loaded when needed, in
        // the setup area only, not installed on every device
        globIgnores: ['**/linkProfile-*.js'],
        // Pages the app doesn't render: the WebUI's Zusatzsoftware opens
        // update-check.cgi?cmd=download (cp_software.cgi), which lighttpd
        // runs as CGI and which redirects to the release on GitHub. Without
        // this the service worker answers every navigation in /addons/mui/
        // with index.html, and the app shows "Not Found". Workbox matches
        // the path with its query.
        navigateFallbackDenylist: [/\.cgi(\?|$)/],
        // Push notifications (public/push-sw.js)
        importScripts: ['push-sw.js'],
      },
      manifest: {
        name: 'MUI · Moderne WebUI für Homematic CCU3 und OpenCCU',
        short_name: 'MUI',
        description:
          'MUI: die komplette WebUI für Homematic CCU3 und OpenCCU, neu gebaut. Live per WebSocket, als App installierbar.',
        lang: 'de',
        display: 'standalone',
        // Dark like the app's dark theme, so the splash screen does not flash white
        background_color: '#0a0a0a',
        theme_color: '#0a0a0a',
        categories: ['utilities', 'lifestyle'],
        icons: [
          { src: 'android-chrome-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'android-chrome-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
    }),
    {
      name: 'load-tcl',
      transform(src, id) {
        if (id.endsWith('.tcl')) {
          return `export default ${JSON.stringify(src)}`;
        }
      },
      load(id) {
        if (id.endsWith('.tcl')) {
          return fs.readFileSync(id, 'utf-8');
        }
      },
    },
  ],

  build: {
    outDir: './dist/ccu-addon-mui',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rollupOptions: {
      output: {
        // Direct link profiles (src/controls/links/profiles/*.json) get a
        // prefix, so the service worker leaves them out (globIgnores)
        chunkFileNames: (chunk) =>
          chunk.facadeModuleId?.includes('/controls/links/profiles/')
            ? 'assets/linkProfile-[name]-[hash].js'
            : 'assets/[name]-[hash].js',
      },
    },
  },
}));
