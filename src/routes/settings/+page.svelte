<script lang="ts">
  import { getClaudeSpend } from '../settings.remote';
  import { getStravaStatus } from '../strava.remote';
</script>

<div class="max-w-lg mx-auto p-4 pb-24">
  <h1 class="text-xl font-bold mb-6 pt-2">Settings</h1>

  <!-- Claude -->
  <section class="mb-6">
    <h2 class="text-xs font-semibold uppercase tracking-wide text-base-content/40 mb-3">Claude API</h2>
    <div class="bg-base-200 rounded-2xl divide-y divide-base-300">
      {#await getClaudeSpend()}
        <div class="px-4 py-3 flex justify-center">
          <span class="loading loading-spinner loading-sm"></span>
        </div>
      {:then spend}
        <div class="px-4 py-3 flex items-center justify-between">
          <span class="text-sm">This month</span>
          <span class="text-sm font-semibold">${spend.month_usd.toFixed(4)}</span>
        </div>
        <div class="px-4 py-3 flex items-center justify-between">
          <span class="text-sm">All time</span>
          <span class="text-sm font-semibold">${spend.total_usd.toFixed(4)}</span>
        </div>
        <div class="px-4 py-3 flex items-center justify-between">
          <span class="text-sm text-base-content/50">Total calls</span>
          <span class="text-sm text-base-content/50">{spend.total_calls}</span>
        </div>
        <div class="px-4 py-3 flex items-center justify-between">
          <span class="text-sm text-base-content/50">Billing dashboard</span>
          <a
            href="https://console.anthropic.com/settings/usage"
            target="_blank"
            rel="noopener"
            class="text-sm text-primary"
          >Console ↗</a>
        </div>
      {/await}
    </div>
  </section>

  <!-- Strava -->
  <section class="mb-6">
    <h2 class="text-xs font-semibold uppercase tracking-wide text-base-content/40 mb-3">Strava</h2>
    <div class="bg-base-200 rounded-2xl divide-y divide-base-300">
      {#await getStravaStatus()}
        <div class="px-4 py-3 flex justify-center">
          <span class="loading loading-spinner loading-sm"></span>
        </div>
      {:then status}
        <div class="px-4 py-3 flex items-center justify-between">
          <span class="text-sm">Connection</span>
          {#if status.connected}
            <span class="badge badge-success badge-sm">Connected</span>
          {:else}
            <a href="/strava/connect" class="text-sm text-primary">Connect ↗</a>
          {/if}
        </div>
      {/await}
    </div>
  </section>
</div>
