import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Conditionally import bundle visualizer (only when ANALYZE=true)
// Install with: npm install --save-dev rollup-plugin-visualizer
const visualizerPlugin = process.env.ANALYZE === 'true'
  ? (await import('rollup-plugin-visualizer')).visualizer({
      open: true,
      filename: 'dist/stats.html',
      gzipSize: true,
      brotliSize: true,
    })
  : null;

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    ...(visualizerPlugin ? [visualizerPlugin] : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Strip console.* and debugger statements from production bundles.
  // `console.error` and `console.warn` are preserved — they communicate real
  // problems to anyone reading the browser console in production. Dev builds
  // (`vite` / `vite dev`) are unaffected.
  esbuild: {
    drop: ['debugger'],
    pure: ['console.log', 'console.info', 'console.debug', 'console.trace'],
  },
  build: {
    // Raise the warning threshold slightly — vendor chunks are expected to be large
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Split vendor libraries into named chunks so they are cached independently.
        // Browsers re-download a chunk only when its content changes; app code changes
        // far more often than React or framer-motion, so splitting keeps those cached.
        manualChunks: {
          'vendor-react':   ['react', 'react-dom', 'react-router-dom'],
          'vendor-framer':  ['framer-motion'],
          'vendor-socket':  ['socket.io-client'],
          'vendor-lucide':  ['lucide-react'],
          'vendor-markdown': ['react-markdown'],
        },
      },
    },
  },
  server: {
    host: '0.0.0.0', // Bind to all interfaces (required for Docker)
    port: 3000,
    allowedHosts: [
      'localhost', // Always allow localhost for development
      // Add custom domains via VITE_ALLOWED_HOSTS env var (comma-separated)
      ...(process.env.VITE_ALLOWED_HOSTS?.split(',').map(h => h.trim()).filter(Boolean) || []),
    ].filter(Boolean),
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || process.env.VITE_API_URL || 'http://localhost:4000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: process.env.VITE_PROXY_TARGET || process.env.VITE_API_URL || 'http://localhost:4000',
        ws: true,
      },
    },
  },
})
