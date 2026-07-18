import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'

export default defineConfig({
  plugins: [
    vue(),
    dts({
      include: ['src/**/*.ts', 'src/**/*.vue'],
      tsconfigPath: './tsconfig.lib.json',
    }),
  ],

  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        'composables/index': resolve(__dirname, 'src/composables/index.ts'),
        'components/index': resolve(__dirname, 'src/components/index.ts'),
        'utils/index': resolve(__dirname, 'src/utils/index.ts'),
        'keq/index': resolve(__dirname, 'src/keq/index.ts'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: ['vue', 'vue-router', 'keq', '@buka/exception', '@buka/error-codes', '@keq-request/exception', '@vueuse/core'],
    },
    sourcemap: true,
    target: ['chrome87', 'firefox78', 'safari14', 'edge88', 'node18'],
  },
})
