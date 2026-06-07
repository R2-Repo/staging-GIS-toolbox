import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { VitePWA } from 'vite-plugin-pwa';

function inPath(id, segment) {
  return id.includes(`/` + segment + `/`) || id.includes(`\\` + segment + `\\`);
}

function createManualChunks(id) {
  if (!id) return undefined;

  if (inPath(id, 'node_modules')) {
    return 'vendor';
  }

  if (
    inPath(id, 'js/map') || inPath(id, 'js/dual-screen') || inPath(id, 'react/map') ||
    inPath(id, 'js/import') || inPath(id, 'js/export') || inPath(id, 'js/dataprep') ||
    inPath(id, 'js/tools') || inPath(id, 'js/widgets') || inPath(id, 'js/arcgis') ||
    inPath(id, 'js/agol') || inPath(id, 'js/photo') || inPath(id, 'react/tools')
  ) {
    return 'app-domain';
  }

  if (inPath(id, 'react/panels') || inPath(id, 'react/header') || inPath(id, 'react/ui')) {
    return 'app-ui';
  }

  return undefined;
}

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: [
        'icons/favicon.png',
        'icons/PWAicon.png',
        'icons/MobileAddButton.png',
        'icons/MobileMenuButton.png'
      ],
      manifest: {
        name: 'GIS Toolbox',
        short_name: 'GIS Toolbox',
        description: 'Free browser-based GIS toolkit. Import, transform, visualize, and export geospatial data — Shapefile, GeoJSON, KML, KMZ, CSV, Excel & more.',
        start_url: './',
        scope: './',
        id: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0f1117',
        theme_color: '#1c1c1e',
        categories: ['utilities', 'productivity'],
        lang: 'en-US',
        icons: [
          {
            src: 'icons/PWAicon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icons/PWAicon.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icons/PWAicon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: 'icons/PWAicon.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/(unpkg\.com|cdn\.sheetjs\.com|cdn\.jsdelivr\.net)\//i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gis-toolbox-cdn-libs',
              expiration: {
                maxEntries: 64,
                maxAgeSeconds: 60 * 60 * 24 * 30
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        mapWindow: resolve(__dirname, 'map-window.html')
      },
      output: {
        manualChunks: createManualChunks
      }
    }
  }
});
