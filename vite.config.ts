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
          { src: 'icono-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icono-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // Las teselas de OSM se cachean para que una ruta ya consultada
        // siga siendo legible sin conexión (historia H9).
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\/.*/i,
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
