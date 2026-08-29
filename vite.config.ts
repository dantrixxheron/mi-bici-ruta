import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'MiRuta — rutas MiBici sin cargos extra',
        short_name: 'MiRuta',
        description:
          'Planea tu ruta en MiBici partiéndola en tramos que nunca exceden los 30 minutos gratuitos.',
        theme_color: '#065f46',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        lang: 'es-MX',
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        // Los datos NO se precachean: precargar grafo.json en la instalación
        // del service worker lo descargaría dos veces y anularía la carga
        // diferida. Se cachean cuando la app realmente los pide.
        globIgnores: ['**/datos/**'],
        runtimeCaching: [
          {
            urlPattern: /\/datos\/.*\.json$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'datos-miruta',
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // Teselas cacheadas para que una ruta ya consultada siga siendo
            // legible sin conexión (historia H9).
            urlPattern: /^https:\/\/tile\.openstreetmap\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'teselas-osm',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 14 },
            },
          },
        ],
      },
    }),
  ],
});
