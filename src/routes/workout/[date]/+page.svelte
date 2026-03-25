<script lang="ts">
  import { goto } from '$app/navigation';
  import { getWorkout, saveSet, setExerciseUnit, getExerciseNames, addExerciseToPlan, removeExerciseFromPlan, finishWorkout } from '../../workout.remote';

  let { data } = $props();
  const { date } = data;

  type Workout = NonNullable<Awaited<ReturnType<typeof getWorkout>>>;
  type ExType  = 'weighted' | 'reps' | 'timed';

  let loading     = $state(true);
  let workout     = $state<Workout | null>(null);
  let inputs      = $state<Record<string, { reps: string; weight: string }>>({});
  let exTypes     = $state<Record<string, ExType>>({});
  let saving      = $state<Record<string, boolean>>({});
  let visibleSets = $state<Record<string, number>>({});
  let refreshKey  = $state(0);

  // Add exercise dialog
  let dialogEl      = $state<HTMLDialogElement | null>(null);
  let searchText    = $state('');
  let allExercises  = $state<string[]>([]);
  let showDropdown  = $state(false);
  let addingEx      = $state(false);

  // Confirm delete dialog
  let confirmDialogEl  = $state<HTMLDialogElement | null>(null);
  let pendingRemove    = $state<string | null>(null);

  let filtered = $derived(
    searchText.trim().length > 0
      ? allExercises.filter(n => n.toLowerCase().includes(searchText.toLowerCase()))
      : allExercises
  );

  async function loadWorkout() {
    loading = true;
    const w = await getWorkout(date);
    if (w) {
      const initInputs:  Record<string, { reps: string; weight: string }> = {};
      const initTypes:   Record<string, ExType> = {};
      const initVisible: Record<string, number>  = {};
      for (const ex of w.exercises) {
        initTypes[ex.name]   = ex.unit;
        initVisible[ex.name] = Math.max(1, ex.currentLogs.length);
        for (let s = 1; s <= Math.max(initVisible[ex.name], ex.sets); s++) {
          const key     = `${ex.name}__${s}`;
          const current = ex.currentLogs.find(l => l.set_number === s);
          initInputs[key] = {
            reps:   current?.reps?.toString()      ?? ex.reps.toString(),
            weight: current?.weight_kg?.toString() ?? '',
          };
        }
      }
      inputs      = initInputs;
      exTypes     = initTypes;
      visibleSets = initVisible;
    }
    workout = w ?? null;
    loading = false;
  }

  $effect(() => {
    refreshKey;
    void loadWorkout();
  });

  function addSet(ex: Workout['exercises'][number]) {
    const current = visibleSets[ex.name] ?? 1;
    const next    = current + 1;
    const prevKey = `${ex.name}__${current}`;
    const newKey  = `${ex.name}__${next}`;
    if (!inputs[newKey]) {
      inputs[newKey] = { ...inputs[prevKey] } ?? { reps: ex.reps.toString(), weight: '' };
    }
    visibleSets[ex.name] = next;
  }

  async function handleBlur(exerciseName: string, setNumber: number) {
    const key  = `${exerciseName}__${setNumber}`;
    const inp  = inputs[key];
    const type = exTypes[exerciseName] ?? 'weighted';
    if (!inp) return;

    if (type === 'timed') {
      const duration = parseInt(inp.reps);
      if (!duration) return;
      saving[key] = true;
      await saveSet({ date, exercise_name: exerciseName, set_number: setNumber, reps: duration, weight_kg: null });
    } else {
      const reps      = parseInt(inp.reps) || null;
      const weight_kg = type === 'weighted' && inp.weight ? (parseFloat(inp.weight) || null) : null;
      if (reps === null && weight_kg === null) return;
      saving[key] = true;
      await saveSet({ date, exercise_name: exerciseName, set_number: setNumber, reps, weight_kg });
    }
    saving[key] = false;
  }

  async function openAddDialog() {
    searchText   = '';
    showDropdown = false;
    allExercises = await getExerciseNames();
    dialogEl?.showModal();
  }

  function selectSuggestion(name: string) {
    searchText   = name;
    showDropdown = false;
  }

  async function handleAddExercise() {
    const name = searchText.trim().toLowerCase();
    if (!name) return;
    addingEx = true;
    await addExerciseToPlan({ date, name });
    dialogEl?.close();
    addingEx = false;
    refreshKey++;
  }

  function handleRemove(name: string) {
    pendingRemove = name;
    confirmDialogEl?.showModal();
  }

  async function confirmRemove() {
    if (!pendingRemove) return;
    await removeExerciseFromPlan({ date, name: pendingRemove });
    confirmDialogEl?.close();
    pendingRemove = null;
    refreshKey++;
  }

  function dayLabel(d: string) {
    return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
  }
</script>

<div class="max-w-lg mx-auto pb-24">
  <!-- Header -->
  <div class="flex items-center gap-3 px-4 py-4 border-b border-base-200">
    <button class="btn btn-ghost btn-sm btn-circle" onclick={() => goto('/')}>
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
      </svg>
    </button>
    <div class="flex-1">
      <div class="text-xs text-base-content/40 uppercase tracking-wide">{dayLabel(date)}</div>
      {#if workout?.title}
        <div class="font-bold text-lg leading-tight">{workout.title}</div>
      {/if}
    </div>
    {#if workout}
      <button
        class="btn btn-circle btn-sm bg-success border-success text-success-content hover:bg-success/80"
        onclick={async () => { await finishWorkout(date); goto('/'); }}
        aria-label="Finish workout"
        title="Finish workout"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24"><path fill="currentColor" fill-rule="evenodd" d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10s-4.477 10-10 10m-1.177-7.86l-2.765-2.767L7 12.431l3.119 3.121a1 1 0 0 0 1.414 0l5.952-5.95l-1.062-1.062z"/></svg>
      </button>
    {/if}
  </div>

  {#if loading}
    <div class="flex justify-center py-16"><span class="loading loading-spinner loading-md"></span></div>
  {:else if !workout}
    <p class="text-base-content/50 text-sm p-4">No workout found for this date.</p>
  {:else}
    <div class="space-y-8 px-4 pt-5">
      {#each workout.exercises as ex}
        {@const type  = exTypes[ex.name] ?? 'weighted'}
        {@const nSets = visibleSets[ex.name] ?? 1}
        {@const prevWeightsH = ex.previousLogs.map(l => l.weight_kg).filter((v): v is number => v != null)}
        {@const prevRepsH    = ex.previousLogs.map(l => l.reps).filter((v): v is number => v != null)}
        {@const wMinH = prevWeightsH.length ? Math.min(...prevWeightsH) : null}
        {@const wMaxH = prevWeightsH.length ? Math.max(...prevWeightsH) : null}
        {@const rMinH = prevRepsH.length    ? Math.min(...prevRepsH)    : null}
        {@const rMaxH = prevRepsH.length    ? Math.max(...prevRepsH)    : null}
        <div>

          <!-- Exercise header -->
          <div class="flex items-center justify-between mb-4">
            <div>
              <h3 class="font-semibold capitalize">{ex.name}</h3>
              <p class="text-xs text-base-content/30 mt-0.5 flex items-center gap-1">
                {ex.sets} sets
                {#if exTypes[ex.name] === 'weighted' && wMinH != null}
                  · <svg xmlns="http://www.w3.org/2000/svg" class="inline h-3 w-3" viewBox="0 0 24 24"><path fill="currentColor" d="M12 21q-3.15 0-5.575-1.912T3.275 14.2q-.1-.375.15-.687t.675-.363q.4-.05.725.15t.45.6q.6 2.25 2.475 3.675T12 19q2.925 0 4.963-2.037T19 12t-2.037-4.962T12 5q-1.725 0-3.225.8T6.25 8H8q.425 0 .713.288T9 9t-.288.713T8 10H4q-.425 0-.712-.288T3 9V5q0-.425.288-.712T4 4t.713.288T5 5v1.35q1.275-1.6 3.113-2.475T12 3q1.875 0 3.513.713t2.85 1.924t1.925 2.85T21 12t-.712 3.513t-1.925 2.85t-2.85 1.925T12 21m1-9.4l2.5 2.5q.275.275.275.7t-.275.7t-.7.275t-.7-.275l-2.8-2.8q-.15-.15-.225-.337T11 11.975V8q0-.425.288-.712T12 7t.713.288T13 8z"/></svg>
                  {wMinH === wMaxH ? `${wMinH}kg` : `${wMinH}–${wMaxH}kg`}
                {:else if exTypes[ex.name] !== 'weighted' && rMinH != null}
                  · <svg xmlns="http://www.w3.org/2000/svg" class="inline h-3 w-3" viewBox="0 0 24 24"><path fill="currentColor" d="M12 21q-3.15 0-5.575-1.912T3.275 14.2q-.1-.375.15-.687t.675-.363q.4-.05.725.15t.45.6q.6 2.25 2.475 3.675T12 19q2.925 0 4.963-2.037T19 12t-2.037-4.962T12 5q-1.725 0-3.225.8T6.25 8H8q.425 0 .713.288T9 9t-.288.713T8 10H4q-.425 0-.712-.288T3 9V5q0-.425.288-.712T4 4t.713.288T5 5v1.35q1.275-1.6 3.113-2.475T12 3q1.875 0 3.513.713t2.85 1.924t1.925 2.85T21 12t-.712 3.513t-1.925 2.85t-2.85 1.925T12 21m1-9.4l2.5 2.5q.275.275.275.7t-.275.7t-.7.275t-.7-.275l-2.8-2.8q-.15-.15-.225-.337T11 11.975V8q0-.425.288-.712T12 7t.713.288T13 8z"/></svg>
                  {exTypes[ex.name] === 'timed' ? (rMinH === rMaxH ? `${rMinH}s` : `${rMinH}–${rMaxH}s`) : (rMinH === rMaxH ? rMinH : `${rMinH}–${rMaxH}`)}
                {/if}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <div class="flex rounded-lg overflow-hidden border border-base-300">
                <button
                  class="px-2.5 py-1.5 transition-colors {type === 'weighted' ? 'bg-base-content text-base-100' : 'text-base-content/40 hover:text-base-content/70'}"
                  onclick={() => { exTypes[ex.name] = 'weighted'; setExerciseUnit({ name: ex.name, unit: 'weighted' }); }}
                  aria-label="Weighted"
                  title="Weighted"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24"><path fill="currentColor" d="M12 7q.425 0 .713-.288T13 6t-.288-.712T12 5t-.712.288T11 6t.288.713T12 7m2.825 0h1.75q.75 0 1.3.5t.675 1.225l1.425 10q.125.9-.462 1.588T18 21H6q-.925 0-1.513-.687t-.462-1.588l1.425-10Q5.575 8 6.125 7.5t1.3-.5h1.75q-.075-.25-.125-.487T9 6q0-1.25.875-2.125T12 3t2.125.875T15 6q0 .275-.05.513T14.825 7"/></svg>
                </button>
                <button
                  class="px-2.5 py-1.5 border-x border-base-300 transition-colors {type === 'reps' ? 'bg-base-content text-base-100' : 'text-base-content/40 hover:text-base-content/70'}"
                  onclick={() => { exTypes[ex.name] = 'reps'; setExerciseUnit({ name: ex.name, unit: 'reps' }); }}
                  aria-label="Reps"
                  title="Reps"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24"><path fill="currentColor" d="M14.55 4q-.05.243-.05.5v3a2.5 2.5 0 0 0 5 0v-3q0-.24-.045-.467A3 3 0 0 1 22 7v10a3 3 0 0 1-2.846 2.996L19 20h-.5v-6.25a.75.75 0 0 0-1.355-.441l-.012.015l-.008.011l-.042.053a1.96 1.96 0 0 1-1.015.635a.75.75 0 0 0 .364 1.454q.309-.078.568-.199V20h-4.25V4zM7 9.5a1 1 0 0 1 1 1v3a1 1 0 1 1-2 0v-3a1 1 0 0 1 1-1M11.25 4v16H5l-.154-.004A3 3 0 0 1 2 17V7a3 3 0 0 1 3-3zM7 8a2.5 2.5 0 0 0-2.5 2.5v3a2.5 2.5 0 0 0 5 0v-3A2.5 2.5 0 0 0 7 8m10.865-4a1 1 0 0 1 .135.5v3a1 1 0 1 1-2 0v-3c0-.182.05-.353.135-.5z"/></svg>
                </button>
                <button
                  class="px-2.5 py-1.5 transition-colors {type === 'timed' ? 'bg-base-content text-base-100' : 'text-base-content/40 hover:text-base-content/70'}"
                  onclick={() => { exTypes[ex.name] = 'timed'; setExerciseUnit({ name: ex.name, unit: 'timed' }); }}
                  aria-label="Timed"
                  title="Timed"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24"><path fill="currentColor" d="M10 3q-.425 0-.712-.288T9 2t.288-.712T10 1h4q.425 0 .713.288T15 2t-.288.713T14 3zm2.713 10.713Q13 13.425 13 13V9q0-.425-.288-.712T12 8t-.712.288T11 9v4q0 .425.288.713T12 14t.713-.288m-4.2 7.576q-1.638-.713-2.863-1.938t-1.937-2.863T3 13t.713-3.488T5.65 6.65t2.863-1.937T12 4q1.55 0 2.975.5t2.675 1.45l.7-.7q.275-.275.7-.275t.7.275t.275.7t-.275.7l-.7.7Q20 8.6 20.5 10.025T21 13q0 1.85-.713 3.488T18.35 19.35t-2.863 1.938T12 22t-3.488-.712"/></svg>
                </button>
              </div>
              <button
                class="text-base-content/25 hover:text-error transition-colors text-base leading-none"
                onclick={() => handleRemove(ex.name)}
                aria-label="Remove {ex.name}"
              >✕</button>
            </div>
          </div>

          <!-- Column headers -->
          {#if type === 'weighted'}
            <div class="grid grid-cols-[2rem_1fr_1fr] gap-3 mb-2 px-1">
              <span></span>
              <span class="text-xs text-base-content/40 text-center">Reps</span>
              <span class="text-xs text-base-content/40 text-center">kg</span>
            </div>
          {:else}
            <div class="grid grid-cols-[2rem_1fr] gap-3 mb-2 px-1">
              <span></span>
              <span class="text-xs text-base-content/40 text-center">{type === 'timed' ? 'Seconds' : 'Reps'}</span>
            </div>
          {/if}

          <!-- Sets -->
          <div class="space-y-2">
            {#each { length: nSets } as _, i}
              {@const setNum = i + 1}
              {@const key    = `${ex.name}__${setNum}`}

              {#if type === 'weighted'}
                <div class="grid grid-cols-[2rem_1fr_1fr] gap-3 items-center">
                  <span class="text-sm text-base-content/30 text-center font-mono">{setNum}</span>
                  <input
                    type="number" inputmode="numeric"
                    class="input input-sm input-bordered w-full text-center bg-base-200 border-base-300 focus:border-primary"
                    bind:value={inputs[key].reps}
                    onblur={() => handleBlur(ex.name, setNum)}
                  />
                  <input
                    type="number" inputmode="decimal" step="0.5" placeholder="—"
                    class="input input-sm input-bordered w-full text-center bg-base-200 border-base-300 focus:border-primary"
                    bind:value={inputs[key].weight}
                    onblur={() => handleBlur(ex.name, setNum)}
                  />
                </div>

              {:else}
                <div class="grid grid-cols-[2rem_1fr] gap-3 items-center">
                  <span class="text-sm text-base-content/30 text-center font-mono">{setNum}</span>
                  <input
                    type="number" inputmode="numeric"
                    class="input input-sm input-bordered w-full text-center bg-base-200 border-base-300 focus:border-primary"
                    bind:value={inputs[key].reps}
                    onblur={() => handleBlur(ex.name, setNum)}
                  />
                </div>
              {/if}
            {/each}
          </div>

          <!-- Add set button -->
          <button
            class="btn btn-ghost btn-xs mt-2 text-base-content/40 hover:text-base-content"
            onclick={() => addSet(ex)}
          >+ Add set</button>
        </div>
      {/each}

      <!-- Add exercise button -->
      <button class="btn btn-outline btn-sm w-full" onclick={openAddDialog}>
        + Add exercise
      </button>

    </div>
  {/if}
</div>

<!-- Add exercise dialog -->
<dialog bind:this={dialogEl} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box">
    <h3 class="font-bold text-lg mb-4">Add exercise</h3>

    <div class="relative">
      <input
        type="text"
        class="input input-bordered w-full"
        placeholder="Search or type new exercise…"
        bind:value={searchText}
        oninput={() => showDropdown = true}
        onfocus={() => showDropdown = true}
        onkeydown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); handleAddExercise(); }
          if (e.key === 'Escape') { showDropdown = false; }
        }}
        autocomplete="off"
      />

      {#if showDropdown && filtered.length > 0}
        <ul class="absolute z-10 w-full mt-1 bg-base-100 border border-base-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {#each filtered as name}
            <li>
              <button
                class="w-full text-left px-4 py-2.5 text-sm hover:bg-base-200 capitalize"
                onmousedown={(e) => { e.preventDefault(); selectSuggestion(name); }}
              >{name}</button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <div class="modal-action">
      <button class="btn btn-ghost" onclick={() => dialogEl?.close()}>Cancel</button>
      <button
        class="btn btn-primary"
        disabled={!searchText.trim() || addingEx}
        onclick={handleAddExercise}
      >
        {addingEx ? 'Adding…' : 'Add'}
      </button>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>

<!-- Confirm remove dialog -->
<dialog bind:this={confirmDialogEl} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box">
    <h3 class="font-bold text-lg mb-2">Remove exercise?</h3>
    <p class="text-base-content/60 text-sm capitalize">{pendingRemove} will be removed from today's plan.</p>
    <div class="modal-action">
      <button class="btn btn-ghost" onclick={() => { confirmDialogEl?.close(); pendingRemove = null; }}>Cancel</button>
      <button class="btn btn-error" onclick={confirmRemove}>Remove</button>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
