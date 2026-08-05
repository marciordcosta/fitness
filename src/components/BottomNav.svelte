<script lang="ts">
  /**
   * Barra de navegação fixa inferior, estilo Hevy — substitui os botões de
   * header por página. O app continua multi-page (sem roteador client-side),
   * então cada item é um <a href> normal entre os .html de cada seção. O
   * item ativo é detectado comparando com o nome do arquivo atual.
   */
  interface NavItem {
    href: string;
    label: string;
    icon: "home" | "dumbbell" | "chart" | "photo" | "meal";
  }

  const items: NavItem[] = [
    { href: "index.html", label: "Início", icon: "home" },
    { href: "treino.html", label: "Treino", icon: "dumbbell" },
    { href: "treino_progresso.html", label: "Progresso", icon: "chart" },
    { href: "galeria.html", label: "Fotos", icon: "photo" },
    { href: "dieta.html", label: "Dieta", icon: "meal" },
  ];

  const currentPath =
    typeof window !== "undefined" ? window.location.pathname.split("/").pop() : "";

  function isActive(href: string): boolean {
    return currentPath === href;
  }
</script>

<nav class="bottom-nav">
  {#each items as item (item.href)}
    <a class="nav-item" class:active={isActive(item.href)} href={item.href}>
      <span class="icon" aria-hidden="true">
        {#if item.icon === "home"}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 11l9-8 9 8" />
            <path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10" />
          </svg>
        {:else if item.icon === "dumbbell"}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="6" y1="12" x2="18" y2="12" />
            <rect x="2" y="9" width="3" height="6" rx="1" />
            <rect x="19" y="9" width="3" height="6" rx="1" />
            <rect x="5" y="7" width="2" height="10" rx="1" />
            <rect x="17" y="7" width="2" height="10" rx="1" />
          </svg>
        {:else if item.icon === "chart"}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="4" y1="20" x2="4" y2="12" />
            <line x1="10" y1="20" x2="10" y2="6" />
            <line x1="16" y1="20" x2="16" y2="14" />
            <line x1="21" y1="20" x2="21" y2="9" />
            <line x1="2" y1="20" x2="22" y2="20" />
          </svg>
        {:else if item.icon === "photo"}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <circle cx="8.5" cy="9.5" r="1.5" />
            <path d="M21 15l-5-5-9 9" />
          </svg>
        {:else if item.icon === "meal"}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M7 3v7a2 2 0 0 0 2 2v9" />
            <path d="M7 3v4M11 3v4" />
            <path d="M17 3c-1.5 0-3 1.5-3 4v3a2 2 0 0 0 2 2v9" />
          </svg>
        {/if}
      </span>
      <span class="label">{item.label}</span>
    </a>
  {/each}
</nav>

<style>
  .bottom-nav {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    background: var(--surface-card);
    border-top: 1px solid var(--surface-border);
    padding-bottom: env(safe-area-inset-bottom, 0px);
    z-index: 50;
  }
  .nav-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 8px 0 6px;
    text-decoration: none;
    color: var(--surface-muted);
    font-size: 11px;
  }
  .nav-item.active {
    color: var(--color-primary);
  }
  .icon svg {
    width: 24px;
    height: 24px;
  }
</style>
