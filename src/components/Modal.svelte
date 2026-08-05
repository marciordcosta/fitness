<script lang="ts">
  import type { Snippet } from "svelte";

  interface ModalProps {
    open: boolean;
    onClose?: () => void;
    children?: Snippet;
  }

  let { open, onClose, children }: ModalProps = $props();
</script>

{#if open}
  <div class="modal" role="dialog" aria-modal="true">
    <button class="modal-backdrop" aria-label="Fechar" onclick={onClose}></button>
    <div class="modal-box">
      {@render children?.()}
    </div>
  </div>
{/if}

<style>
  .modal {
    position: fixed;
    inset: 0;
    display: flex;
    z-index: 100;
  }
  .modal-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    border: none;
    padding: 0;
    cursor: pointer;
  }
  .modal-box {
    position: relative;
    margin: auto;
    background: var(--surface-card);
    color: var(--surface-fg);
    padding: 22px;
    border-radius: 18px;
    width: 94%;
    max-width: 380px;
    max-height: 90vh;
    overflow-y: auto;
    z-index: 10;
    animation: fadeUp 0.25s ease-out;
  }
  @keyframes fadeUp {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
