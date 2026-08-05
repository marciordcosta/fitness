<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type { Chart as ChartInstance, ChartConfiguration } from "chart.js";
  import { ensureChartRegistered } from "../lib/chart";

  interface ChartPanelProps {
    config: ChartConfiguration;
    height?: number;
  }

  let { config, height = 260 }: ChartPanelProps = $props();

  let canvasEl: HTMLCanvasElement;
  let chart: ChartInstance | null = null;

  onMount(() => {
    const Chart = ensureChartRegistered();
    chart = new Chart(canvasEl, config);
  });

  $effect(() => {
    if (!chart) return;
    chart.data = config.data;
    if (config.options) chart.options = config.options;
    chart.update();
  });

  onDestroy(() => {
    chart?.destroy();
  });
</script>

<canvas bind:this={canvasEl} style="height: {height}px; width: 100%;"></canvas>
