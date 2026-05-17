import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve('projects/app/src'),
      '@fastgpt': resolve('packages'),
      '@test': resolve('test')
    }
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['test/cases/hivechat-sandbox/**/*.test.ts', 'test/cases/service/core/app/tool/localSystemToolResponses.test.ts'],
    coverage: {
      enabled: false
    },
    pool: 'threads'
  }
});
