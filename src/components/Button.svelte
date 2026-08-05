<script lang="ts">
  import type { Snippet } from "svelte";

  interface ButtonProps {
    variant?: "primary" | "secondary" | "accent" | "danger";
    type?: "button" | "submit";
    disabled?: boolean;
    onclick?: (event: MouseEvent) => void;
    children?: Snippet;
  }

  let { variant = "primary", type = "button", disabled = false, onclick, children }: ButtonProps =
    $props();
</script>

<button class="btn btn-{variant}" {type} {disabled} {onclick}>
  {@render children?.()}
</button>

<style>
  .btn {
    width: 100%;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: none;
    font-size: var(--font-size-base);
    font-weight: 600;
    cursor: pointer;
  }
  .btn:active {
    transform: scale(0.98);
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .btn-primary {
    background: var(--color-primary);
    color: var(--color-primary-fg);
  }
  .btn-secondary {
    background: var(--surface-border);
    color: var(--surface-fg);
  }
  .btn-accent {
    background: var(--color-accent);
    color: #0b3d1f;
  }
  .btn-danger {
    background: var(--color-danger);
    color: #fff;
  }
</style>
