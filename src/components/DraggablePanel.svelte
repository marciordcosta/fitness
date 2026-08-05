<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * Painel flutuante arrastável — fonte única. Antes existiam 4
   * implementações desse mesmo padrão (painel_grafico.js com Pointer
   * Events + setPointerCapture, painel_progresso.js quase idêntica mas sem
   * setPointerCapture, uma 3ª cópia manual dentro do próprio
   * painel_progresso.js, e uma 4ª em treino.html usando mouse events em vez
   * de Pointer Events). Fica só esta, baseada em Pointer Events (funciona
   * com mouse e touch, e setPointerCapture evita perder o drag ao mover o
   * ponteiro rápido para fora do elemento).
   */
  interface DraggablePanelProps {
    title?: string;
    initialX?: number;
    initialY?: number;
    onClose?: () => void;
    children?: Snippet;
  }

  let { title = "", initialX = 80, initialY = 80, onClose, children }: DraggablePanelProps =
    $props();

  let posX = $state(initialX);
  let posY = $state(initialY);
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  function onPointerDown(event: PointerEvent) {
    dragging = true;
    offsetX = event.clientX - posX;
    offsetY = event.clientY - posY;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent) {
    if (!dragging) return;
    posX = event.clientX - offsetX;
    posY = event.clientY - offsetY;
  }

  function onPointerUp() {
    dragging = false;
  }
</script>

<div class="painel" style="left:{posX}px; top:{posY}px;">
  <div
    class="painel-topo"
    role="button"
    tabindex="0"
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
  >
    <span class="painel-titulo">{title}</span>
    {#if onClose}
      <button class="painel-fechar" onclick={onClose} aria-label="Fechar">×</button>
    {/if}
  </div>
  <div class="painel-corpo">
    {@render children?.()}
  </div>
</div>

<style>
  .painel {
    position: fixed;
    background: var(--surface-card);
    color: var(--surface-fg);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-float);
    z-index: 9999;
    min-width: 240px;
    touch-action: none;
  }
  .painel-topo {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--surface-border);
    cursor: grab;
    user-select: none;
  }
  .painel-titulo {
    font-weight: 600;
    font-size: var(--font-size-sm);
  }
  .painel-fechar {
    border: none;
    background: transparent;
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
    color: var(--surface-muted);
  }
  .painel-corpo {
    padding: var(--space-3);
  }
</style>
