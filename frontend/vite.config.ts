import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// The bundle visualizer (a devDependency), loaded only for npm run build:analyze
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
    tailwindcss(),
    ...(visualizerPlugin ? [visualizerPlugin] : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    // Raise the warning threshold slightly: vendor chunks are expected to be large
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      // Remove console.log, info, debug and trace calls from the production
      // bundle: they print chat messages, secret rolls and token details.
      // console.error and console.warn stay, so real problems still reach the
      // browser console. The minifier already drops `debugger` statements.
      // The dev server (`vite`) bundles nothing, so development keeps every
      // log.
      treeshake: {
        manualPureFunctions: ['console.log', 'console.info', 'console.debug', 'console.trace'],
      },
      output: {
        // Split vendor libraries into named chunks so they are cached independently.
        // Browsers re-download a chunk only when its content changes; app code changes
        // far more often than React or framer-motion, so splitting keeps those cached.
        // A group also takes in the modules its packages import.
        codeSplitting: {
          groups: [
            { name: 'vendor-react', test: /[\\/]node_modules[\\/](react|react-dom|react-router)[\\/]/ },
            { name: 'vendor-framer', test: /[\\/]node_modules[\\/]framer-motion[\\/]/ },
            { name: 'vendor-socket', test: /[\\/]node_modules[\\/]socket\.io-client[\\/]/ },
            { name: 'vendor-lucide', test: /[\\/]node_modules[\\/]lucide-react[\\/]/ },
            { name: 'vendor-markdown', test: /[\\/]node_modules[\\/]react-markdown[\\/]/ },
          ],
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
