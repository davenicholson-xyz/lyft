<script lang="ts">
  import { goto } from '$app/navigation';
  import { getStrengthData } from '../analytics.remote';

  let selected = $state<string | null>(null);

  function buildLine(points: { date: string; maxWeight: number | null; maxReps: number | null }[], key: 'maxWeight' | 'maxReps') {
    const pts = points.filter(p => p[key] != null);
    if (pts.length < 2) return null;
    const W = 320, H = 80, PAD = 8;
    const vals = pts.map(p => p[key] as number);
    const minV = Math.min(...vals), maxV = Math.max(...vals);
    const range = maxV - minV || 1;
    const coords = pts.map((p, i) => {
      const x = PAD + (i / (pts.length - 1)) * (W - PAD * 2);
      const y = PAD + (1 - ((p[key] as number) - minV) / range) * (H - PAD * 2);
      return `${x},${y}`;
    });
    return { coords: coords.join(' '), W, H, minV, maxV, latest: vals.at(-1)! };
  }

  function buildVolume(weeklyVolume: Record<string, number>) {
    const entries = Object.entries(weeklyVolume).sort(([a], [b]) => a.localeCompare(b)).slice(-12);
    if (entries.length < 2) return null;
    const W = 320, H = 60, PAD = 8;
    const vals = entries.map(([, v]) => v);
    const maxV = Math.max(...vals);
    const bars = entries.map(([wk, v], i) => ({
      x: PAD + (i / entries.length) * (W - PAD * 2),
      w: ((W - PAD * 2) / entries.length) * 0.7,
      h: maxV > 0 ? ((v / maxV) * (H - PAD * 2)) : 0,
      y: H - PAD,
      wk,
    }));
    return { bars, W, H, maxV: Math.round(maxV) };
  }
</script>

<div class="max-w-lg mx-auto p-4 pb-24">
  <div class="flex items-center gap-3 pt-2 mb-6">
    <button class="btn btn-ghost btn-sm btn-circle" onclick={() => goto('/')}>
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
      </svg>
    </button>
    <h1 class="text-xl font-bold">Analytics</h1>
  </div>

  {#await getStrengthData()}
    <div class="flex justify-center py-12"><span class="loading loading-spinner loading-md"></span></div>
  {:then data}
    {@const exercises = Object.keys(data.byExercise).sort()}

    {#if exercises.length === 0}
      <p class="text-sm text-base-content/40 text-center py-12">No workout logs yet.</p>
    {:else}
      <!-- Weekly volume chart -->
      {@const volChart = buildVolume(data.weeklyVolume)}
      {#if volChart}
        <div class="bg-base-200 rounded-2xl p-4 mb-6">
          <p class="text-xs font-semibold uppercase tracking-wide text-base-content/40 mb-3">Weekly Volume (kg × reps)</p>
          <svg viewBox="0 0 {volChart.W} {volChart.H}" class="w-full" preserveAspectRatio="none">
            {#each volChart.bars as bar}
              <rect
                x={bar.x} y={bar.y - bar.h}
                width={bar.w} height={bar.h}
                fill="oklch(var(--p))" opacity="0.6" rx="2"
              />
            {/each}
          </svg>
          <p class="text-xs text-base-content/30 text-right mt-1">Last 12 weeks · peak {volChart.maxV.toLocaleString()} kg</p>
        </div>
      {/if}

      <!-- Exercise selector -->
      <p class="text-xs font-semibold uppercase tracking-wide text-base-content/40 mb-3">Strength Progression</p>
      <div class="flex flex-wrap gap-2 mb-4">
        {#each exercises as ex}
          <button
            class="btn btn-xs {selected === ex ? 'btn-primary' : 'btn-ghost'} capitalize"
            onclick={() => selected = selected === ex ? null : ex}
          >{ex}</button>
        {/each}
      </div>

      {#if selected && data.byExercise[selected]}
        {@const pts  = data.byExercise[selected]}
        {@const wLine = buildLine(pts, 'maxWeight')}
        {@const rLine = buildLine(pts, 'maxReps')}
        <div class="bg-base-200 rounded-2xl p-4">
          <p class="text-sm font-semibold capitalize mb-3">{selected}</p>

          {#if wLine}
            <p class="text-xs text-base-content/40 mb-1">Max weight</p>
            <svg viewBox="0 0 {wLine.W} {wLine.H}" class="w-full mb-1" preserveAspectRatio="none">
              <polyline points={wLine.coords} fill="none" stroke="oklch(var(--p))" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <div class="flex justify-between text-xs text-base-content/30 mb-4">
              <span>{wLine.minV} kg</span>
              <span class="font-medium text-base-content/60">{wLine.latest} kg latest</span>
              <span>{wLine.maxV} kg</span>
            </div>
          {/if}

          {#if rLine && !wLine}
            <p class="text-xs text-base-content/40 mb-1">Max reps</p>
            <svg viewBox="0 0 {rLine.W} {rLine.H}" class="w-full mb-1" preserveAspectRatio="none">
              <polyline points={rLine.coords} fill="none" stroke="oklch(var(--s))" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <div class="flex justify-between text-xs text-base-content/30">
              <span>{rLine.minV}</span>
              <span class="font-medium text-base-content/60">{rLine.latest} latest</span>
              <span>{rLine.maxV}</span>
            </div>
          {/if}

          <!-- Session list -->
          <div class="mt-3 space-y-1">
            {#each [...pts].reverse().slice(0, 8) as pt}
              <div class="flex justify-between text-xs text-base-content/50">
                <span>{new Date(pt.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                <span class="tabular-nums">
                  {#if pt.maxWeight != null}{pt.maxWeight}kg{/if}
                  {#if pt.maxReps != null}{pt.maxWeight != null ? ' · ' : ''}{pt.maxReps} reps{/if}
                  · {pt.sets} sets
                </span>
              </div>
            {/each}
          </div>
        </div>
      {:else if !selected}
        <p class="text-xs text-base-content/30 text-center py-4">Select an exercise above</p>
      {/if}
    {/if}
  {/await}
</div>
