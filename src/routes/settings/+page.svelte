<script lang="ts">
  import { getClaudeSpend } from '../settings.remote';
  import { getStravaStatus, registerWebhook, unregisterWebhook } from '../strava.remote';
  import { importData } from '../data.remote';
  import { getUserSettings, setUserSetting } from '../user-settings.remote';
  import { getTemplates, deleteTemplate } from '../templates.remote';

  let webhookWorking = $state(false);
  let stravaPromise  = $state(getStravaStatus());

  let importing      = $state(false);
  let importError    = $state<string | null>(null);
  let importSuccess  = $state(false);
  let fileInputEl    = $state<HTMLInputElement | null>(null);

  async function handleImport(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    importing     = true;
    importError   = null;
    importSuccess = false;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await importData(data);
      importSuccess = true;
    } catch (err) {
      importError = err instanceof Error ? err.message : 'Import failed';
    } finally {
      importing = false;
      if (fileInputEl) fileInputEl.value = '';
    }
  }

  async function handleRegister() {
    webhookWorking = true;
    await registerWebhook();
    stravaPromise  = getStravaStatus();
    webhookWorking = false;
  }

  async function handleUnregister() {
    webhookWorking = true;
    await unregisterWebhook();
    stravaPromise  = getStravaStatus();
    webhookWorking = false;
  }

  let settingsPromise   = $state(getUserSettings());
  let templatesPromise  = $state(getTemplates());

  async function handlePhaseChange(e: Event) {
    const val = (e.target as HTMLSelectElement).value;
    await setUserSetting({ key: 'phase', value: val });
    settingsPromise = getUserSettings();
  }

  async function handleRestrictionsBlur(e: Event) {
    const val = (e.target as HTMLInputElement).value.trim();
    await setUserSetting({ key: 'restrictions', value: val });
  }

  async function handleDeleteTemplate(id: number) {
    await deleteTemplate({ id });
    templatesPromise = getTemplates();
  }
</script>

<div class="max-w-lg mx-auto p-4 pb-24">
  <h1 class="text-xl font-bold mb-6 pt-2">Settings</h1>

  <!-- Data management -->
  <section class="mb-6">
    <h2 class="text-xs font-semibold uppercase tracking-wide text-base-content/40 mb-3">Data</h2>
    <div class="bg-base-200 rounded-2xl divide-y divide-base-300 mb-3">
      <div class="px-4 py-3 flex items-center justify-between">
        <div>
          <div class="text-sm font-medium">Export</div>
          <div class="text-xs text-base-content/50">Download all data as JSON</div>
        </div>
        <a href="/api/export" download class="btn btn-xs btn-outline">Export</a>
      </div>
      <div class="px-4 py-3 flex items-center justify-between">
        <div>
          <div class="text-sm font-medium">Import</div>
          <div class="text-xs text-base-content/50">Restore from a JSON export — replaces all data</div>
        </div>
        <button class="btn btn-xs btn-outline" onclick={() => fileInputEl?.click()} disabled={importing}>
          {importing ? 'Importing…' : 'Import'}
        </button>
        <input bind:this={fileInputEl} type="file" accept=".json" class="hidden" onchange={handleImport} />
      </div>
    </div>
    {#if importSuccess}
      <p class="text-xs text-success px-1 mb-3">Import successful. Reload the app to see your data.</p>
    {/if}
    {#if importError}
      <p class="text-xs text-error px-1 mb-3">{importError}</p>
    {/if}
  </section>

  <!-- Training context -->
  <section class="mb-6">
    <h2 class="text-xs font-semibold uppercase tracking-wide text-base-content/40 mb-3">Training</h2>
    {#await settingsPromise}
      <div class="bg-base-200 rounded-2xl px-4 py-3"><span class="loading loading-spinner loading-xs"></span></div>
    {:then settings}
      <div class="bg-base-200 rounded-2xl divide-y divide-base-300">
        <div class="px-4 py-3 flex items-center justify-between">
          <span class="text-sm">Phase</span>
          <select
            class="select select-sm select-ghost text-right"
            value={settings.phase ?? ''}
            onchange={handlePhaseChange}
          >
            <option value="">Not set</option>
            <option value="hypertrophy">Hypertrophy</option>
            <option value="strength">Strength</option>
            <option value="endurance">Endurance</option>
            <option value="deload">Deload</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </div>
        <div class="px-4 py-3">
          <span class="text-sm block mb-1.5">Movement restrictions</span>
          <input
            type="text"
            class="input input-sm input-bordered w-full"
            placeholder="e.g. no overhead press, knee injury…"
            value={settings.restrictions ?? ''}
            onblur={handleRestrictionsBlur}
          />
        </div>
        <a href="/recovery" class="flex items-center justify-between px-4 py-3 hover:bg-base-300 transition-colors">
          <span class="text-sm">Recovery log</span>
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-base-content/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
          </svg>
        </a>
        <a href="/analytics" class="flex items-center justify-between px-4 py-3 hover:bg-base-300 transition-colors">
          <span class="text-sm">Strength analytics</span>
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-base-content/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
          </svg>
        </a>
      </div>
    {/await}
  </section>

  <!-- Templates -->
  <section class="mb-6">
    <h2 class="text-xs font-semibold uppercase tracking-wide text-base-content/40 mb-3">Workout Templates</h2>
    {#await templatesPromise}
      <div class="bg-base-200 rounded-2xl px-4 py-3"><span class="loading loading-spinner loading-xs"></span></div>
    {:then templates}
      {#if templates.length === 0}
        <p class="text-xs text-base-content/40 px-1">No templates yet. Save a workout as a template from the workout page.</p>
      {:else}
        <div class="bg-base-200 rounded-2xl overflow-hidden">
          {#each templates as tpl, i (tpl.id)}
            <div class="flex items-center px-4 py-3 {i < templates.length - 1 ? 'border-b border-base-300' : ''}">
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium">{tpl.name}</p>
                <p class="text-xs text-base-content/40 truncate">{tpl.notes}</p>
              </div>
              <button
                class="text-base-content/25 hover:text-error transition-colors text-xs ml-3"
                onclick={() => handleDeleteTemplate(tpl.id)}
              >✕</button>
            </div>
          {/each}
        </div>
      {/if}
    {/await}
  </section>

  <!-- Exercises -->
  <section class="mb-6">
    <h2 class="text-xs font-semibold uppercase tracking-wide text-base-content/40 mb-3">Exercises</h2>
    <a href="/exercises" class="flex items-center justify-between bg-base-200 rounded-2xl px-4 py-3 hover:bg-base-300 transition-colors">
      <div>
        <div class="text-sm font-medium">Exercises</div>
        <div class="text-xs text-base-content/50">Rename or merge duplicate exercise names</div>
      </div>
      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-base-content/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
      </svg>
    </a>
  </section>

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
      {#await stravaPromise}
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
        {#if status.lastSyncAt}
          <div class="px-4 py-3 flex items-center justify-between">
            <span class="text-sm text-base-content/50">Last sync</span>
            <span class="text-xs text-base-content/40">
              {new Date(status.lastSyncAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        {/if}
        <div class="px-4 py-3 flex items-center justify-between">
          <span class="text-sm">Webhook</span>
          {#if status.webhookId != null}
            <div class="flex items-center gap-2">
              <span class="badge badge-success badge-sm">Active</span>
              <button
                class="text-xs text-base-content/40 hover:text-error transition-colors"
                disabled={webhookWorking}
                onclick={handleUnregister}
              >Remove</button>
            </div>
          {:else}
            <button
              class="btn btn-xs btn-outline"
              disabled={!status.connected || webhookWorking}
              onclick={handleRegister}
            >{webhookWorking ? 'Registering…' : 'Register'}</button>
          {/if}
        </div>
      {/await}
    </div>
  </section>
</div>
