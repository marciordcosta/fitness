import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import annotationPlugin from "chartjs-plugin-annotation";

/**
 * Registro único do Chart.js via npm (versão pinada no package.json).
 * Substitui as 3 formas diferentes que existiam antes de carregar Chart.js
 * (CDN sem pin, CDN pin @2, CDN pin @4.4.0 lazy-loaded) e as 2 cópias de
 * `ensureChartJsLoaded`/`ensureChartJsLoaded_Progresso`. Só registra os
 * controllers/elementos realmente usados no app (linha e barra).
 */
let registered = false;

export function ensureChartRegistered(): typeof Chart {
  if (!registered) {
    Chart.register(
      LineController,
      BarController,
      LineElement,
      BarElement,
      PointElement,
      CategoryScale,
      LinearScale,
      Tooltip,
      Legend,
      Filler,
      annotationPlugin
    );
    registered = true;
  }
  return Chart;
}

export { Chart };
