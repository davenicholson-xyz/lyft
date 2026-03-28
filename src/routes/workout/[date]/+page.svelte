<script lang="ts">
  import { goto } from '$app/navigation';
  import { getWorkout, saveSet, getExerciseNames, addExerciseToPlan, removeExerciseFromPlan, finishWorkout } from '../../workout.remote';
  import { saveTemplate } from '../../templates.remote';

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

  // Save as template
  let saveTemplateEl   = $state<HTMLDialogElement | null>(null);
  let templateName     = $state('');
  let savingTemplate   = $state(false);

  async function handleSaveTemplate() {
    if (!workout?.exercises.length || !templateName.trim()) return;
    savingTemplate = true;
    const notes = workout.title
      ? `${workout.title}: ${workout.exercises.map(e => `${e.name} ${e.sets}×${e.reps}`).join(', ')}`
      : workout.exercises.map(e => `${e.name} ${e.sets}×${e.reps}`).join(', ');
    await saveTemplate({ name: templateName.trim(), notes });
    saveTemplateEl?.close();
    templateName   = '';
    savingTemplate = false;
  }

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
        initVisible[ex.name] = Math.max(visibleSets[ex.name] ?? 1, ex.currentLogs.length, 1);
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

  async function addSet(ex: Workout['exercises'][number]) {
    const current = visibleSets[ex.name] ?? 1;
    const next    = current + 1;
    const prevKey = `${ex.name}__${current}`;
    const newKey  = `${ex.name}__${next}`;
    inputs[newKey] = inputs[prevKey] ? { ...inputs[prevKey] } : { reps: ex.reps.toString(), weight: '' };
    visibleSets[ex.name] = next;
    // Save immediately so the set persists if the user navigates away without blurring
    const inp       = inputs[newKey];
    const type      = exTypes[ex.name] ?? 'weighted';
    const reps      = parseInt(inp.reps) || null;
    const weight_kg = type === 'weighted' && inp.weight ? (parseFloat(inp.weight) || null) : null;
    if (reps !== null || weight_kg !== null) {
      await saveSet({ date, exercise_name: ex.name, set_number: next, reps, weight_kg });
    }
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
        class="btn btn-ghost btn-sm btn-circle text-base-content/40 hover:text-base-content"
        onclick={() => { templateName = workout?.title ?? ''; saveTemplateEl?.showModal(); }}
        aria-label="Save as template"
        title="Save as template"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24"><path fill="currentColor" d="M15 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7zm0 2l2 2h-2zM7 5h6v4h4v10H7z"/></svg>
      </button>
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
              <h3 class="font-semibold capitalize flex items-center gap-1.5">
                {ex.name}
                <a href="/exercises?name={encodeURIComponent(ex.name)}" class="text-base-content/50 hover:text-base-content/80 transition-colors" title="Edit exercise">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 24 24"><path fill="currentColor" d="M20.952 3.048a3.58 3.58 0 0 0-5.06 0L3.94 15a3.1 3.1 0 0 0-.825 1.476L2.02 21.078a.75.75 0 0 0 .904.903l4.601-1.096a3.1 3.1 0 0 0 1.477-.825l11.95-11.95a3.58 3.58 0 0 0 0-5.06m-4 1.06a2.078 2.078 0 1 1 2.94 2.94L19 7.939L16.06 5zM15 6.062L17.94 9l-10 10c-.21.21-.474.357-.763.426l-3.416.814l.813-3.416c.069-.29.217-.554.427-.764z"/></svg>
                </a>
              </h3>
              <p class="text-xs text-base-content/30 mt-0.5 flex items-center gap-1">
                {ex.sets} sets
                {#if exTypes[ex.name] === 'weighted' && wMinH != null}
                  · <svg xmlns="http://www.w3.org/2000/svg" class="inline h-3 w-3" viewBox="0 0 24 24"><path fill="currentColor" d="M12 21q-3.15 0-5.575-1.912T3.275 14.2q-.1-.375.15-.687t.675-.363q.4-.05.725.15t.45.6q.6 2.25 2.475 3.675T12 19q2.925 0 4.963-2.037T19 12t-2.037-4.962T12 5q-1.725 0-3.225.8T6.25 8H8q.425 0 .713.288T9 9t-.288.713T8 10H4q-.425 0-.712-.288T3 9V5q0-.425.288-.712T4 4t.713.288T5 5v1.35q1.275-1.6 3.113-2.475T12 3q1.875 0 3.513.713t2.85 1.924t1.925 2.85T21 12t-.712 3.513t-1.925 2.85t-2.85 1.925T12 21m1-9.4l2.5 2.5q.275.275.275.7t-.275.7t-.7.275t-.7-.275l-2.8-2.8q-.15-.15-.225-.337T11 11.975V8q0-.425.288-.712T12 7t.713.288T13 8z"/></svg>
                  {wMinH === wMaxH ? `${wMinH}kg` : `${wMinH}–${wMaxH}kg`}
                  {#if ex.lastDate}· {new Date(ex.lastDate + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}{/if}
                {:else if exTypes[ex.name] !== 'weighted' && rMinH != null}
                  · <svg xmlns="http://www.w3.org/2000/svg" class="inline h-3 w-3" viewBox="0 0 24 24"><path fill="currentColor" d="M12 21q-3.15 0-5.575-1.912T3.275 14.2q-.1-.375.15-.687t.675-.363q.4-.05.725.15t.45.6q.6 2.25 2.475 3.675T12 19q2.925 0 4.963-2.037T19 12t-2.037-4.962T12 5q-1.725 0-3.225.8T6.25 8H8q.425 0 .713.288T9 9t-.288.713T8 10H4q-.425 0-.712-.288T3 9V5q0-.425.288-.712T4 4t.713.288T5 5v1.35q1.275-1.6 3.113-2.475T12 3q1.875 0 3.513.713t2.85 1.924t1.925 2.85T21 12t-.712 3.513t-1.925 2.85t-2.85 1.925T12 21m1-9.4l2.5 2.5q.275.275.275.7t-.275.7t-.7.275t-.7-.275l-2.8-2.8q-.15-.15-.225-.337T11 11.975V8q0-.425.288-.712T12 7t.713.288T13 8z"/></svg>
                  {exTypes[ex.name] === 'timed' ? (rMinH === rMaxH ? `${rMinH}s` : `${rMinH}–${rMaxH}s`) : (rMinH === rMaxH ? rMinH : `${rMinH}–${rMaxH}`)}
                  {#if ex.lastDate}· {new Date(ex.lastDate + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}{/if}
                {/if}
              </p>
            </div>
            <div class="flex items-center gap-2">
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

<!-- Save template dialog -->
<dialog bind:this={saveTemplateEl} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box">
    <h3 class="font-bold text-lg mb-4">Save as template</h3>
    <input
      type="text"
      class="input input-bordered w-full"
      placeholder="Template name…"
      bind:value={templateName}
      onkeydown={(e) => { if (e.key === 'Enter') handleSaveTemplate(); }}
    />
    <div class="modal-action">
      <button class="btn btn-ghost" onclick={() => saveTemplateEl?.close()}>Cancel</button>
      <button class="btn btn-primary" disabled={!templateName.trim() || savingTemplate} onclick={handleSaveTemplate}>
        {savingTemplate ? 'Saving…' : 'Save'}
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
