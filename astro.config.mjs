import { defineConfig } from 'astro/config';

export default defineConfig({
  build: {
    // 强制输出 .html 结尾的文件，如 /about.html、/products/solid-bamboo-flooring.html
    format: 'file'
  },
  trailingSlash: 'never'
});