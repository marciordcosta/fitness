import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [svelte()],
  build: {
    rollupOptions: {
      input: {
        index: resolve(root, "index.html"),
        login: resolve(root, "login.html"),
        treino: resolve(root, "treino.html"),
        treino_progresso: resolve(root, "treino_progresso.html"),
        exercicios: resolve(root, "exercicios.html"),
        comparacao: resolve(root, "comparacao.html"),
        galeria: resolve(root, "galeria.html"),
        carrossel: resolve(root, "carrossel.html"),
      },
    },
  },
});
