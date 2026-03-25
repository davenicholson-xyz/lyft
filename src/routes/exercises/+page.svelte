<script lang="ts">
  import { goto } from '$app/navigation';
  import { getExercises, renameExercise } from '../exercises.remote';

  let dialogEl  = $state<HTMLDialogElement | null>(null);
  let selected  = $state<string | null>(null);
  let renameTo  = $state('');
  let tab       = $state<'rename' | 'merge'>('rename');
  let mergeTarget = $state('');
  let mergeSearch = $state('');
  let saving    = $state(false);

  let allExercises     = $state<{ name: string; logs: number }[]>([]);
  let exercisesPromise = $state(getExercises());

  let mergeFiltered = $derived(
    allExercises
      .filter(e => e.name !== selected)
      .filter(e => mergeSearch.trim() === '' || e.name.toLowerCase().includes(mergeSearch.toLowerCase()))
  );

  function openDialog(name: string, exercises: { name: string; logs: number }[]) {
    selected    = name;
    renameTo    = name;
    mergeTarget = '';
    mergeSearch = '';
    tab         = 'rename';
    allExercises = exercises;
    dialogEl?.showModal();
  }

  async function handleRename() {
    if (!selected || !renameTo.trim() || renameTo.trim() === selected) return;
    saving = true;
    await renameExercise({ from: selected, to: renameTo.trim().toLowerCase() });
    saving = false;
    dialogEl?.close();
    exercisesPromise = getExercises();
  }

  async function handleMerge() {
    if (!selected || !mergeTarget) return;
    saving = true;
    await renameExercise({ from: selected, to: mergeTarget });
    saving = false;
    dialogEl?.close();
    exercisesPromise = getExercises();
  }
</script>

<div class="max-w-lg mx-auto p-4 pb-24">
  <div class="flex items-center gap-3 pt-2 mb-1">
    <button class="btn btn-ghost btn-sm btn-circle" onclick={() => goto('/settings')}>
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
      </svg>
    </button>
    <div>
      <h1 class="text-xl font-bold leading-tight">Exercises</h1>
      <p class="text-xs text-base-content/50">Rename or merge duplicates. All historical logs are updated.</p>
    </div>
  </div>

  {#await exercisesPromise}
    <div class="flex justify-center py-12"><span class="loading loading-spinner loading-md"></span></div>
  {:then exercises}
    {#if exercises.length === 0}
      <p class="text-sm text-base-content/40 px-1 py-6">No exercises logged yet.</p>
    {:else}
      <div class="bg-base-200 rounded-2xl overflow-hidden mt-4">
        {#each exercises as ex, i (ex.name)}
          <div class="flex items-center gap-3 px-4 py-3 {i < exercises.length - 1 ? 'border-b border-base-300' : ''}">
            <span class="flex-1 text-sm capitalize">{ex.name}</span>
            {#if ex.logs > 0}
              <span class="text-xs text-base-content/30 tabular-nums">{ex.logs} sets</span>
            {/if}
            <button
              class="text-xs text-base-content/40 hover:text-primary transition-colors ml-2"
              onclick={() => openDialog(ex.name, exercises)}
            >Edit</button>
          </div>
        {/each}
      </div>
    {/if}
  {/await}
</div>

<!-- Edit dialog -->
<dialog bind:this={dialogEl} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box">
    <h3 class="font-bold text-base mb-4 capitalize">{selected}</h3>

    <!-- Tabs -->
    <div class="flex rounded-lg overflow-hidden border border-base-300 text-xs mb-4 w-fit">
      <button
        class="px-4 py-1.5 transition-colors {tab === 'rename' ? 'bg-base-content text-base-100' : 'text-base-content/50 hover:text-base-content/80'}"
        onclick={() => tab = 'rename'}
      >Rename</button>
      <button
        class="px-4 py-1.5 border-l border-base-300 transition-colors {tab === 'merge' ? 'bg-base-content text-base-100' : 'text-base-content/50 hover:text-base-content/80'}"
        onclick={() => tab = 'merge'}
      >Merge into</button>
    </div>

    {#if tab === 'rename'}
      <div class="space-y-3">
        <input
          type="text"
          class="input input-bordered w-full"
          bind:value={renameTo}
          onkeydown={(e) => e.key === 'Enter' && handleRename()}
          autocomplete="off"
        />
        <div class="modal-action mt-0">
          <button class="btn btn-ghost" onclick={() => dialogEl?.close()}>Cancel</button>
          <button
            class="btn btn-primary"
            disabled={!renameTo.trim() || renameTo.trim() === selected || saving}
            onclick={handleRename}
          >{saving ? 'Saving…' : 'Rename'}</button>
        </div>
      </div>

    {:else}
      <div class="space-y-3">
        <p class="text-xs text-base-content/50">All logs for <span class="capitalize font-medium">{selected}</span> will be moved to the selected exercise.</p>
        <input
          type="text"
          class="input input-sm input-bordered w-full"
          placeholder="Search exercises…"
          bind:value={mergeSearch}
          autocomplete="off"
        />
        <div class="max-h-48 overflow-y-auto rounded-xl border border-base-300 divide-y divide-base-300">
          {#if mergeFiltered.length === 0}
            <p class="text-xs text-base-content/40 px-4 py-3">No matches</p>
          {:else}
            {#each mergeFiltered as ex}
              <button
                class="w-full flex items-center justify-between px-4 py-2.5 hover:bg-base-200 transition-colors {mergeTarget === ex.name ? 'bg-base-200' : ''}"
                onclick={() => mergeTarget = ex.name}
              >
                <span class="text-sm capitalize">{ex.name}</span>
                {#if mergeTarget === ex.name}
                  <span class="text-primary text-xs">✓</span>
                {/if}
              </button>
            {/each}
          {/if}
        </div>
        <div class="modal-action mt-0">
          <button class="btn btn-ghost" onclick={() => dialogEl?.close()}>Cancel</button>
          <button
            class="btn btn-error"
            disabled={!mergeTarget || saving}
            onclick={handleMerge}
          >{saving ? 'Merging…' : 'Merge'}</button>
        </div>
      </div>
    {/if}
  </div>
  <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
