import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
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
        upload: resolve(root, "upload.html"),
      },
    },
  },
});
