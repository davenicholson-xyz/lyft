<script lang="ts">
  import { goto } from '$app/navigation';
  import { getWorkout, saveSet, deleteSet, getExerciseNames, addExerciseToPlan, removeExerciseFromPlan, reorderExercise, finishWorkout } from '../../workout.remote';
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

  // Rest timer
  const REST_DEFAULT = 180;
  let timerActive   = $state(false);
  let timerSeconds  = $state(REST_DEFAULT);
  let timerTotal    = $state(REST_DEFAULT);
  let timerStart    = $state(0);
  let timerExName   = $state('');
  let timerInterval = $state<ReturnType<typeof setInterval> | null>(null);

  // Active exercise modal
  let activeEx         = $state<Workout['exercises'][number] | null>(null);
  let activeExDialogEl = $state<HTMLDialogElement | null>(null);

  // Confirm remove set
  let pendingRemoveSet    = $state<{ exerciseName: string; setNumber: number } | null>(null);
  let confirmRemoveSetEl  = $state<HTMLDialogElement | null>(null);

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
    startTimer(ex.name);
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

  async function moveExercise(name: string, direction: 'up' | 'down') {
    if (!workout) return;
    const idx = workout.exercises.findIndex(e => e.name === name);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= workout.exercises.length) return;
    const exs = [...workout.exercises];
    [exs[idx], exs[swapIdx]] = [exs[swapIdx], exs[idx]];
    workout = { ...workout, exercises: exs };
    await reorderExercise({ date, name, direction });
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

  function formatTime(s: number): string {
    const m = Math.floor(Math.max(0, s) / 60);
    const sec = Math.max(0, s) % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  function startTimer(exerciseName: string) {
    if (timerInterval !== null) clearInterval(timerInterval);
    timerExName  = exerciseName;
    timerTotal   = REST_DEFAULT;
    timerStart   = Date.now();
    timerSeconds = REST_DEFAULT;
    timerActive  = true;
    timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - timerStart) / 1000);
      timerSeconds = Math.max(0, timerTotal - elapsed);
      if (timerSeconds <= 0) {
        clearInterval(timerInterval!);
        timerInterval = null;
        if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
        setTimeout(() => { timerActive = false; }, 1500);
      }
    }, 1000);
  }

  function dismissTimer() {
    if (timerInterval !== null) { clearInterval(timerInterval); timerInterval = null; }
    timerActive = false;
  }

  async function confirmRemoveSet() {
    if (!pendingRemoveSet) return;
    await deleteSet({ date, exercise_name: pendingRemoveSet.exerciseName, set_number: pendingRemoveSet.setNumber });
    const name = pendingRemoveSet.exerciseName;
    const current = visibleSets[name] ?? 1;
    if (current > 1) visibleSets[name] = current - 1;
    confirmRemoveSetEl?.close();
    pendingRemoveSet = null;
  }

  function openExerciseModal(ex: Workout['exercises'][number]) {
    activeEx = ex;
    activeExDialogEl?.showModal();
  }

  $effect(() => {
    return () => { if (timerInterval !== null) clearInterval(timerInterval); };
  });

  function dayLabel(d: string) {
    return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
  }
</script>

<div class="max-w-lg mx-auto {timerActive && activeEx === null ? 'pb-48' : 'pb-24'}">
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
      {#each workout.exercises as ex, idx}
        {@const type  = exTypes[ex.name] ?? 'weighted'}
        {@const nSets = visibleSets[ex.name] ?? 1}
        {@const prevRepsH    = ex.previousLogs.map(l => l.reps).filter((v): v is number => v != null)}
        {@const rMaxH     = prevRepsH.length ? Math.max(...prevRepsH) : null}
        {@const maxKgLogH = ex.previousLogs.filter(l => l.weight_kg != null).sort((a, b) => (b.weight_kg ?? 0) - (a.weight_kg ?? 0))[0] ?? null}
        <div class="flex items-center gap-3">
          <div class="flex flex-col">
            <button
              class="btn btn-ghost btn-xs px-0 text-base-content/25 hover:text-base-content disabled:opacity-10"
              disabled={idx === 0}
              onclick={() => moveExercise(ex.name, 'up')}
              aria-label="Move {ex.name} up"
            ><svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7"/></svg></button>
            <button
              class="btn btn-ghost btn-xs px-0 text-base-content/25 hover:text-base-content disabled:opacity-10"
              disabled={idx === workout.exercises.length - 1}
              onclick={() => moveExercise(ex.name, 'down')}
              aria-label="Move {ex.name} down"
            ><svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg></button>
          </div>
          <div class="flex-1 flex items-center justify-between">
          <div>
            <h3 class="font-semibold capitalize flex items-center gap-1.5">
              {ex.name}
              <a href="/exercises?name={encodeURIComponent(ex.name)}" class="text-base-content/50 hover:text-base-content/80 transition-colors" title="Edit exercise">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 24 24"><path fill="currentColor" d="M20.952 3.048a3.58 3.58 0 0 0-5.06 0L3.94 15a3.1 3.1 0 0 0-.825 1.476L2.02 21.078a.75.75 0 0 0 .904.903l4.601-1.096a3.1 3.1 0 0 0 1.477-.825l11.95-11.95a3.58 3.58 0 0 0 0-5.06m-4 1.06a2.078 2.078 0 1 1 2.94 2.94L19 7.939L16.06 5zM15 6.062L17.94 9l-10 10c-.21.21-.474.357-.763.426l-3.416.814l.813-3.416c.069-.29.217-.554.427-.764z"/></svg>
              </a>
            </h3>
            <p class="text-xs text-base-content/30 mt-0.5">
              {ex.sets} sets
              {#if exTypes[ex.name] === 'weighted' && maxKgLogH}
                · {maxKgLogH.reps}@{maxKgLogH.weight_kg}kg
              {:else if exTypes[ex.name] !== 'weighted' && rMaxH != null}
                · {exTypes[ex.name] === 'timed' ? `${rMaxH}s` : rMaxH}
              {/if}
            </p>
            {#if ex.currentLogs.length > 0}
              <p class="text-xs text-success/70 mt-0.5">{ex.currentLogs.length} of {ex.sets} done</p>
            {/if}
          </div>
          <div class="flex items-center gap-3">
            <button
              class="text-base-content/25 hover:text-error transition-colors text-base leading-none"
              onclick={() => handleRemove(ex.name)}
              aria-label="Remove {ex.name}"
            >✕</button>
            <button
              class="btn btn-sm {ex.currentLogs.length > 0 ? 'btn-outline' : 'btn-primary'}"
              onclick={() => openExerciseModal(ex)}
            >{ex.currentLogs.length > 0 ? 'Resume' : 'Start'}</button>
          </div>
          </div>
        </div>
      {/each}

      <!-- Add exercise button -->
      <button class="btn btn-outline btn-sm w-full" onclick={openAddDialog}>
        + Add exercise
      </button>

    </div>
  {/if}
</div>

<!-- Exercise entry modal -->
<dialog bind:this={activeExDialogEl} class="modal modal-bottom sm:modal-middle" onclose={() => activeEx = null}>
  {#if activeEx}
    {@const ex    = activeEx}
    {@const type  = exTypes[ex.name] ?? 'weighted'}
    {@const nSets = visibleSets[ex.name] ?? 1}
    {@const prevRepsM    = ex.previousLogs.map(l => l.reps).filter((v): v is number => v != null)}
    {@const rMaxM     = prevRepsM.length ? Math.max(...prevRepsM) : null}
    {@const maxKgLogM = ex.previousLogs.filter(l => l.weight_kg != null).sort((a, b) => (b.weight_kg ?? 0) - (a.weight_kg ?? 0))[0] ?? null}
    <div class="modal-box">
      <!-- Header -->
      <div class="flex items-start justify-between mb-1">
        <div>
          <h3 class="font-bold text-lg capitalize leading-tight">{ex.name}</h3>
          <p class="text-xs text-base-content/30 mt-0.5">
            {ex.sets} sets
            {#if type === 'weighted' && maxKgLogM}
              · {maxKgLogM.reps}@{maxKgLogM.weight_kg}kg
            {:else if type !== 'weighted' && rMaxM != null}
              · {type === 'timed' ? `${rMaxM}s` : rMaxM}
            {/if}
          </p>
        </div>
        <button class="btn btn-ghost btn-sm btn-circle text-base-content/40" onclick={() => activeExDialogEl?.close()} aria-label="Close">✕</button>
      </div>

      <!-- Column headers -->
      {#if type === 'weighted'}
        <div class="grid grid-cols-[2rem_1fr_1fr_1.5rem] gap-3 mb-2 px-1 mt-4">
          <span></span>
          <span class="text-xs text-base-content/40 text-center">Reps</span>
          <span class="text-xs text-base-content/40 text-center">kg</span>
          <span></span>
        </div>
      {:else}
        <div class="grid grid-cols-[2rem_1fr_1.5rem] gap-3 mb-2 px-1 mt-4">
          <span></span>
          <span class="text-xs text-base-content/40 text-center">{type === 'timed' ? 'Seconds' : 'Reps'}</span>
          <span></span>
        </div>
      {/if}

      <!-- Sets -->
      <div class="space-y-2">
        {#each { length: nSets } as _, i}
          {@const setNum = i + 1}
          {@const key    = `${ex.name}__${setNum}`}
          {#if type === 'weighted'}
            <div class="grid grid-cols-[2rem_1fr_1fr_1.5rem] gap-3 items-center">
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
              <button
                class="text-base-content/20 hover:text-error transition-colors text-sm leading-none"
                onclick={() => { pendingRemoveSet = { exerciseName: ex.name, setNumber: setNum }; confirmRemoveSetEl?.showModal(); }}
                aria-label="Remove set {setNum}"
              >✕</button>
            </div>
          {:else}
            <div class="grid grid-cols-[2rem_1fr_1.5rem] gap-3 items-center">
              <span class="text-sm text-base-content/30 text-center font-mono">{setNum}</span>
              <input
                type="number" inputmode="numeric"
                class="input input-sm input-bordered w-full text-center bg-base-200 border-base-300 focus:border-primary"
                bind:value={inputs[key].reps}
                onblur={() => handleBlur(ex.name, setNum)}
              />
              <button
                class="text-base-content/20 hover:text-error transition-colors text-sm leading-none"
                onclick={() => { pendingRemoveSet = { exerciseName: ex.name, setNumber: setNum }; confirmRemoveSetEl?.showModal(); }}
                aria-label="Remove set {setNum}"
              >✕</button>
            </div>
          {/if}
        {/each}
      </div>

      <!-- Add set -->
      <button
        class="btn btn-outline btn-sm w-full mt-4"
        onclick={() => addSet(ex)}
      >+ Add set</button>

      <!-- Rest timer (inline, shown when active) -->
      {#if timerActive}
        <div class="mt-4 pt-4 border-t border-base-300">
          <div class="h-1 bg-base-300 rounded-full overflow-hidden mb-3">
            <div
              class="h-full bg-success transition-all duration-1000 ease-linear"
              style="width: {(timerSeconds / timerTotal) * 100}%;"
            ></div>
          </div>
          <div class="flex items-center justify-between">
            <button
              class="btn btn-ghost btn-sm text-base-content/60 font-mono"
              onclick={() => { timerStart -= 30000; timerTotal = Math.max(timerTotal - 30, 0); timerSeconds = Math.max(0, timerTotal - Math.floor((Date.now() - timerStart) / 1000)); }}
            >−30s</button>
            <span class="text-4xl font-bold font-mono tabular-nums text-success">{formatTime(timerSeconds)}</span>
            <button
              class="btn btn-ghost btn-sm text-base-content/60 font-mono"
              onclick={() => { timerStart += 30000; timerTotal += 30; timerSeconds = timerTotal - Math.floor((Date.now() - timerStart) / 1000); }}
            >+30s</button>
          </div>
          <div class="flex justify-center mt-1">
            <button class="btn btn-ghost btn-xs text-base-content/30 hover:text-base-content" onclick={dismissTimer}>dismiss timer</button>
          </div>
        </div>
      {/if}

      <div class="modal-action mt-4">
        <button class="btn btn-primary w-full" onclick={() => activeExDialogEl?.close()}>Finished</button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>close</button></form>
  {/if}
</dialog>

<!-- Rest timer -->
<div
  class="fixed left-0 right-0 bottom-16 z-30 bg-base-200 border-t border-base-300 shadow-lg timer-bar"
  class:timer-bar--visible={timerActive && activeEx === null}
>
  <div class="absolute top-0 left-0 right-0 h-0.5 bg-base-300 overflow-hidden">
    <div
      class="h-full bg-success transition-all duration-1000 ease-linear"
      style="width: {timerActive ? (timerSeconds / timerTotal) * 100 : 100}%;"
    ></div>
  </div>
  <div class="max-w-lg mx-auto px-4 py-3">
    <div class="flex items-center justify-between mb-1">
      <span class="text-xs text-base-content/40 capitalize truncate max-w-[75%]">rest · {timerExName}</span>
      <button class="btn btn-ghost btn-xs btn-circle text-base-content/40 hover:text-base-content" onclick={dismissTimer} aria-label="Dismiss">✕</button>
    </div>
    <div class="flex items-center justify-between">
      <button
        class="btn btn-ghost btn-sm text-base-content/60 font-mono"
        onclick={() => { timerStart -= 30000; timerTotal = Math.max(timerTotal - 30, 0); timerSeconds = Math.max(0, timerTotal - Math.floor((Date.now() - timerStart) / 1000)); }}
      >−30s</button>
      <span class="text-3xl font-bold font-mono tabular-nums text-success">{formatTime(timerSeconds)}</span>
      <button
        class="btn btn-ghost btn-sm text-base-content/60 font-mono"
        onclick={() => { timerStart += 30000; timerTotal += 30; timerSeconds = timerTotal - Math.floor((Date.now() - timerStart) / 1000); }}
      >+30s</button>
    </div>
  </div>
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

<!-- Confirm remove set dialog -->
<dialog bind:this={confirmRemoveSetEl} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box">
    <h3 class="font-bold text-lg mb-2">Remove set?</h3>
    <p class="text-base-content/60 text-sm">
      Set {pendingRemoveSet?.setNumber} of <span class="capitalize">{pendingRemoveSet?.exerciseName}</span> will be deleted.
    </p>
    <div class="modal-action">
      <button class="btn btn-ghost" onclick={() => { confirmRemoveSetEl?.close(); pendingRemoveSet = null; }}>Cancel</button>
      <button class="btn btn-error" onclick={confirmRemoveSet}>Remove</button>
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

<style>
  .timer-bar {
    transform: translateY(100%);
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .timer-bar--visible {
    transform: translateY(0);
  }
</style>
