<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children?: Snippet } = $props();
</script>

<div class="card">
  {@render children?.()}
</div>

<style>
  .card {
    background: var(--surface-card);
    padding: var(--space-4);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
    margin-bottom: var(--space-4);
  }
</style>
