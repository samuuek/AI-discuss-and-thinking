import { defineConfig } from '@tarojs/cli'

export default defineConfig({
  projectName: '思屿',
  date: '2026-08-19',
  designWidth: 750,
  deviceRatio: { 750: 1 },
  sourceRoot: 'src',
  outputRoot: 'dist',
  framework: 'react',
  compiler: 'webpack5',
  cache: { enable: false },
  mini: { postcss: { pxtransform: { enable: true } } },
})
