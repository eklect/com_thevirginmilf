import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { defineConfig } from 'vite';

// Dev proxy keeps the browser same-origin with the API, mirroring nginx on the
// dev box. Two modes:
//   default        → proxies /api/* straight to a locally-running NestJS
//                    (npm run start:dev in ../server) with the /api prefix
//                    stripped, exactly like nginx does. Sign-in works here:
//                    the Host stays localhost:5173, which is a registered
//                    callback origin.
//   VIA_DEVBOX=1   → proxies /api/* to https://thevirginmilf.test (the
//                    container's nginx). Content works; the OAuth callback
//                    lands on the .test hostname, so use the default mode for
//                    sign-in work.
const viaDevBox = !!process.env.VIA_DEVBOX;

export default defineConfig({
  // Tailwind v4 is CSS-first: no tailwind.config.ts, no PostCSS, no
  // autoprefixer. The plugin reads the @theme block in src/styles.css.
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    // nginx serves this directory as the `thevirginmilf/site` role.
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': viaDevBox
        ? {
            target: 'https://thevirginmilf.test',
            changeOrigin: true,
            // mkcert certs are host-trusted, but allow the self-signed fallback.
            secure: false,
          }
        : {
            target: 'http://127.0.0.1:3012',
            changeOrigin: false,
            rewrite: (path) => path.replace(/^\/api/, ''),
          },
    },
  },
});
