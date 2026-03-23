<script lang="ts">
  import { goto } from '$app/navigation';
  import { getWorkout, saveSet, setExerciseUnit } from '../../workout.remote';

  let { data } = $props();
  const { date } = data;

  type Workout = NonNullable<Awaited<ReturnType<typeof getWorkout>>>;
  type ExType  = 'weighted' | 'reps' | 'timed';

  let loading      = $state(true);
  let workout      = $state<Workout | null>(null);
  let inputs       = $state<Record<string, { reps: string; weight: string }>>({});
  let exTypes      = $state<Record<string, ExType>>({});

  $effect(() => {
    loading = true;
    getWorkout(date).then(w => {
      if (w) {
        const initInputs: Record<string, { reps: string; weight: string }> = {};
        const initTypes: Record<string, ExType> = {};
        for (const ex of w.exercises) {
          // use parsed unit as default type
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
    const inp  = inputs[`${exerciseName}__${setNumber}`];
    const type = exTypes[exerciseName] ?? 'weighted';
    if (!inp) return;

    if (type === 'timed') {
      const duration = parseInt(inp.reps);
      if (!duration) return;
      await saveSet({ date, exercise_name: exerciseName, set_number: setNumber, reps: duration, weight_kg: null });
    } else {
      const reps      = parseInt(inp.reps) || null;
      const weight_kg = type === 'weighted' && inp.weight ? (parseFloat(inp.weight) || null) : null;
      if (reps === null && weight_kg === null) return;
      await saveSet({ date, exercise_name: exerciseName, set_number: setNumber, reps, weight_kg });
    }
  }

  function dayLabel(d: string) {
    return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
  }
</script>

<div class="max-w-lg mx-auto p-4 pb-24">
  <div class="flex items-center gap-3 mb-6 pt-2">
    <button class="btn btn-ghost btn-sm btn-circle" onclick={() => goto('/')}>
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
      </svg>
    </button>
    <div class="font-semibold">{dayLabel(date)}</div>
  </div>

  {#if loading}
    <div class="flex justify-center py-12"><span class="loading loading-spinner loading-md"></span></div>
  {:else if !workout}
    <p class="text-base-content/50 text-sm">No workout found for this date.</p>
  {:else}
    {#if workout.title}
      <h2 class="text-xl font-bold mb-6">{workout.title}</h2>
    {/if}

    <div class="space-y-8">
      {#each workout.exercises as ex}
        {@const type = exTypes[ex.name] ?? 'weighted'}
        <div>
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold text-base capitalize">{ex.name}</h3>
            <div class="join">
              <button
                class="join-item btn btn-xs {type === 'weighted' ? 'btn-neutral' : 'btn-ghost'}"
                onclick={() => { exTypes[ex.name] = 'weighted'; setExerciseUnit({ name: ex.name, unit: 'weighted' }); }}
              >Weighted</button>
              <button
                class="join-item btn btn-xs {type === 'reps' ? 'btn-neutral' : 'btn-ghost'}"
                onclick={() => { exTypes[ex.name] = 'reps'; setExerciseUnit({ name: ex.name, unit: 'reps' }); }}
              >Reps</button>
              <button
                class="join-item btn btn-xs {type === 'timed' ? 'btn-neutral' : 'btn-ghost'}"
                onclick={() => { exTypes[ex.name] = 'timed'; setExerciseUnit({ name: ex.name, unit: 'timed' }); }}
              >Timed</button>
            </div>
          </div>

          {#if type === 'timed'}
            <div class="grid grid-cols-[2rem_1fr_auto] gap-x-3 mb-1 px-1">
              <span class="text-xs text-base-content/40">#</span>
              <span class="text-xs text-base-content/40">Duration (s)</span>
              <span class="text-xs text-base-content/40">Last time</span>
            </div>
            <div class="space-y-2">
              {#each { length: ex.sets } as _, i}
                {@const setNum  = i + 1}
                {@const key     = `${ex.name}__${setNum}`}
                {@const prevLog = ex.previousLogs.find(l => l.set_number === setNum)}
                <div class="grid grid-cols-[2rem_1fr_auto] gap-x-3 items-center">
                  <span class="text-sm text-base-content/40 text-center">{setNum}</span>
                  <input
                    type="number" inputmode="numeric"
                    class="input input-sm input-bordered w-full text-center"
                    bind:value={inputs[key].reps}
                    onblur={() => handleBlur(ex.name, setNum)}
                  />
                  <span class="text-xs text-base-content/40 whitespace-nowrap">
                    {prevLog?.reps != null ? `${prevLog.reps}s` : '—'}
                  </span>
                </div>
              {/each}
            </div>

          {:else if type === 'reps'}
            <div class="grid grid-cols-[2rem_1fr_auto] gap-x-3 mb-1 px-1">
              <span class="text-xs text-base-content/40">#</span>
              <span class="text-xs text-base-content/40">Reps</span>
              <span class="text-xs text-base-content/40">Last time</span>
            </div>
            <div class="space-y-2">
              {#each { length: ex.sets } as _, i}
                {@const setNum  = i + 1}
                {@const key     = `${ex.name}__${setNum}`}
                {@const prevLog = ex.previousLogs.find(l => l.set_number === setNum)}
                <div class="grid grid-cols-[2rem_1fr_auto] gap-x-3 items-center">
                  <span class="text-sm text-base-content/40 text-center">{setNum}</span>
                  <input
                    type="number" inputmode="numeric"
                    class="input input-sm input-bordered w-full text-center"
                    bind:value={inputs[key].reps}
                    onblur={() => handleBlur(ex.name, setNum)}
                  />
                  <span class="text-xs text-base-content/40 whitespace-nowrap">
                    {prevLog?.reps != null ? `${prevLog.reps} reps` : '—'}
                  </span>
                </div>
              {/each}
            </div>

          {:else}
            <div class="grid grid-cols-[2rem_1fr_1fr_auto] gap-x-3 mb-1 px-1">
              <span class="text-xs text-base-content/40">#</span>
              <span class="text-xs text-base-content/40">Reps</span>
              <span class="text-xs text-base-content/40">Weight (kg)</span>
              <span class="text-xs text-base-content/40">Last time</span>
            </div>
            <div class="space-y-2">
              {#each { length: ex.sets } as _, i}
                {@const setNum  = i + 1}
                {@const key     = `${ex.name}__${setNum}`}
                {@const prevLog = ex.previousLogs.find(l => l.set_number === setNum)}
                <div class="grid grid-cols-[2rem_1fr_1fr_auto] gap-x-3 items-center">
                  <span class="text-sm text-base-content/40 text-center">{setNum}</span>
                  <input
                    type="number" inputmode="numeric"
                    class="input input-sm input-bordered w-full text-center"
                    bind:value={inputs[key].reps}
                    onblur={() => handleBlur(ex.name, setNum)}
                  />
                  <input
                    type="number" inputmode="decimal" step="0.5" placeholder="—"
                    class="input input-sm input-bordered w-full text-center"
                    bind:value={inputs[key].weight}
                    onblur={() => handleBlur(ex.name, setNum)}
                  />
                  <span class="text-xs text-base-content/40 whitespace-nowrap">
                    {#if prevLog?.weight_kg != null}
                      {prevLog.weight_kg} kg
                    {:else if prevLog?.reps != null}
                      {prevLog.reps} reps
                    {:else}
                      —
                    {/if}
                  </span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
