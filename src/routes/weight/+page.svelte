<script lang="ts">
  import { goto } from '$app/navigation';
  import { getWeightLogs, deleteWeightLog, addWeightLog } from '../weight.remote';

  let logsPromise  = $state(getWeightLogs());
  let addDialogEl  = $state<HTMLDialogElement | null>(null);
  let addDate      = $state(new Date().toISOString().slice(0, 10));
  let addWeight    = $state('');
  let addSaving    = $state(false);

  async function handleDelete(id: number) {
    await deleteWeightLog({ id });
    logsPromise = getWeightLogs();
  }

  async function handleAdd() {
    const kg = parseFloat(addWeight);
    if (!kg || !addDate) return;
    addSaving = true;
    await addWeightLog({ date: addDate, weight_kg: kg });
    addDialogEl?.close();
    addSaving   = false;
    addWeight   = '';
    logsPromise = getWeightLogs();
  }

  function buildChart(logs: { date: string; weight_kg: number }[]) {
    if (logs.length < 2) return null;
    const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
    const W = 320, H = 80, PAD = 8;
    const weights = sorted.map(l => l.weight_kg);
    const minW = Math.min(...weights);
    const maxW = Math.max(...weights);
    const range = maxW - minW || 1;
    const pts = sorted.map((l, i) => {
      const x = PAD + (i / (sorted.length - 1)) * (W - PAD * 2);
      const y = PAD + (1 - (l.weight_kg - minW) / range) * (H - PAD * 2);
      return `${x},${y}`;
    });
    return { pts: pts.join(' '), W, H, minW, maxW, latest: sorted.at(-1)!.weight_kg };
  }
</script>

<div class="max-w-lg mx-auto p-4 pb-24">
  <div class="flex items-center gap-3 pt-2 mb-6">
    <button class="btn btn-ghost btn-sm btn-circle" onclick={() => goto('/')}>
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
      </svg>
    </button>
    <h1 class="text-xl font-bold flex-1">Weight</h1>
    <button class="btn btn-sm btn-primary" onclick={() => { addDate = new Date().toISOString().slice(0, 10); addDialogEl?.showModal(); }}>+ Add</button>
  </div>

  {#await logsPromise}
    <div class="flex justify-center py-12"><span class="loading loading-spinner loading-md"></span></div>
  {:then logs}
    {#if logs.length === 0}
      <div class="text-center py-16">
        <p class="text-base-content/40 text-sm">No weight entries yet.</p>
        <p class="text-base-content/30 text-xs mt-1">Sync from the iOS Shortcut to get started.</p>
      </div>
    {:else}
      {@const chart = buildChart(logs)}

      <!-- Latest + chart -->
      <div class="bg-base-200 rounded-2xl p-4 mb-4">
        <div class="flex items-baseline justify-between mb-3">
          <span class="text-3xl font-bold">{logs[0].weight_kg}<span class="text-base font-normal text-base-content/50 ml-1">kg</span></span>
          <span class="text-xs text-base-content/40">{new Date(logs[0].date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        </div>

        {#if chart}
          <svg viewBox="0 0 {chart.W} {chart.H}" class="w-full" preserveAspectRatio="none">
            <polyline
              points={chart.pts}
              style="fill:none;stroke:var(--color-primary);stroke-width:2;stroke-linecap:round;stroke-linejoin:round"
            />
          </svg>
          <div class="flex justify-between mt-1">
            <span class="text-xs text-base-content/30">{logs.at(-1)!.date.slice(0, 7)}</span>
            <span class="text-xs text-base-content/30">{chart.minW}–{chart.maxW} kg</span>
          </div>
        {/if}
      </div>

      <!-- Log list -->
      <div class="bg-base-200 rounded-2xl overflow-hidden">
        {#each logs as log, i (log.id)}
          <div class="flex items-center px-4 py-3 {i < logs.length - 1 ? 'border-b border-base-300' : ''}">
            <span class="flex-1 text-sm text-base-content/50">
              {new Date(log.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
            </span>
            <span class="text-sm font-medium tabular-nums mr-4">{log.weight_kg} kg</span>
            <button
              class="text-base-content/25 hover:text-error transition-colors text-xs"
              onclick={() => handleDelete(log.id)}
              aria-label="Delete"
            >✕</button>
          </div>
        {/each}
      </div>
    {/if}
  {/await}
</div>

<dialog bind:this={addDialogEl} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box">
    <h3 class="font-bold text-lg mb-4">Add weight</h3>
    <div class="space-y-3">
      <div>
        <label class="text-xs text-base-content/50 mb-1 block">Date</label>
        <input type="date" class="input input-bordered w-full" bind:value={addDate} />
      </div>
      <div>
        <label class="text-xs text-base-content/50 mb-1 block">Weight (kg)</label>
        <input
          type="number" inputmode="decimal" step="0.1" placeholder="0.0"
          class="input input-bordered w-full"
          bind:value={addWeight}
          onkeydown={(e) => { if (e.key === 'Enter') handleAdd(); }}
        />
      </div>
    </div>
    <div class="modal-action">
      <button class="btn btn-ghost" onclick={() => addDialogEl?.close()}>Cancel</button>
      <button class="btn btn-primary" disabled={!addWeight || addSaving} onclick={handleAdd}>
        {addSaving ? 'Saving…' : 'Save'}
      </button>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
