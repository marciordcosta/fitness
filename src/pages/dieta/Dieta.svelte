<script lang="ts">
  import { onMount } from "svelte";
  import Card from "../../components/Card.svelte";
  import BottomNav from "../../components/BottomNav.svelte";
  import { requireAuth } from "../../lib/auth";

  let ready = $state(false);

  onMount(async () => {
    await requireAuth();
    ready = true;
  });
</script>

{#if ready}
  <div class="page has-bottom-nav">
    <div class="container">
      <h1>Dieta</h1>
      <Card>
        <p>Em breve — essa seção ainda está sendo construída.</p>
      </Card>
    </div>
  </div>
  <BottomNav />
{/if}

<style>
  .page {
    min-height: 100vh;
  }
  .container {
    max-width: 600px;
    margin: 0 auto;
    padding: var(--space-4);
  }
  h1 {
    font-size: var(--font-size-lg);
    margin: var(--space-2) 0 var(--space-4);
  }
</style>
