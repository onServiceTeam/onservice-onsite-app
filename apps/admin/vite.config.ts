import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'data-vendor': ['@tanstack/react-query', 'zustand', 'zod'],
          'ui-vendor': [
            '@radix-ui/react-checkbox',
            '@radix-ui/react-dialog',
            '@radix-ui/react-label',
            '@radix-ui/react-select',
            '@radix-ui/react-switch',
            '@radix-ui/react-tabs',
            '@radix-ui/react-tooltip',
            'lucide-react',
            'sonner',
          ],
          'charts-vendor': ['recharts'],
          'maps-vendor': ['leaflet', 'react-leaflet'],
        },
      },
    },
  },
  server: {
    port: 7382,
    proxy: {
      '/api': {
        target: 'http://localhost:7381',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:7381',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
