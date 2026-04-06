<script lang="ts">
  import { getEquipment, addEquipment, deleteEquipment } from '../equipment.remote';

  let showForm   = $state(false);
  let name       = $state('');
  let weightType = $state<'none' | 'single' | 'range'>('none');
  let weightMin  = $state('');
  let weightMax  = $state('');

  async function handleAdd() {
    await addEquipment({
      name,
      weight_type: weightType,
      weight_min:  weightType !== 'none' ? parseFloat(weightMin) : undefined,
      weight_max:  weightType === 'range' ? parseFloat(weightMax) : undefined,
    });
    showForm = false; name = ''; weightType = 'none'; weightMin = ''; weightMax = '';
  }
</script>

<div class="p-4 max-w-lg md:max-w-2xl mx-auto pb-24">
  <h1 class="text-xl font-bold mb-4 pt-2">Equipment</h1>

  {#await getEquipment()}
    <div class="flex justify-center py-8"><span class="loading loading-spinner loading-md"></span></div>
  {:then items}

    <div class="bg-base-200 rounded-2xl overflow-hidden mb-4">
      {#if items.length === 0}
        <p class="text-base-content/40 text-sm px-4 py-3">No equipment yet.</p>
      {:else}
        {#each items as item, i (item.id)}
          <div class="flex items-center px-4 py-2.5 {i < items.length - 1 ? 'border-b border-base-300' : ''}">
            <span class="flex-1 text-sm font-medium">{item.name}</span>
            {#if item.weight_type === 'single' && item.weight_min != null}
              <span class="text-xs text-base-content/40 mr-3">{item.weight_min} kg</span>
            {:else if item.weight_type === 'range' && item.weight_min != null && item.weight_max != null}
              <span class="text-xs text-base-content/40 mr-3">{item.weight_min}–{item.weight_max} kg</span>
            {/if}
            <button
              class="text-base-content/30 hover:text-error transition-colors text-xs"
              onclick={() => deleteEquipment({ id: item.id })}
              aria-label="Delete {item.name}"
            >✕</button>
          </div>
        {/each}
      {/if}
    </div>

    {#if !showForm}
      <button class="btn btn-sm btn-outline w-full" onclick={() => showForm = true}>+ Add equipment</button>
    {:else}
      <form class="bg-base-200 rounded-2xl p-4 space-y-3" onsubmit={(e) => { e.preventDefault(); handleAdd(); }}>
        <input
          class="input input-sm input-bordered w-full"
          placeholder="Name"
          bind:value={name}
          required
        />
        <select class="select select-sm select-bordered w-full" bind:value={weightType}>
          <option value="none">No weight</option>
          <option value="single">Single weight</option>
          <option value="range">Weight range</option>
        </select>

        {#if weightType === 'single'}
          <input type="number" step="0.1" placeholder="kg" class="input input-sm input-bordered w-full" bind:value={weightMin} required />
        {:else if weightType === 'range'}
          <div class="flex gap-2">
            <input type="number" step="0.1" placeholder="Min kg" class="input input-sm input-bordered flex-1" bind:value={weightMin} required />
            <input type="number" step="0.1" placeholder="Max kg" class="input input-sm input-bordered flex-1" bind:value={weightMax} required />
          </div>
        {/if}

        <div class="flex gap-2">
          <button type="submit" class="btn btn-primary btn-sm flex-1">Save</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick={() => showForm = false}>Cancel</button>
        </div>
      </form>
    {/if}

  {/await}
</div>
