<script lang="ts">
  import { goto } from '$app/navigation';
  import { getWorkout, saveSet, setExerciseUnit } from '../../workout.remote';

  let { data } = $props();
  const { date } = data;

  type Workout = NonNullable<Awaited<ReturnType<typeof getWorkout>>>;
  type ExType  = 'weighted' | 'reps' | 'timed';

  let loading  = $state(true);
  let workout  = $state<Workout | null>(null);
  let inputs   = $state<Record<string, { reps: string; weight: string }>>({});
  let exTypes  = $state<Record<string, ExType>>({});
  let saving   = $state<Record<string, boolean>>({});

  $effect(() => {
    loading = true;
    getWorkout(date).then(w => {
      if (w) {
        const initInputs: Record<string, { reps: string; weight: string }> = {};
        const initTypes: Record<string, ExType> = {};
        for (const ex of w.exercises) {
          initTypes[ex.name] = ex.unit;
          for (let s = 1; s <= ex.sets; s++) {
            const key     = `${ex.name}__${s}`;
            const current = ex.currentLogs.find(l => l.set_number === s);
            initInputs[key] = {
              reps:   current?.reps?.toString()      ?? ex.reps.toString(),
              weight: current?.weight_kg?.toString() ?? '',
            };
          }
        }
        inputs  = initInputs;
        exTypes = initTypes;
      }
      workout = w ?? null;
      loading = false;
    });
  });

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
    <div>
      <div class="text-xs text-base-content/40 uppercase tracking-wide">{dayLabel(date)}</div>
      {#if workout?.title}
        <div class="font-bold text-lg leading-tight">{workout.title}</div>
      {/if}
    </div>
  </div>

  {#if loading}
    <div class="flex justify-center py-16"><span class="loading loading-spinner loading-md"></span></div>
  {:else if !workout}
    <p class="text-base-content/50 text-sm p-4">No workout found for this date.</p>
  {:else}
    <div class="divide-y divide-base-200">
      {#each workout.exercises as ex}
        {@const type = exTypes[ex.name] ?? 'weighted'}
        <div class="px-4 py-5">

          <!-- Exercise header -->
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold capitalize">{ex.name}</h3>
            <div class="flex rounded-lg overflow-hidden border border-base-300 text-xs">
              <button
                class="px-2.5 py-1 transition-colors {type === 'weighted' ? 'bg-base-content text-base-100' : 'text-base-content/40 hover:text-base-content/70'}"
                onclick={() => { exTypes[ex.name] = 'weighted'; setExerciseUnit({ name: ex.name, unit: 'weighted' }); }}
              >Weighted</button>
              <button
                class="px-2.5 py-1 border-x border-base-300 transition-colors {type === 'reps' ? 'bg-base-content text-base-100' : 'text-base-content/40 hover:text-base-content/70'}"
                onclick={() => { exTypes[ex.name] = 'reps'; setExerciseUnit({ name: ex.name, unit: 'reps' }); }}
              >Reps</button>
              <button
                class="px-2.5 py-1 transition-colors {type === 'timed' ? 'bg-base-content text-base-100' : 'text-base-content/40 hover:text-base-content/70'}"
                onclick={() => { exTypes[ex.name] = 'timed'; setExerciseUnit({ name: ex.name, unit: 'timed' }); }}
              >Timed</button>
            </div>
          </div>

          <!-- Column headers -->
          {#if type === 'weighted'}
            <div class="grid grid-cols-[1.5rem_1fr_1fr_4rem] gap-2 mb-2 px-1">
              <span></span>
              <span class="text-xs text-base-content/40 text-center">Reps</span>
              <span class="text-xs text-base-content/40 text-center">kg</span>
              <span class="text-xs text-base-content/40 text-right">Last</span>
            </div>
          {:else if type === 'reps'}
            <div class="grid grid-cols-[1.5rem_1fr_4rem] gap-2 mb-2 px-1">
              <span></span>
              <span class="text-xs text-base-content/40 text-center">Reps</span>
              <span class="text-xs text-base-content/40 text-right">Last</span>
            </div>
          {:else}
            <div class="grid grid-cols-[1.5rem_1fr_4rem] gap-2 mb-2 px-1">
              <span></span>
              <span class="text-xs text-base-content/40 text-center">Seconds</span>
              <span class="text-xs text-base-content/40 text-right">Last</span>
            </div>
          {/if}

          <!-- Sets -->
          <div class="space-y-2">
            {#each { length: ex.sets } as _, i}
              {@const setNum  = i + 1}
              {@const key     = `${ex.name}__${setNum}`}
              {@const prevLog = ex.previousLogs.find(l => l.set_number === setNum)}
              {@const done    = saving[key] === false && (inputs[key]?.reps || inputs[key]?.weight)}

              {#if type === 'weighted'}
                <div class="grid grid-cols-[1.5rem_1fr_1fr_4rem] gap-2 items-center">
                  <span class="text-xs text-base-content/30 text-center font-mono">{setNum}</span>
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
                  <span class="text-xs text-base-content/30 text-right tabular-nums">
                    {#if prevLog?.weight_kg != null}{prevLog.weight_kg}kg
                    {:else if prevLog?.reps != null}{prevLog.reps}
                    {:else}—{/if}
                  </span>
                </div>

              {:else if type === 'reps'}
                <div class="grid grid-cols-[1.5rem_1fr_4rem] gap-2 items-center">
                  <span class="text-xs text-base-content/30 text-center font-mono">{setNum}</span>
                  <input
                    type="number" inputmode="numeric"
                    class="input input-sm input-bordered w-full text-center bg-base-200 border-base-300 focus:border-primary"
                    bind:value={inputs[key].reps}
                    onblur={() => handleBlur(ex.name, setNum)}
                  />
                  <span class="text-xs text-base-content/30 text-right tabular-nums">
                    {prevLog?.reps != null ? prevLog.reps : '—'}
                  </span>
                </div>

              {:else}
                <div class="grid grid-cols-[1.5rem_1fr_4rem] gap-2 items-center">
                  <span class="text-xs text-base-content/30 text-center font-mono">{setNum}</span>
                  <input
                    type="number" inputmode="numeric"
                    class="input input-sm input-bordered w-full text-center bg-base-200 border-base-300 focus:border-primary"
                    bind:value={inputs[key].reps}
                    onblur={() => handleBlur(ex.name, setNum)}
                  />
                  <span class="text-xs text-base-content/30 text-right tabular-nums">
                    {prevLog?.reps != null ? `${prevLog.reps}s` : '—'}
                  </span>
                </div>
              {/if}
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
