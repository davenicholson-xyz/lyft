<script lang="ts">
  import { getMonthData, getDayDetail, addPlan, deletePlan, swapDays } from './calendar.remote';
  import { goto } from '$app/navigation';
  import { getStravaStatus, syncStrava } from './strava.remote';
  import { generateWeekPlan, acceptWeekPlan, generateDayWorkout, acceptDayWorkout } from './planning.remote';

  type GeneratedPlan = { summary: string; days: { date: string; type: string; notes: string }[]; runDates: string[]; existingDates: string[] };

  type View = 'month' | 'week';

  const today = new Date();

  let view             = $state<View>('week');
  let currentYear      = $state(today.getFullYear());
  let currentMonth     = $state(today.getMonth()); // 0-indexed
  let currentWeekStart = $state(getMonday(today));  // always a Monday Date
  let selectedDate     = $state<string | null>(null);
  let syncing          = $state(false);
  let syncResult       = $state<string | null>(null);
  let addingRun        = $state(false);
  let runDistance      = $state('');
  let planLoading        = $state(false);
  let planError          = $state<string | null>(null);
  let generatedPlan      = $state<GeneratedPlan | null>(null);
  let regenNotes         = $state('');
  let showRegenInput     = $state(false);
  let confirmPlanEl      = $state<HTMLDialogElement | null>(null);

  let dayWorkoutLoading  = $state(false);
  let dayWorkoutPreview  = $state<string | null>(null);
  let dayWorkoutError    = $state<string | null>(null);
  let clearingWeek       = $state(false);
  let showSwapList       = $state(false);

  function planLabel(type: string, notes: string | null | undefined): string {
    if (type !== 'workout') return type;
    if (!notes) return 'Workout';
    const colonIdx = notes.indexOf(':');
    if (colonIdx !== -1) return notes.slice(0, colonIdx).trim();
    const m = notes.split(',')[0].trim().match(/^(.+?)\s+\d+/);
    return m ? m[1].trim() : 'Workout';
  }

  function siblingWeekDates(dateStr: string): string[] {
    const d = new Date(dateStr + 'T12:00:00');
    const dow = d.getDay();
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(d);
      day.setDate(d.getDate() + mondayOffset + i);
      return toISO(day);
    }).filter(s => s !== dateStr);
  }

  async function handleClearWeek(weekMonthData: { plans: { id: number; date: string; type: string }[] }) {
    clearingWeek = true;
    const weekDateStrs = buildWeekDays(currentWeekStart).map(toISO);
    const toDelete = weekMonthData.plans.filter(p => weekDateStrs.includes(p.date) && p.type === 'workout');
    for (const p of toDelete) await deletePlan({ id: p.id, date: p.date });
    clearingWeek = false;
  }

  async function handleSync() {
    syncing = true;
    syncResult = null;
    try {
      const result = await syncStrava();
      syncResult = result.synced > 0 ? `Synced ${result.synced} run${result.synced === 1 ? '' : 's'}` : 'Already up to date';
    } catch {
      syncResult = 'Sync failed';
    } finally {
      syncing = false;
    }
  }

  let yearMonth = $derived(
    `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`
  );
  let weekYearMonth = $derived(
    `${currentWeekStart.getFullYear()}-${String(currentWeekStart.getMonth() + 1).padStart(2, '0')}`
  );
  let weekEndYearMonth = $derived.by(() => {
    const end = new Date(currentWeekStart);
    end.setDate(end.getDate() + 6);
    return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}`;
  });

  function toISO(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function getMonday(d: Date): Date {
    const copy = new Date(d);
    const day = copy.getDay(); // 0=Sun
    const diff = (day + 6) % 7; // days since Monday
    copy.setDate(copy.getDate() - diff);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  function buildMonthGrid(year: number, month: number): (Date | null)[][] {
    const firstDay = new Date(year, month, 1);
    const lastDay  = new Date(year, month + 1, 0);
    const offset   = (firstDay.getDay() + 6) % 7; // 0=Mon
    const weeks: (Date | null)[][] = [];
    let week: (Date | null)[] = Array(offset).fill(null);
    for (let d = 1; d <= lastDay.getDate(); d++) {
      week.push(new Date(year, month, d));
      if (week.length === 7) { weeks.push(week); week = []; }
    }
    if (week.length > 0) {
      while (week.length < 7) week.push(null);
      weeks.push(week);
    }
    return weeks;
  }

  function buildWeekDays(weekStart: Date): Date[] {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }

  function typeColor(type: string): string {
    if (type === 'run')     return '#f87171';
    if (type === 'workout') return '#60a5fa';
    return '#9ca3af';
  }

  function getDots(dateStr: string, monthData: { plans: { date: string; type: string; status: string }[]; sessions: { date: string; type: string }[] }) {
    const dayPlans    = monthData.plans.filter(p => p.date === dateStr);
    const daySessions = monthData.sessions.filter(s => s.date === dateStr);

    const dots: { type: string; solid: boolean }[] = [];
    const seen = new Set<string>();

    for (const p of dayPlans) {
      if (seen.has(p.type)) continue;
      seen.add(p.type);
      const hasSession = daySessions.some(s => s.type === p.type);
      dots.push({ type: p.type, solid: hasSession || p.status === 'done' });
      if (dots.length === 3) break;
    }

    // Add session types not covered by plans
    for (const s of daySessions) {
      if (seen.has(s.type)) continue;
      seen.add(s.type);
      dots.push({ type: s.type, solid: true });
      if (dots.length === 3) break;
    }

    return dots.slice(0, 3);
  }

  function isToday(d: Date): boolean {
    return toISO(d) === toISO(today);
  }

  function prevMonth() {
    if (currentMonth === 0) { currentMonth = 11; currentYear--; }
    else currentMonth--;
  }
  function nextMonth() {
    if (currentMonth === 11) { currentMonth = 0; currentYear++; }
    else currentMonth++;
  }
  function prevWeek() {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() - 7);
    currentWeekStart = d;
  }
  function nextWeek() {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + 7);
    currentWeekStart = d;
  }

  function selectDay(d: Date | null) {
    if (!d) return;
    selectedDate = toISO(d);
  }

  function closePanel() {
    selectedDate      = null;
    addingRun         = false;
    runDistance       = '';
    dayWorkoutPreview = null;
    dayWorkoutError   = null;
    showSwapList      = false;
  }

  async function handleDeletePlan(id: number, date: string) {
    await deletePlan({ id, date });
  }

  async function handleGeneratePlan() {
    planLoading = true;
    planError = null;
    generatedPlan = null;
    selectedDate = null;
    showRegenInput = false;
    try {
      generatedPlan = await generateWeekPlan({ weekStart: toISO(currentWeekStart) });
    } catch (e) {
      planError = e instanceof Error ? e.message : 'Failed to generate plan';
    } finally {
      planLoading = false;
    }
  }

  async function handleRegenPlan() {
    planLoading = true;
    planError = null;
    showRegenInput = false;
    try {
      generatedPlan = await generateWeekPlan({ weekStart: toISO(currentWeekStart), notes: regenNotes || undefined });
      regenNotes = '';
    } catch (e) {
      planError = e instanceof Error ? e.message : 'Failed to regenerate plan';
    } finally {
      planLoading = false;
    }
  }

  function handleAcceptPlan() {
    if (!generatedPlan) return;
    if (generatedPlan.existingDates.length > 0) {
      confirmPlanEl?.showModal();
    } else {
      doAcceptPlan();
    }
  }

  async function doAcceptPlan() {
    if (!generatedPlan) return;
    await acceptWeekPlan({ days: generatedPlan.days as { date: string; type: 'run' | 'rest'; notes: string }[] });
    confirmPlanEl?.close();
    generatedPlan = null;
  }

  function dayName(dateStr: string): string {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short' });
  }

  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  const typeColors: Record<string, string> = {
    run:     '#f87171',
    workout: '#60a5fa',
    rest:    '#9ca3af',
  };

  function ordinal(n: number): string {
    const s = ['th','st','nd','rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
  }

  function weekRangeLabel(start: Date, end: Date): string {
    const sm = start.toLocaleDateString('en-GB', { month: 'short' });
    const em = end.toLocaleDateString('en-GB',   { month: 'short' });
    return sm === em
      ? `${ordinal(start.getDate())} – ${ordinal(end.getDate())} ${em}`
      : `${ordinal(start.getDate())} ${sm} – ${ordinal(end.getDate())} ${em}`;
  }
</script>

<div class="min-h-screen bg-base-100 text-base-content p-4 pb-0 max-w-lg mx-auto">
  <!-- View toggle + Strava -->
  <div class="flex items-center gap-2 mb-4">
    <button
      class="btn btn-sm {view === 'month' ? 'btn-primary' : 'btn-ghost'}"
      onclick={() => view = 'month'}
    >Month</button>
    <button
      class="btn btn-sm {view === 'week' ? 'btn-primary' : 'btn-ghost'}"
      onclick={() => view = 'week'}
    >Week</button>

    <div class="ml-auto flex items-center gap-2">
      {#if syncResult}
        <span class="text-xs text-base-content/50">{syncResult}</span>
      {/if}
      {#await getStravaStatus()}
        <span class="loading loading-spinner loading-xs"></span>
      {:then status}
        {#if status.connected}
          <button class="btn btn-sm btn-ghost text-[#FC4C02]" onclick={handleSync} disabled={syncing}>
            {#if syncing}
              <span class="loading loading-spinner loading-xs"></span>
            {:else}
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 16 16"><path fill="currentColor" d="M6.731 0L2 9.125h2.788L6.73 5.497l1.93 3.628h2.766zm4.694 9.125l-1.372 2.756L8.66 9.125H6.547L10.053 16l3.484-6.875z"/></svg>
            {/if}
          </button>
        {:else}
          <a href="/strava/connect" class="btn btn-sm btn-ghost text-[#FC4C02]">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 16 16"><path fill="currentColor" d="M6.731 0L2 9.125h2.788L6.73 5.497l1.93 3.628h2.766zm4.694 9.125l-1.372 2.756L8.66 9.125H6.547L10.053 16l3.484-6.875z"/></svg>
          </a>
        {/if}
      {/await}
    </div>
  </div>

  {#await getMonthData(yearMonth)}
    <div class="flex justify-center py-12"><span class="loading loading-spinner loading-md"></span></div>
  {:then monthData}
    {#if view === 'month'}
      <!-- Month nav -->
      <div class="flex items-center justify-between mb-3">
        <button class="btn btn-ghost btn-sm btn-circle" aria-label="Previous month" onclick={prevMonth}>
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <span class="font-semibold text-lg">{monthNames[currentMonth]} {currentYear}</span>
        <button class="btn btn-ghost btn-sm btn-circle" aria-label="Next month" onclick={nextMonth}>
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
          </svg>
        </button>
      </div>

      <!-- Day headers -->
      <div class="grid grid-cols-7 mb-1">
        {#each ['M','T','W','T','F','S','S'] as h}
          <div class="text-center text-xs text-base-content/50 py-1">{h}</div>
        {/each}
      </div>

      <!-- Month grid -->
      {#each buildMonthGrid(currentYear, currentMonth) as week}
        <div class="grid grid-cols-7">
          {#each week as day}
            {#if day}
              {@const dateStr = toISO(day)}
              {@const dots = getDots(dateStr, monthData)}
              <button
                class="flex flex-col items-center py-2 rounded-lg hover:bg-base-200 transition-colors {selectedDate === dateStr ? 'bg-base-200' : ''}"
                onclick={() => selectDay(day)}
              >
                <span class="text-sm w-7 h-7 flex items-center justify-center rounded-full {isToday(day) ? 'bg-primary text-primary-content font-bold' : ''}">
                  {day.getDate()}
                </span>
                <div class="flex gap-0.5 mt-1">
                  {#each dots as dot}
                    {@render activityIcon(dot.type, dot.solid, 'h-3 w-3')}
                  {/each}
                </div>
              </button>
            {:else}
              <div></div>
            {/if}
          {/each}
        </div>
      {/each}

    {:else}
      <!-- Week view -->
      {#await Promise.all([getMonthData(weekYearMonth), getMonthData(weekEndYearMonth)])}
        <div class="flex justify-center py-12"><span class="loading loading-spinner loading-md"></span></div>
      {:then [startData, endData]}
        {@const weekMonthData = weekYearMonth === weekEndYearMonth
          ? startData
          : { plans: [...startData.plans, ...endData.plans], sessions: [...startData.sessions, ...endData.sessions] }}
        {@const weekDays = buildWeekDays(currentWeekStart)}
        {@const weekEnd = weekDays[6]}

        <!-- Week nav -->
        <div class="flex items-center justify-between mb-3">
          <button class="btn btn-ghost btn-sm btn-circle" aria-label="Previous week" onclick={prevWeek}>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <span class="font-semibold text-sm">{weekRangeLabel(currentWeekStart, weekEnd)}</span>
          <button class="btn btn-ghost btn-sm btn-circle" aria-label="Next week" onclick={nextWeek}>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
          </button>
        </div>

        <!-- Day headers -->
        <div class="grid grid-cols-7 mb-1">
          {#each ['M','T','W','T','F','S','S'] as h}
            <div class="text-center text-xs text-base-content/50 py-1">{h}</div>
          {/each}
        </div>

        <!-- Week days -->
        <div class="grid grid-cols-7">
          {#each weekDays as day}
            {@const dateStr = toISO(day)}
            {@const dots = getDots(dateStr, weekMonthData)}
            <button
              class="flex flex-col items-center py-3 rounded-lg hover:bg-base-200 transition-colors {selectedDate === dateStr ? 'bg-base-200' : ''}"
              onclick={() => selectDay(day)}
            >
              <span class="text-sm w-8 h-8 flex items-center justify-center rounded-full {isToday(day) ? 'bg-primary text-primary-content font-bold' : ''}">
                {day.getDate()}
              </span>
              <div class="flex gap-0.5 mt-1">
                {#each dots as dot}
                  {@render activityIcon(dot.type, dot.solid, 'h-3.5 w-3.5')}
                {/each}
              </div>
            </button>
          {/each}
        </div>

        <!-- Generate plan -->
        <div class="mt-4 flex items-center gap-2">
          <button
            class="btn btn-sm btn-outline flex-1"
            onclick={handleGeneratePlan}
            disabled={planLoading}
          >
            {#if planLoading}
              <span class="loading loading-spinner loading-xs"></span>
              Thinking…
            {:else}
              Generate week plan
            {/if}
          </button>
          {#if weekMonthData.plans.some(p => weekDateStrs.includes(p.date) && p.type === 'workout')}
            <button
              class="btn btn-sm btn-ghost text-base-content/40 hover:text-error"
              onclick={() => handleClearWeek(weekMonthData)}
              disabled={clearingWeek}
              title="Clear all workouts this week"
            >
              {#if clearingWeek}<span class="loading loading-spinner loading-xs"></span>{:else}Clear{/if}
            </button>
          {/if}
          {#if planError}
            <span class="text-xs text-error">{planError}</span>
          {/if}
        </div>

        <!-- Weekly run distance -->
        {@const weekDateStrs = weekDays.map(toISO)}
        {@const plannedKm = weekMonthData.plans
          .filter(p => weekDateStrs.includes(p.date) && p.type === 'run' && p.notes)
          .reduce((sum, p) => sum + (parseFloat(p.notes!) || 0), 0)}
        {@const actualKm = weekMonthData.sessions
          .filter(s => weekDateStrs.includes(s.date) && s.type === 'run')
          .reduce((sum, s) => {
            const m = s.notes?.match(/(\d+\.?\d*)\s*km/);
            return sum + (m ? parseFloat(m[1]) : 0);
          }, 0)}
        {#if plannedKm > 0 || actualKm > 0}
          <div class="mt-4 space-y-3">
            <div class="flex items-center gap-1.5 text-xs font-semibold text-base-content/50 uppercase tracking-wide">
              {@render activityIcon('run', true, 'h-3.5 w-3.5')}
              Running
            </div>
            {#if plannedKm > 0}
              <div>
                <div class="flex justify-between text-xs text-base-content/50 mb-1">
                  <span>Planned</span>
                  <span>{plannedKm.toFixed(1)} km</span>
                </div>
                <div class="h-1.5 rounded-full bg-base-300 overflow-hidden">
                  <div class="h-full rounded-full bg-base-content/20" style="width:100%"></div>
                </div>
              </div>
            {/if}
            <div>
              <div class="flex justify-between text-xs text-base-content/50 mb-1">
                <span>Actual</span>
                <span>{actualKm.toFixed(1)} km</span>
              </div>
              <div class="h-1.5 rounded-full bg-base-300 overflow-hidden">
                <div
                  class="h-full rounded-full transition-all {actualKm >= plannedKm || plannedKm === 0 ? 'bg-success' : 'bg-primary'}"
                  style="width:{actualKm > 0 ? Math.max(plannedKm > 0 ? Math.min(actualKm / plannedKm * 100, 100) : 100, 2) : 0}%"
                ></div>
              </div>
            </div>
          </div>
        {/if}

        <!-- Weekly workouts -->
        {@const weekWorkouts = weekMonthData.plans
          .filter(p => weekDateStrs.includes(p.date) && p.type === 'workout')
          .sort((a, b) => a.date.localeCompare(b.date))}
        <!-- Weekly summary stats -->
        {@const workoutsDone    = weekMonthData.plans.filter(p => weekDateStrs.includes(p.date) && p.type === 'workout' && p.status === 'done').length}
        {@const workoutsPlanned = weekMonthData.plans.filter(p => weekDateStrs.includes(p.date) && p.type === 'workout').length}
        {#if workoutsPlanned > 0 || actualKm > 0}
          <div class="mt-4 grid grid-cols-3 gap-2">
            <div class="bg-base-200 rounded-xl p-3 text-center">
              <p class="text-xl font-bold">{actualKm.toFixed(1)}</p>
              <p class="text-xs text-base-content/40 mt-0.5">km run</p>
            </div>
            <div class="bg-base-200 rounded-xl p-3 text-center">
              <p class="text-xl font-bold">{workoutsDone}<span class="text-base-content/30 text-sm font-normal">/{workoutsPlanned}</span></p>
              <p class="text-xs text-base-content/40 mt-0.5">workouts</p>
            </div>
            <div class="bg-base-200 rounded-xl p-3 text-center">
              <p class="text-xl font-bold">{weekDateStrs.filter(d => weekMonthData.plans.some(p => p.date === d && p.type === 'rest')).length}</p>
              <p class="text-xs text-base-content/40 mt-0.5">rest days</p>
            </div>
          </div>
        {/if}

        {#if weekWorkouts.length > 0}
          <div class="mt-6 space-y-3">
            <div class="flex items-center gap-1.5 text-xs font-semibold text-base-content/50 uppercase tracking-wide">
              {@render activityIcon('workout', true, 'h-3.5 w-3.5')}
              Workouts
            </div>
            {#each weekWorkouts as plan}
              {@const colonIdx  = (plan.notes ?? '').indexOf(':')}
              {@const title     = colonIdx !== -1 ? plan.notes!.slice(0, colonIdx).trim() : 'Workout'}
              {@const exStr     = colonIdx !== -1 ? plan.notes!.slice(colonIdx + 1) : plan.notes ?? ''}
              {@const exercises = exStr.split(',').map(s => s.trim()).filter(Boolean)}
              <button class="rounded-xl bg-base-200 overflow-hidden w-full text-left hover:bg-base-300 transition-colors" onclick={() => goto(`/workout/${plan.date}`)}>
                <div class="flex items-center justify-between px-3 py-2.5">
                  <span class="text-xs font-semibold">{new Date(plan.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  <div class="flex items-center gap-2">
                    <span class="text-xs text-base-content/40">{title}</span>
                    {#if plan.status === 'done'}
                      <span class="text-success text-xs leading-none">✓</span>
                    {/if}
                  </div>
                </div>
                {#if exercises.length > 0}
                  <div class="border-t border-base-300 px-3 py-2 space-y-1">
                    {#each exercises as ex}
                      {@const m      = ex.match(/^(.+?)\s+(\d+[×x]\d+\w*)$/i)}
                      {@const name   = m ? m[1].trim() : ex}
                      {@const scheme = m ? m[2] : null}
                      <div class="flex items-center justify-between">
                        <span class="text-xs text-base-content/60 capitalize">{name}</span>
                        {#if scheme}
                          <span class="text-xs text-base-content/30 tabular-nums">{scheme}</span>
                        {/if}
                      </div>
                    {/each}
                  </div>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      {/await}
    {/if}
  {/await}
</div>

<!-- Generated plan — full screen -->
{#if generatedPlan}
  {@const allDays = buildWeekDays(currentWeekStart).map(d => {
    const date    = toISO(d);
    const isRun   = generatedPlan.runDates.includes(date);
    const workout = generatedPlan.days.find(x => x.date === date);
    const isPast  = d < new Date(new Date().toDateString());
    return { date, isRun, workout: workout ?? null, isPast };
  })}
  <div class="fixed inset-0 z-50 bg-base-100 overflow-y-auto">
    <div class="max-w-lg mx-auto px-4 pt-5 pb-36">

      <!-- Header -->
      <div class="flex items-center justify-between mb-1">
        <div>
          <h2 class="font-bold text-xl">Week Plan</h2>
          {#if generatedPlan.summary}
            <p class="text-sm text-base-content/50 mt-0.5">{generatedPlan.summary}</p>
          {/if}
        </div>
        <button class="btn btn-ghost btn-sm btn-circle" onclick={() => generatedPlan = null}>✕</button>
      </div>

      <!-- Days -->
      <div class="mt-5 space-y-3">
        {#each allDays as day}
          {@const isWorkout = !!day.workout}
          {@const label     = day.isPast && !day.isRun && !day.workout ? 'Past'
                            : day.isRun   ? 'Run'
                            : !day.workout ? 'Rest'
                            : null}
          {@const colonIdx    = day.workout ? day.workout.notes.indexOf(':') : -1}
          {@const title       = isWorkout && colonIdx !== -1 ? day.workout!.notes.slice(0, colonIdx).trim() : null}
          {@const exerciseStr = isWorkout ? (colonIdx !== -1 ? day.workout!.notes.slice(colonIdx + 1) : day.workout!.notes) : ''}
          {@const exercises   = isWorkout ? exerciseStr.split(',').map(s => s.trim()).filter(Boolean) : []}

          <div class="rounded-2xl overflow-hidden {isWorkout ? 'bg-base-200' : 'bg-base-200/40'}">
            <div class="flex items-center gap-3 px-4 py-3">
              {#if day.isRun}
                {@render activityIcon('run', false, 'h-5 w-5 shrink-0')}
              {:else if isWorkout}
                {@render activityIcon('workout', true, 'h-5 w-5 shrink-0')}
              {:else}
                {@render activityIcon('rest', false, 'h-5 w-5 shrink-0')}
              {/if}
              <div class="flex-1 min-w-0">
                <span class="text-xs font-semibold uppercase tracking-wide text-base-content/40">
                  {new Date(day.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}
                </span>
                {#if label}
                  <p class="text-sm text-base-content/40 italic">{label}</p>
                {:else if title}
                  <p class="text-sm font-semibold">{title}</p>
                {/if}
              </div>
            </div>
            {#if exercises.length > 0}
              <ul class="px-4 pb-3 space-y-1 border-t border-base-300">
                {#each exercises as exercise}
                  <li class="text-sm text-base-content/70 flex gap-2 pt-1">
                    <span class="text-base-content/25 select-none shrink-0">–</span>
                    {exercise}
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        {/each}
      </div>
    </div>

    <!-- Sticky footer -->
    <div class="fixed bottom-0 left-0 right-0 bg-base-100/95 backdrop-blur border-t border-base-200 p-4 max-w-lg mx-auto">
      {#if !showRegenInput}
        <div class="flex gap-2">
          <button class="btn btn-primary flex-1" onclick={handleAcceptPlan}>Accept plan</button>
          <button class="btn btn-ghost" onclick={() => showRegenInput = true}>Regenerate</button>
        </div>
      {:else}
        <div class="flex flex-col gap-2">
          <textarea
            class="textarea textarea-bordered textarea-sm w-full"
            placeholder="Notes for regeneration (optional)…"
            rows="2"
            bind:value={regenNotes}
          ></textarea>
          <div class="flex gap-2">
            <button class="btn btn-outline flex-1" onclick={handleRegenPlan} disabled={planLoading}>
              {#if planLoading}<span class="loading loading-spinner loading-xs"></span>{/if}
              Regenerate
            </button>
            <button class="btn btn-ghost" onclick={() => { showRegenInput = false; regenNotes = ''; }}>Cancel</button>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<!-- Confirm overwrite plan dialog -->
<dialog bind:this={confirmPlanEl} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box">
    <h3 class="font-bold text-lg mb-2">Replace existing plan?</h3>
    <p class="text-base-content/60 text-sm">
      {generatedPlan?.existingDates.length ?? 0} day{(generatedPlan?.existingDates.length ?? 0) === 1 ? '' : 's'} already {(generatedPlan?.existingDates.length ?? 0) === 1 ? 'has' : 'have'} a plan.
      Accepting will remove the old plan and replace it with the new one.
    </p>
    <div class="modal-action">
      <button class="btn btn-ghost" onclick={() => confirmPlanEl?.close()}>Cancel</button>
      <button class="btn btn-primary" onclick={doAcceptPlan}>Replace &amp; accept</button>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>

{#snippet activityIcon(type: string, solid: boolean, cls: string)}
  {@const color = solid ? (typeColors[type] ?? '#9ca3af') : '#9ca3af'}
  {@const opacity = solid ? '1' : '0.3'}
  {#if type === 'run'}
    <svg class={cls} style="color:{color};opacity:{opacity}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 416 512">
      <path fill="currentColor" d="M272 96c26.51 0 48-21.49 48-48S298.51 0 272 0s-48 21.49-48 48s21.49 48 48 48M113.69 317.47l-14.8 34.52H32c-17.67 0-32 14.33-32 32s14.33 32 32 32h77.45c19.25 0 36.58-11.44 44.11-29.09l8.79-20.52l-10.67-6.3c-17.32-10.23-30.06-25.37-37.99-42.61M384 223.99h-44.03l-26.06-53.25c-12.5-25.55-35.45-44.23-61.78-50.94l-71.08-21.14c-28.3-6.8-57.77-.55-80.84 17.14l-39.67 30.41c-14.03 10.75-16.69 30.83-5.92 44.86s30.84 16.66 44.86 5.92l39.69-30.41c7.67-5.89 17.44-8 25.27-6.14l14.7 4.37l-37.46 87.39c-12.62 29.48-1.31 64.01 26.3 80.31l84.98 50.17l-27.47 87.73c-5.28 16.86 4.11 34.81 20.97 40.09c3.19 1 6.41 1.48 9.58 1.48c13.61 0 26.23-8.77 30.52-22.45l31.64-101.06c5.91-20.77-2.89-43.08-21.64-54.39l-61.24-36.14l31.31-78.28l20.27 41.43c8 16.34 24.92 26.89 43.11 26.89H384c17.67 0 32-14.33 32-32s-14.33-31.99-32-31.99"/>
    </svg>
  {:else if type === 'workout'}
    <svg class={cls} style="color:{color};opacity:{opacity}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
      <path fill="currentColor" fill-rule="evenodd" d="M10.893 13.776c-.015.03-.064.14-.07.394a410 410 0 0 0-.096 10.357c.004 4.486.054 7.52.096 9.303c.006.253.055.364.07.394c.012.024.023.04.06.066c.117.08.448.21 1.115.21c.666 0 .997-.13 1.113-.21a.15.15 0 0 0 .06-.066c.016-.03.065-.14.07-.394c.045-1.852.097-5.053.097-9.83s-.052-7.978-.096-9.83c-.006-.253-.055-.364-.07-.394a.15.15 0 0 0-.06-.066c-.117-.08-.448-.21-1.114-.21s-.998.13-1.114.21a.15.15 0 0 0-.061.066M6.816 33.554l.008.372c.038 1.56.682 2.849 1.866 3.661c1.066.732 2.333.913 3.378.913s2.311-.181 3.377-.913c1.184-.812 1.828-2.1 1.865-3.662c.028-1.162.059-2.835.079-5.073a1263 1263 0 0 0 13.223-.01c.02 2.243.05 3.92.078 5.084c.037 1.56.682 2.849 1.865 3.661c1.066.732 2.333.913 3.378.913s2.311-.181 3.377-.913c1.184-.812 1.828-2.1 1.866-3.662l.008-.371q.472.082.953.082c1.215 0 2.418-.388 3.343-1.24c.939-.866 1.436-2.069 1.467-3.387c.029-1.185.054-2.836.054-5.01c0-2.172-.025-3.824-.054-5.009c-.032-1.318-.528-2.52-1.467-3.387c-.925-.852-2.128-1.24-3.343-1.24q-.482 0-.953.082l-.008-.37c-.038-1.561-.682-2.85-1.866-3.662c-1.066-.732-2.333-.913-3.377-.913c-1.045 0-2.312.181-3.378.913c-1.183.812-1.828 2.1-1.865 3.661a337 337 0 0 0-.078 5.085a1194 1194 0 0 0-13.224-.01a328 328 0 0 0-.078-5.075c-.037-1.56-.681-2.849-1.865-3.661c-1.066-.732-2.333-.913-3.378-.913s-2.311.181-3.377.913c-1.184.812-1.828 2.1-1.866 3.661l-.008.371a5.5 5.5 0 0 0-.952-.082c-1.216 0-2.418.388-3.343 1.24c-.94.866-1.436 2.07-1.468 3.387A209 209 0 0 0 1 24c0 2.173.025 3.824.053 5.009c.032 1.318.529 2.521 1.468 3.387c.925.852 2.127 1.24 3.343 1.24q.481 0 .952-.082m-.09-10.08v1.051a199 199 0 0 1-.05 4.387c-.01.355-.123.49-.18.543c-.074.067-.256.181-.632.181c-.377 0-.56-.114-.632-.181c-.058-.054-.171-.188-.18-.543C5.024 27.762 5 26.142 5 24s.024-3.762.052-4.913c.009-.354.122-.489.18-.543c.073-.067.255-.18.632-.18c.376 0 .558.113.631.18c.058.054.172.189.18.543c.026 1.055.048 2.503.052 4.388M41.275 24v.26c.001 2.014.025 3.548.052 4.652c.008.355.121.49.18.543c.072.067.255.181.631.181s.559-.114.632-.181c.058-.054.171-.188.18-.543c.027-1.15.052-2.77.052-4.912s-.025-3.762-.052-4.913c-.009-.354-.122-.489-.18-.543c-.073-.067-.256-.18-.632-.18s-.559.113-.631.18c-.059.054-.172.189-.18.543c-.027 1.104-.05 2.638-.052 4.653zm-4.097-9.83c.043 1.818.095 4.936.097 9.569v.522a415 415 0 0 1-.097 9.569c-.006.253-.054.364-.07.394a.16.16 0 0 1-.06.066c-.117.08-.447.21-1.114.21s-.998-.13-1.114-.21a.16.16 0 0 1-.06-.066c-.016-.03-.064-.14-.07-.394a419 419 0 0 1-.097-9.83c0-4.777.052-7.978.097-9.83c.006-.253.054-.364.07-.394a.16.16 0 0 1 .06-.066c.116-.08.447-.21 1.114-.21s.997.13 1.113.21a.16.16 0 0 1 .061.066c.016.03.064.14.07.394" clip-rule="evenodd"/>
    </svg>
  {:else}
    <svg class={cls} style="color:{color};opacity:{opacity}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
      <path fill="currentColor" d="M432 230.7a79.4 79.4 0 0 0-32-6.7H112a79.5 79.5 0 0 0-32 6.69A80.09 80.09 0 0 0 32 304v112a16 16 0 0 0 32 0v-8a8.1 8.1 0 0 1 8-8h368a8.1 8.1 0 0 1 8 8v8a16 16 0 0 0 32 0V304a80.09 80.09 0 0 0-48-73.3M376 80H136a56 56 0 0 0-56 56v72a4 4 0 0 0 5.11 3.84A95.5 95.5 0 0 1 112 208h4.23a4 4 0 0 0 4-3.55A32 32 0 0 1 152 176h56a32 32 0 0 1 31.8 28.45a4 4 0 0 0 4 3.55h24.46a4 4 0 0 0 4-3.55A32 32 0 0 1 304 176h56a32 32 0 0 1 31.8 28.45a4 4 0 0 0 4 3.55h4.2a95.5 95.5 0 0 1 26.89 3.85A4 4 0 0 0 432 208v-72a56 56 0 0 0-56-56"/>
    </svg>
  {/if}
{/snippet}

<!-- Day drawer -->
{#if selectedDate}
  <div class="fixed inset-0 z-50" onclick={closePanel}>
    <div class="absolute inset-0 bg-black/40"></div>
    <div class="absolute bottom-0 left-0 right-0 bg-base-100 rounded-t-2xl shadow-2xl max-w-lg mx-auto" onclick={(e) => e.stopPropagation()}>
      <!-- Handle -->
      <div class="flex justify-center pt-3 pb-1">
        <div class="w-10 h-1 rounded-full bg-base-300"></div>
      </div>

      <div class="px-5 pb-8 pt-2">
        <div class="flex items-center justify-between mb-5">
          <span class="font-semibold text-base">
            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </span>
          <div class="flex items-center gap-1">
            <button
              class="btn btn-ghost btn-sm gap-1 {showSwapList ? 'btn-active' : ''}"
              onclick={() => showSwapList = !showSwapList}
            >⇄ Switch</button>
            <button class="btn btn-ghost btn-sm btn-circle" onclick={closePanel}>✕</button>
          </div>
        </div>

        {#if showSwapList}
          {@const siblings = siblingWeekDates(selectedDate)}
          {@const allWeekMonths = [...new Set([selectedDate, ...siblings].map(d => d.slice(0, 7)))]}
          {#await Promise.all(allWeekMonths.map(m => getMonthData(m)))}
            <div class="mb-5 animate-pulse h-20 rounded-xl bg-base-200"></div>
          {:then results}
            {@const allPlans = results.flatMap(r => r.plans)}
            {@const currentPlan = allPlans.find(p => p.date === selectedDate)}
            <div class="mb-5 border border-base-300 rounded-xl overflow-hidden">
              <div class="px-4 py-2.5 flex items-center justify-between border-b border-base-300 bg-base-200/50">
                <span class="text-xs text-base-content/40">Moving</span>
                <span class="text-sm font-medium capitalize">
                  {currentPlan ? planLabel(currentPlan.type, currentPlan.notes) : 'Empty day'}
                </span>
              </div>
              {#each siblings as sib}
                {@const sibPlan = allPlans.find(p => p.date === sib)}
                <button
                  class="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-base-200 transition-colors border-b border-base-300 last:border-0"
                  onclick={async () => {
                    await swapDays({ dateA: selectedDate!, dateB: sib });
                    showSwapList = false;
                  }}
                >
                  <span class="text-base-content/50">
                    {new Date(sib + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })}
                  </span>
                  <span class="capitalize font-medium">
                    {sibPlan ? planLabel(sibPlan.type, sibPlan.notes) : '—'}
                  </span>
                </button>
              {/each}
            </div>
          {/await}
        {/if}

        {#await getDayDetail(selectedDate)}
          <div class="flex justify-center py-6"><span class="loading loading-spinner loading-sm"></span></div>
        {:then dayData}
          {@const isEmpty = dayData.plans.length === 0 && dayData.sessions.length === 0}
          {#if isEmpty}
            {#if addingRun}
              <div class="space-y-3 pb-2">
                <p class="text-sm text-base-content/60">How far are you planning to run?</p>
                <div class="flex items-center gap-2">
                  <input
                    type="number" inputmode="decimal" step="0.5" min="0" placeholder="0"
                    class="input input-bordered flex-1 text-center"
                    bind:value={runDistance}
                  />
                  <span class="text-sm text-base-content/50">km</span>
                </div>
                <div class="flex gap-2">
                  <button
                    class="btn btn-primary flex-1"
                    onclick={async () => {
                      await addPlan({ date: selectedDate!, type: 'run', notes: runDistance ? String(parseFloat(runDistance)) : undefined });
                      closePanel();
                    }}
                  >Save</button>
                  <button class="btn btn-ghost" onclick={() => { addingRun = false; runDistance = ''; }}>Cancel</button>
                </div>
              </div>
            {:else}
              <div class="bg-base-200 rounded-2xl overflow-hidden">
                <button
                  class="flex items-center gap-3 w-full px-4 py-3 hover:bg-base-300 transition-colors border-b border-base-300"
                  onclick={() => { addingRun = true; }}
                >
                  {@render activityIcon('run', true, 'h-5 w-5')}
                  <span class="text-sm font-medium">Run</span>
                </button>
                <button
                  class="flex items-center gap-3 w-full px-4 py-3 hover:bg-base-300 transition-colors border-b border-base-300"
                  onclick={() => goto(`/workout/${selectedDate}`)}
                >
                  {@render activityIcon('workout', true, 'h-5 w-5')}
                  <span class="text-sm font-medium">Workout</span>
                </button>
                <button
                  class="flex items-center gap-3 w-full px-4 py-3 hover:bg-base-300 transition-colors"
                  onclick={async () => { await addPlan({ date: selectedDate!, type: 'rest' }); closePanel(); }}
                >
                  {@render activityIcon('rest', true, 'h-5 w-5')}
                  <span class="text-sm font-medium">Rest</span>
                </button>
              </div>
            {/if}
          {:else}
            {@const isRunDay     = dayData.plans.some(p => p.type === 'run') || dayData.sessions.some(s => s.type === 'run')}
            {@const hasWorkout   = dayData.plans.some(p => p.type === 'workout')}
            <div class="bg-base-200 rounded-2xl overflow-hidden">
              {#each dayData.sessions as session, i}
                {@const isLast = i === dayData.sessions.length - 1 && dayData.plans.filter(p => !dayData.sessions.some(s => s.type === p.type)).length === 0}
                <div class="flex items-center gap-3 px-4 py-3 {isLast ? '' : 'border-b border-base-300'}">
                  {@render activityIcon(session.type, true, 'h-5 w-5 shrink-0')}
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium capitalize">{session.type}</div>
                    {#if session.notes}<div class="text-xs text-base-content/40 truncate">{session.notes}</div>{/if}
                  </div>
                </div>
              {/each}

              {#each dayData.plans.filter(p => !dayData.sessions.some(s => s.type === p.type)) as plan, i}
                {@const colonIdx  = (plan.notes ?? '').indexOf(':')}
                {@const title     = plan.type === 'workout' && colonIdx !== -1 ? plan.notes!.slice(0, colonIdx).trim() : null}
                {@const exStr     = plan.type === 'workout' ? (colonIdx !== -1 ? plan.notes!.slice(colonIdx + 1) : plan.notes ?? '') : ''}
                {@const exercises = plan.type === 'workout' ? exStr.split(',').map(s => s.trim()).filter(Boolean) : []}
                {@const allPlans  = dayData.plans.filter(p => !dayData.sessions.some(s => s.type === p.type))}
                {@const isLast    = i === allPlans.length - 1}

                <div class="{isLast ? '' : 'border-b border-base-300'}">
                  <div class="flex items-center gap-3 px-4 py-3">
                    {@render activityIcon(plan.type, false, 'h-5 w-5 shrink-0')}
                    <div class="flex-1 min-w-0">
                      {#if plan.type === 'workout'}
                        <div class="text-sm font-medium">{title ?? 'Workout'}</div>
                      {:else}
                        <div class="text-sm font-medium capitalize">{plan.type}</div>
                        {#if plan.type === 'run' && plan.notes}
                          <div class="text-xs text-base-content/40">{plan.notes} km</div>
                        {/if}
                      {/if}
                    </div>
                    {#if plan.type === 'workout'}
                      <button class="btn btn-primary btn-xs shrink-0" onclick={() => goto(`/workout/${plan.date}`)}>Start</button>
                    {/if}
                    <button
                      class="text-base-content/25 hover:text-error transition-colors text-xs ml-1 shrink-0"
                      onclick={() => handleDeletePlan(plan.id, plan.date)}
                    >✕</button>
                  </div>
                  {#if exercises.length > 0}
                    <ul class="pb-3 px-4 space-y-0.5">
                      {#each exercises as ex}
                        <li class="text-xs text-base-content/50 flex gap-1.5 items-start">
                          <span class="text-base-content/25 select-none mt-px">–</span>{ex}
                        </li>
                      {/each}
                    </ul>
                  {/if}
                </div>
              {/each}
            </div>

            <!-- Add workout to run day -->
            {#if isRunDay && !hasWorkout}
              {#if dayWorkoutPreview}
                {@const colonIdx  = dayWorkoutPreview.indexOf(':')}
                {@const title     = colonIdx !== -1 ? dayWorkoutPreview.slice(0, colonIdx).trim() : null}
                {@const exStr     = colonIdx !== -1 ? dayWorkoutPreview.slice(colonIdx + 1) : dayWorkoutPreview}
                <div class="mt-3 bg-base-200 rounded-2xl p-4 space-y-3">
                  {#if title}<p class="text-sm font-semibold">{title}</p>{/if}
                  <ul class="space-y-0.5">
                    {#each exStr.split(',').map(s => s.trim()).filter(Boolean) as ex}
                      <li class="text-xs text-base-content/50 flex gap-1.5">
                        <span class="text-base-content/25 select-none">–</span>{ex}
                      </li>
                    {/each}
                  </ul>
                  <div class="flex gap-2 pt-1">
                    <button
                      class="btn btn-primary btn-sm flex-1"
                      onclick={async () => {
                        await acceptDayWorkout({ date: selectedDate!, notes: dayWorkoutPreview! });
                        closePanel();
                      }}
                    >Add to plan</button>
                    <button class="btn btn-ghost btn-sm" onclick={() => dayWorkoutPreview = null}>Discard</button>
                  </div>
                </div>
              {:else}
                <div class="mt-3">
                  {#if dayWorkoutError}
                    <p class="text-xs text-error mb-2">{dayWorkoutError}</p>
                  {/if}
                  <button
                    class="btn btn-outline btn-sm w-full"
                    disabled={dayWorkoutLoading}
                    onclick={async () => {
                      dayWorkoutLoading = true;
                      dayWorkoutError   = null;
                      try {
                        const result = await generateDayWorkout(selectedDate!);
                        dayWorkoutPreview = result.notes;
                      } catch (e) {
                        dayWorkoutError = e instanceof Error ? e.message : 'Failed to generate';
                      } finally {
                        dayWorkoutLoading = false;
                      }
                    }}
                  >
                    {#if dayWorkoutLoading}
                      <span class="loading loading-spinner loading-xs"></span>
                      Generating…
                    {:else}
                      + Add workout
                    {/if}
                  </button>
                </div>
              {/if}
            {/if}
          {/if}
        {/await}
      </div>
    </div>
  </div>
{/if}
