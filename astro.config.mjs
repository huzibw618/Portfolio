import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import basicSsl from '@vitejs/plugin-basic-ssl';

// HTTPS dev server is opt-in (for testing on a real iPhone): run with
//   HTTPS_DEV=1 npm run dev -- --host
// Default `npm run dev` stays plain HTTP for desktop. Production build untouched.
const httpsDev = process.argv.includes('dev') && process.env.HTTPS_DEV === '1';

export default defineConfig({
  integrations: [tailwind()],
  output: 'static',
  vite: {
    plugins: httpsDev ? [basicSsl()] : [],
    server: httpsDev ? { https: true, host: true } : {},
  },
});
