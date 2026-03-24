<script lang="ts">
  import { getNotes, addNote, updateNote, deleteNote } from '../info.remote';

  let newNote   = $state('');
  let editingId = $state<number | null>(null);
  let editText  = $state('');

  async function handleAdd() {
    if (!newNote.trim()) return;
    await addNote({ note: newNote.trim() });
    newNote = '';
  }

  function startEdit(id: number, current: string) {
    editingId = id;
    editText  = current;
  }

  async function handleUpdate() {
    if (editingId === null || !editText.trim()) return;
    await updateNote({ id: editingId, note: editText.trim() });
    editingId = null;
    editText  = '';
  }
</script>

<div class="p-4 max-w-lg mx-auto pb-24">
  <h1 class="text-xl font-bold mb-1 pt-2">Training notes</h1>
  <p class="text-sm text-base-content/50 mb-5">Sent to the AI when generating your weekly plan.</p>

  {#await getNotes()}
    <div class="flex justify-center py-8"><span class="loading loading-spinner loading-md"></span></div>
  {:then notes}

    <div class="bg-base-200 rounded-2xl overflow-hidden mb-4">
      {#if notes.length === 0}
        <p class="text-base-content/40 text-sm px-4 py-3">No notes yet.</p>
      {:else}
        {#each notes as n, i (n.id)}
          <div class="{i < notes.length - 1 ? 'border-b border-base-300' : ''}">
            {#if editingId === n.id}
              <div class="flex items-center gap-2 px-4 py-2">
                <input
                  class="input input-sm input-bordered flex-1"
                  bind:value={editText}
                  onkeydown={(e) => e.key === 'Enter' && handleUpdate()}
                  autofocus
                />
                <button class="btn btn-sm btn-primary" onclick={handleUpdate}>Save</button>
                <button class="btn btn-sm btn-ghost" onclick={() => editingId = null}>✕</button>
              </div>
            {:else}
              <div class="flex items-center px-4 py-2.5">
                <span class="flex-1 text-sm">{n.note}</span>
                <button class="text-xs text-base-content/30 hover:text-primary transition-colors mr-3" onclick={() => startEdit(n.id, n.note)}>Edit</button>
                <button class="text-xs text-base-content/30 hover:text-error transition-colors" onclick={() => deleteNote({ id: n.id })}>✕</button>
              </div>
            {/if}
          </div>
        {/each}
      {/if}
    </div>

    <form class="flex gap-2" onsubmit={(e) => { e.preventDefault(); handleAdd(); }}>
      <input
        class="input input-sm input-bordered flex-1"
        placeholder="e.g. No legs the day after a long run"
        bind:value={newNote}
      />
      <button type="submit" class="btn btn-sm btn-primary">Add</button>
    </form>

  {/await}
</div>
