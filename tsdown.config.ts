import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['./index.ts', './configure.ts', './providers/*.ts', './src/**/*.ts', './stubs/main.ts'],
  outDir: './build',
  clean: true,
  format: 'esm',
  fixedExtension: false,
  dts: false,
  unbundle: true,
  treeshake: false,
  target: 'esnext',
})
