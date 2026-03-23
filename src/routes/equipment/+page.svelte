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

<div class="p-4 max-w-lg mx-auto">
  <h1 class="text-xl font-semibold mb-4">Equipment</h1>

  {#await getEquipment()}
    <div class="flex justify-center py-8">
      <span class="loading loading-spinner loading-md"></span>
    </div>
  {:then items}
    {#if items.length === 0}
      <p class="text-base-content/50 text-sm mb-4">No equipment yet.</p>
    {:else}
      <ul class="space-y-2 mb-4">
        {#each items as item (item.id)}
          <li class="card bg-base-200 px-4 py-3 flex items-center justify-between">
            <div>
              <span class="font-semibold">{item.name}</span>
              {#if item.weight_type === 'single' && item.weight_min != null}
                <span class="ml-2 text-sm text-base-content/60">{item.weight_min} kg</span>
              {:else if item.weight_type === 'range' && item.weight_min != null && item.weight_max != null}
                <span class="ml-2 text-sm text-base-content/60">{item.weight_min}–{item.weight_max} kg</span>
              {/if}
            </div>
            <button
              class="btn btn-ghost btn-sm text-error"
              onclick={() => deleteEquipment({ id: item.id })}
              aria-label="Delete {item.name}"
            >✕</button>
          </li>
        {/each}
      </ul>
    {/if}

    {#if !showForm}
      <button class="btn btn-primary btn-sm" onclick={() => showForm = true}>+ Add equipment</button>
    {:else}
      <form class="card bg-base-200 p-4 space-y-3" onsubmit={(e) => { e.preventDefault(); handleAdd(); }}>
        <div class="form-control">
          <label class="label label-text" for="eq-name">Name</label>
          <input id="eq-name" class="input input-bordered input-sm" bind:value={name} required />
        </div>

        <div class="form-control">
          <label class="label label-text" for="eq-weight-type">Weight</label>
          <select id="eq-weight-type" class="select select-bordered select-sm" bind:value={weightType}>
            <option value="none">None</option>
            <option value="single">Single weight</option>
            <option value="range">Weight range</option>
          </select>
        </div>

        {#if weightType === 'single'}
          <div class="form-control">
            <label class="label label-text" for="eq-weight-min">Weight (kg)</label>
            <input id="eq-weight-min" type="number" step="0.1" class="input input-bordered input-sm" bind:value={weightMin} required />
          </div>
        {:else if weightType === 'range'}
          <div class="flex gap-2">
            <div class="form-control flex-1">
              <label class="label label-text" for="eq-min">Min kg</label>
              <input id="eq-min" type="number" step="0.1" class="input input-bordered input-sm" bind:value={weightMin} required />
            </div>
            <div class="form-control flex-1">
              <label class="label label-text" for="eq-max">Max kg</label>
              <input id="eq-max" type="number" step="0.1" class="input input-bordered input-sm" bind:value={weightMax} required />
            </div>
          </div>
        {/if}

        <div class="flex gap-2">
          <button type="submit" class="btn btn-primary btn-sm">Save</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick={() => showForm = false}>Cancel</button>
        </div>
      </form>
    {/if}
  {/await}
</div>
