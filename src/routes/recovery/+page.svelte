<script lang="ts">
  import { goto } from '$app/navigation';
  import { getRecoveryLogs, addRecoveryLog, deleteRecoveryLog } from '../recovery.remote';

  let logsPromise = $state(getRecoveryLogs());
  let dialogEl    = $state<HTMLDialogElement | null>(null);
  let saving      = $state(false);

  let form = $state({
    date:        new Date().toISOString().slice(0, 10),
    sleep_hours: '',
    soreness:    '',
    notes:       '',
  });

  async function handleSave() {
    saving = true;
    await addRecoveryLog({
      date:        form.date,
      sleep_hours: form.sleep_hours ? parseFloat(form.sleep_hours) : null,
      soreness:    form.soreness    ? parseInt(form.soreness)       : null,
      notes:       form.notes.trim() || null,
    });
    dialogEl?.close();
    saving      = false;
    logsPromise = getRecoveryLogs();
  }

  async function handleDelete(id: number) {
    await deleteRecoveryLog({ id });
    logsPromise = getRecoveryLogs();
  }

  function sorenessLabel(n: number) {
    if (n <= 2) return 'Fresh';
    if (n <= 4) return 'Light';
    if (n <= 6) return 'Moderate';
    if (n <= 8) return 'Heavy';
    return 'Very sore';
  }

  function sorenessColor(n: number) {
    if (n <= 2) return 'text-success';
    if (n <= 5) return 'text-warning';
    return 'text-error';
  }
</script>

<div class="max-w-lg mx-auto p-4 pb-24">
  <div class="flex items-center gap-3 pt-2 mb-6">
    <button class="btn btn-ghost btn-sm btn-circle" onclick={() => goto('/')}>
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
      </svg>
    </button>
    <h1 class="text-xl font-bold flex-1">Recovery</h1>
    <button
      class="btn btn-sm btn-primary"
      onclick={() => { form.date = new Date().toISOString().slice(0, 10); dialogEl?.showModal(); }}
    >+ Log</button>
  </div>

  {#await logsPromise}
    <div class="flex justify-center py-12"><span class="loading loading-spinner loading-md"></span></div>
  {:then logs}
    {#if logs.length === 0}
      <div class="text-center py-16">
        <p class="text-base-content/40 text-sm">No recovery logs yet.</p>
        <p class="text-base-content/30 text-xs mt-1">Log sleep and soreness daily to track recovery.</p>
      </div>
    {:else}
      <div class="bg-base-200 rounded-2xl overflow-hidden">
        {#each logs as log, i (log.id)}
          <div class="px-4 py-3 {i < logs.length - 1 ? 'border-b border-base-300' : ''}">
            <div class="flex items-center justify-between mb-0.5">
              <span class="text-sm font-medium">
                {new Date(log.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
              </span>
              <button
                class="text-base-content/25 hover:text-error transition-colors text-xs"
                onclick={() => handleDelete(log.id)}
              >✕</button>
            </div>
            <div class="flex items-center gap-4 text-xs text-base-content/50">
              {#if log.sleep_hours != null}
                <span>😴 {log.sleep_hours}h sleep</span>
              {/if}
              {#if log.soreness != null}
                <span class={sorenessColor(log.soreness)}>⚡ {log.soreness}/10 — {sorenessLabel(log.soreness)}</span>
              {/if}
            </div>
            {#if log.notes}
              <p class="text-xs text-base-content/40 mt-1">{log.notes}</p>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  {/await}
</div>

<dialog bind:this={dialogEl} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box">
    <h3 class="font-bold text-lg mb-4">Log recovery</h3>
    <div class="space-y-3">
      <div>
        <label class="text-xs text-base-content/50 mb-1 block">Date</label>
        <input type="date" class="input input-bordered w-full" bind:value={form.date} />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="text-xs text-base-content/50 mb-1 block">Sleep (hours)</label>
          <input type="number" inputmode="decimal" step="0.5" min="0" max="24" placeholder="8"
            class="input input-bordered w-full" bind:value={form.sleep_hours} />
        </div>
        <div>
          <label class="text-xs text-base-content/50 mb-1 block">Soreness (1–10)</label>
          <input type="number" inputmode="numeric" min="1" max="10" placeholder="5"
            class="input input-bordered w-full" bind:value={form.soreness} />
        </div>
      </div>
      <div>
        <label class="text-xs text-base-content/50 mb-1 block">Notes (optional)</label>
        <input type="text" class="input input-bordered w-full" placeholder="Tight hamstrings…" bind:value={form.notes} />
      </div>
    </div>
    <div class="modal-action">
      <button class="btn btn-ghost" onclick={() => dialogEl?.close()}>Cancel</button>
      <button class="btn btn-primary" disabled={saving} onclick={handleSave}>
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
