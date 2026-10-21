import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// base './' : 빌드본을 file:// 로 열어도(ClassView+ 오프라인) 경로가 맞도록.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5180 },
  test: { include: ['tests/**/*.test.ts'] },
});
