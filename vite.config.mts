import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import fs from 'fs';
import Icons from 'unplugin-icons/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import { FileSystemIconLoader } from 'unplugin-icons/loaders';

// Default sizes of icons that had a fixed size as hand-written components;
// all others have none and are sized by CSS or props.
const iconSizes: Record<string, string> = {
  'emojione:light-bulb': '64',
  'emojione-monotone:light-bulb': '64',
  'material-symbols-light:window-open': '24',
  'mui:window-closed': '1em',
  'mdi:thermostat-auto': '1em',
  'mdi:thermostat-cog': '1em',
  'mui:menu': '24',
  'mui:wall-thermostat': '24',
  'mui:radiator-thermostat': '24',
};

// WebSocket target of the go-server, selected via `vite --mode <name>`
const proxyTargets: Record<string, string> = {
  development: 'ws://localhost:8088',
  ccu3: 'ws://192.168.178.26',
  // Server against the fake CCU in the Playwright stack tests
  stack: 'ws://127.0.0.1:28088',
};

const appVersion = JSON.parse(fs.readFileSync('./package.json', 'utf8')).version;

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
    // offline on the CCU). "mui" holds our own SVGs from src/assets/icons.
    Icons({
      compiler: 'jsx',
      jsx: 'react',
      scale: 0,
      customCollections: {
        mui: FileSystemIconLoader('./src/assets/icons'),
      },
      iconCustomizer(collection, icon, props) {
        const size = iconSizes[`${collection}:${icon}`];
        if (size) {
          props.width = size;
          props.height = size;
        }
      },
    }),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // The direct link profiles (1.5 MB) are loaded when needed, in the
        // setup area only, not installed on every device
        globIgnores: ['**/linkProfiles-*.js'],
        // Push notifications (public/push-sw.js)
        importScripts: ['push-sw.js'],
      },
      manifest: {
        name: 'ccu-addon-mui',
        short_name: 'ccu-addon-mui',
        icons: [
          {
            src: 'android-chrome-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
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
  },
}));
