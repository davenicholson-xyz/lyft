<script lang="ts">
  import { goto } from '$app/navigation';
  import { getStrengthData } from '../analytics.remote';
  import Chart from 'chart.js/auto';

  type StrengthData = Awaited<ReturnType<typeof getStrengthData>>;

  let data             = $state<StrengthData | null>(null);
  let selected         = $state<string | null>(null);
  let volCanvas        = $state<HTMLCanvasElement | null>(null);
  let lineCanvas       = $state<HTMLCanvasElement | null>(null);
  let adherenceCanvas  = $state<HTMLCanvasElement | null>(null);

  $effect(() => {
    void getStrengthData().then(d => { data = d; });
  });

  function cssColor(v: string) {
    return getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  }

  function alpha(color: string, a: number) {
    return color.replace(/\)$/, ` / ${a})`);
  }

  $effect(() => {
    if (!volCanvas || !data) return;
    const primary = cssColor('--color-primary');
    const content = cssColor('--color-base-content');
    const grid    = cssColor('--color-base-300');

    const entries = Object.entries(data.weeklyVolume)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12);

    const chart = new Chart(volCanvas, {
      type: 'bar',
      data: {
        labels: entries.map(([wk]) =>
          new Date(wk + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
        ),
        datasets: [{
          data: entries.map(([, v]) => Math.round(v)),
          backgroundColor: alpha(primary, 0.4),
          borderColor: primary,
          borderWidth: 1,
          borderRadius: 4,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => `${(ctx.parsed.y as number).toLocaleString()} kg` } },
        },
        scales: {
          x: { grid: { color: alpha(grid, 0.4) }, ticks: { color: alpha(content, 0.5), font: { size: 11 } } },
          y: { grid: { color: alpha(grid, 0.4) }, ticks: { color: alpha(content, 0.5), font: { size: 11 } }, beginAtZero: true },
        },
      },
    });
    return () => chart.destroy();
  });

  $effect(() => {
    if (!adherenceCanvas || !data) return;
    const primary = cssColor('--color-primary');
    const error   = cssColor('--color-error');
    const content = cssColor('--color-base-content');
    const grid    = cssColor('--color-base-300');

    const entries = Object.entries(data.weeklyAdherence)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12);

    const chart = new Chart(adherenceCanvas, {
      type: 'bar',
      data: {
        labels: entries.map(([wk]) =>
          new Date(wk + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
        ),
        datasets: [
          {
            label: 'Done',
            data: entries.map(([, v]) => v.done),
            backgroundColor: alpha(primary, 0.8),
            borderColor: primary,
            borderWidth: 1,
            borderRadius: 0,
            stack: 'a',
          },
          {
            label: 'Missed',
            data: entries.map(([, v]) => v.planned - v.done),
            backgroundColor: alpha(error, 0.25),
            borderColor: alpha(error, 0.4),
            borderWidth: 1,
            borderRadius: 4,
            stack: 'a',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y}`,
              footer: items => {
                const done    = items[0]?.parsed.y ?? 0;
                const missed  = items[1]?.parsed.y ?? 0;
                const total   = done + missed;
                return total > 0 ? `${Math.round((done / total) * 100)}% complete` : '';
              },
            },
          },
        },
        scales: {
          x: { stacked: true, grid: { color: alpha(grid, 0.4) }, ticks: { color: alpha(content, 0.5), font: { size: 11 } } },
          y: { stacked: true, grid: { color: alpha(grid, 0.4) }, ticks: { color: alpha(content, 0.5), font: { size: 11 } }, beginAtZero: true, max: 7 },
        },
      },
    });
    return () => chart.destroy();
  });

  $effect(() => {
    if (!lineCanvas || !selected || !data) return;
    const primary = cssColor('--color-primary');
    const content = cssColor('--color-base-content');
    const grid    = cssColor('--color-base-300');

    const pts = (data.byExercise[selected] ?? []).filter(p => p.maxWeight != null);

    const chart = new Chart(lineCanvas, {
      type: 'line',
      data: {
        labels: pts.map(p =>
          new Date(p.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
        ),
        datasets: [{
          data: pts.map(p => p.maxWeight),
          borderColor: primary,
          backgroundColor: alpha(primary, 0.15),
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointBackgroundColor: primary,
          pointHoverRadius: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => `${ctx.parsed.y} kg` } },
        },
        scales: {
          x: { grid: { color: alpha(grid, 0.4) }, ticks: { color: alpha(content, 0.5), font: { size: 11 } } },
          y: {
            grid: { color: alpha(grid, 0.4) },
            ticks: { color: alpha(content, 0.5), font: { size: 11 }, callback: v => `${v}kg` },
          },
        },
      },
    });
    return () => chart.destroy();
  });

  let exercises = $derived(data ? Object.keys(data.byExercise).sort() : []);
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

  {#if !data}
    <div class="flex justify-center py-12"><span class="loading loading-spinner loading-md"></span></div>
  {:else if exercises.length === 0}
    <p class="text-sm text-base-content/40 text-center py-12">No workout logs yet.</p>
  {:else}
    <div class="bg-base-200 rounded-2xl p-4 mb-6">
      <p class="text-xs font-semibold uppercase tracking-wide text-base-content/40 mb-3">Weekly Volume (kg × reps)</p>
      <div class="relative h-44">
        <canvas bind:this={volCanvas}></canvas>
      </div>
    </div>

    <div class="bg-base-200 rounded-2xl p-4 mb-6">
      <p class="text-xs font-semibold uppercase tracking-wide text-base-content/40 mb-1">Workout Adherence</p>
      <p class="text-xs text-base-content/30 mb-3">Planned vs completed · last 12 weeks</p>
      <div class="relative h-44">
        <canvas bind:this={adherenceCanvas}></canvas>
      </div>
      <div class="flex gap-4 mt-3">
        <span class="flex items-center gap-1.5 text-xs text-base-content/40">
          <span class="inline-block w-3 h-3 rounded-sm bg-primary opacity-80"></span>Done
        </span>
        <span class="flex items-center gap-1.5 text-xs text-base-content/40">
          <span class="inline-block w-3 h-3 rounded-sm bg-error opacity-25"></span>Missed
        </span>
      </div>
    </div>

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
      {@const pts = data.byExercise[selected]}
      <div class="bg-base-200 rounded-2xl p-4">
        <p class="text-sm font-semibold capitalize mb-3">{selected}</p>
        <div class="relative h-52">
          <canvas bind:this={lineCanvas}></canvas>
        </div>
        <div class="mt-4 space-y-1.5 border-t border-base-300 pt-3">
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
</div>
