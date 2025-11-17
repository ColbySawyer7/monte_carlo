import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dotenv from 'dotenv';

// load .env file
dotenv.config();

// use variables defined in .env
const serverPort = parseInt(process.env.VITE_FRONTEND_PORT || "3010", 10);
const previewPort = parseInt(process.env.VITE_FRONTEND_PREVIEW_PORT || "3011", 10);

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/sorsim/' : '/', // only use /sorsim/ base in production

  server: { // main server when using the dev script
    port: serverPort,
  },

  preview: { // preview server to preview dist after build script
    port: previewPort,
  },

  // vite plugin config
  plugins: [
    vue() // enables vue.js support
  ],

}))
