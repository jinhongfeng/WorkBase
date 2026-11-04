import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

const alias = { '@shared': resolve('src/shared'), '@renderer': resolve('src/renderer/src') }
export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()], resolve: { alias }, build: {
    emptyOutDir: false, outDir: 'dist/main', rollupOptions: { external: ['better-sqlite3', 'electron'] }
  } },
  preload: { plugins: [externalizeDepsPlugin()], resolve: { alias }, build: {
    emptyOutDir: false, outDir: 'dist/preload', rollupOptions: { external: ['better-sqlite3', 'electron'], output: { format: 'cjs', entryFileNames: 'index.cjs' } }
  } },
  renderer: { plugins: [tailwindcss()], resolve: { alias }, build: { emptyOutDir: false, outDir: 'dist/renderer' } }
})
