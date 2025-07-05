// vite.config.js
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import path from 'node:path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        player: '/player.html',
        settings: '/settings.html',
      },
      output: {
        entryFileNames: '[name].js'
      }
    },
    outDir: 'chrome-ext/',
    assetsDir: '.',
    emptyOutDir: false,
    target: 'esnext',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './')
      },
      dedupe: ['onnxruntime-web']
    }
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/onnxruntime-web/dist/ort-wasm*.wasm',
          dest: 'runtime'
        },
        {
          // Include the helper script so the threaded backend works
          src: 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs',
          dest: 'runtime'
        }
      ]
    })
  ]
});
