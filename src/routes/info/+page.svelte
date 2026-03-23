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

<div class="p-4 max-w-lg mx-auto">
  <h1 class="text-xl font-semibold mb-1">Training notes</h1>
  <p class="text-sm text-base-content/50 mb-5">These are sent to the AI when generating your weekly plan.</p>

  {#await getNotes()}
    <div class="flex justify-center py-8"><span class="loading loading-spinner loading-md"></span></div>
  {:then notes}
    {#if notes.length === 0}
      <p class="text-base-content/40 text-sm mb-4">No notes yet.</p>
    {:else}
      <ul class="space-y-2 mb-5">
        {#each notes as n (n.id)}
          <li class="card bg-base-200 px-4 py-3">
            {#if editingId === n.id}
              <div class="flex gap-2">
                <input
                  class="input input-sm input-bordered flex-1"
                  bind:value={editText}
                  onkeydown={(e) => e.key === 'Enter' && handleUpdate()}
                  autofocus
                />
                <button class="btn btn-sm btn-primary" onclick={handleUpdate}>Save</button>
                <button class="btn btn-sm btn-ghost" onclick={() => editingId = null}>Cancel</button>
              </div>
            {:else}
              <div class="flex items-start gap-2">
                <span class="flex-1 text-sm">{n.note}</span>
                <button class="btn btn-ghost btn-xs" onclick={() => startEdit(n.id, n.note)}>Edit</button>
                <button class="btn btn-ghost btn-xs text-error" onclick={() => deleteNote({ id: n.id })}>✕</button>
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

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
