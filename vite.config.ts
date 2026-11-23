import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { devvit } from '@devvit/start/vite';

export default defineConfig({
  // Relative asset paths so the build also loads from file:// (local testing).
  base: './',
  plugins: [react(), tailwind(), devvit()],
});
