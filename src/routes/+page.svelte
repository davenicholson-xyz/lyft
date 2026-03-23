<script lang="ts">
  import { getMonthData, getDayDetail, addPlan, deletePlan } from './calendar.remote';
  import { goto } from '$app/navigation';
  import { getStravaStatus, syncStrava } from './strava.remote';
  import { generateWeekPlan, acceptWeekPlan } from './planning.remote';

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
  let planLoading      = $state(false);
  let planError        = $state<string | null>(null);
  let generatedPlan    = $state<GeneratedPlan | null>(null);
  let regenNotes       = $state('');
  let showRegenInput   = $state(false);

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
    selectedDate = null;
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

  async function handleAcceptPlan() {
    if (!generatedPlan) return;
    await acceptWeekPlan({ days: generatedPlan.days as { date: string; type: 'run' | 'rest'; notes: string }[] });
    generatedPlan = null;
  }

  function dayName(dateStr: string): string {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short' });
  }

  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

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
          <button class="btn btn-sm btn-ghost gap-1" onclick={handleSync} disabled={syncing}>
            {#if syncing}
              <span class="loading loading-spinner loading-xs"></span>
            {:else}
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
            {/if}
            Strava
          </button>
        {:else}
          <a href="/strava/connect" class="btn btn-sm btn-ghost text-[#FC4C02]">Connect Strava</a>
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
                <div class="flex gap-0.5 mt-1 h-2">
                  {#each dots as dot}
                    {#if dot.solid}
                      <span class="w-1.5 h-1.5 rounded-full" style="background:{typeColor(dot.type)}"></span>
                    {:else}
                      <span class="w-1.5 h-1.5 rounded-full bg-transparent border-2" style="border-color:{typeColor(dot.type)}"></span>
                    {/if}
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
      {#await getMonthData(weekYearMonth)}
        <div class="flex justify-center py-12"><span class="loading loading-spinner loading-md"></span></div>
      {:then weekMonthData}
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
              <div class="flex gap-0.5 mt-1 h-2">
                {#each dots as dot}
                  {#if dot.solid}
                    <span class="w-1.5 h-1.5 rounded-full" style="background:{typeColor(dot.type)}"></span>
                  {:else}
                    <span class="w-1.5 h-1.5 rounded-full bg-transparent border-2" style="border-color:{typeColor(dot.type)}"></span>
                  {/if}
                {/each}
              </div>
            </button>
          {/each}
        </div>

        <!-- Generate plan -->
        <div class="mt-4 flex items-center gap-3">
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
          {#if planError}
            <span class="text-xs text-error">{planError}</span>
          {/if}
        </div>
      {/await}
    {/if}
  {/await}
</div>

<!-- Generated plan — full screen -->
{#if generatedPlan}
  {@const allDays = [
    ...generatedPlan.runDates.map(date => ({ date, isRun: true, notes: '' })),
    ...generatedPlan.days.map(d => ({ date: d.date, isRun: false, notes: d.notes })),
  ].sort((a, b) => a.date.localeCompare(b.date))}
  <div class="fixed inset-0 z-50 bg-base-100 overflow-y-auto">
    <div class="max-w-lg mx-auto p-4 pb-32">

      <!-- Header -->
      <div class="flex items-center justify-between mb-1 pt-2">
        <h2 class="font-semibold text-lg">Week Plan</h2>
        <button class="btn btn-ghost btn-sm btn-circle" onclick={() => generatedPlan = null}>✕</button>
      </div>

      <!-- Days -->
      <div class="space-y-5">
        {#each allDays as day}
          <div class="{day.isRun ? 'opacity-40' : ''}">
            <div class="text-xs font-semibold uppercase tracking-wide text-base-content/50 mb-1">
              {dayName(day.date)} · {day.date}
            </div>
            {#if day.isRun}
              <p class="text-sm italic">Running</p>
            {:else}
              {@const colonIdx = day.notes.indexOf(':')}
              {@const title = colonIdx !== -1 ? day.notes.slice(0, colonIdx).trim() : null}
              {@const exerciseStr = colonIdx !== -1 ? day.notes.slice(colonIdx + 1) : day.notes}
              {#if title}
                <p class="text-sm font-semibold mb-1">{title}</p>
              {/if}
              <ul class="space-y-1">
                {#each exerciseStr.split(',').map(s => s.trim()).filter(Boolean) as exercise}
                  <li class="text-sm flex gap-2">
                    <span class="text-base-content/30 select-none">–</span>
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
    <div class="fixed bottom-0 left-0 right-0 bg-base-100 border-t border-base-200 p-4 max-w-lg mx-auto">
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
          <button class="btn btn-ghost btn-sm btn-circle" onclick={closePanel}>✕</button>
        </div>

        {#await getDayDetail(selectedDate)}
          <div class="flex justify-center py-6"><span class="loading loading-spinner loading-sm"></span></div>
        {:then dayData}
          {@const isEmpty = dayData.plans.length === 0 && dayData.sessions.length === 0}
          {#if isEmpty}
            <div class="flex gap-3 pb-2">
              <button
                class="flex-1 flex flex-col items-center gap-2 rounded-xl py-6 bg-base-200 hover:bg-base-300 transition-colors"
                onclick={async () => { await addPlan({ date: selectedDate!, type: 'run' }); closePanel(); }}
              >
                <span class="w-4 h-4 rounded-full" style="background:#f87171"></span>
                <span class="font-medium">Run</span>
              </button>
              <button
                class="flex-1 flex flex-col items-center gap-2 rounded-xl py-6 bg-base-200 hover:bg-base-300 transition-colors"
                onclick={async () => { await addPlan({ date: selectedDate!, type: 'rest' }); closePanel(); }}
              >
                <span class="w-4 h-4 rounded-full" style="background:#9ca3af"></span>
                <span class="font-medium">Rest</span>
              </button>
            </div>
          {:else}
            <div class="space-y-4">
              {#each dayData.sessions as session}
                <div class="flex items-center gap-3">
                  <span class="w-2 h-2 rounded-full shrink-0" style="background:{typeColor(session.type)}"></span>
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-semibold capitalize">{session.type}</div>
                    {#if session.notes}<div class="text-xs text-base-content/50 truncate">{session.notes}</div>{/if}
                  </div>
                </div>
              {/each}

              {#each dayData.plans.filter(p => !dayData.sessions.some(s => s.type === p.type)) as plan}
                {@const colonIdx   = (plan.notes ?? '').indexOf(':')}
                {@const title      = plan.type === 'workout' && colonIdx !== -1 ? plan.notes!.slice(0, colonIdx).trim() : null}
                {@const exStr      = plan.type === 'workout' ? (colonIdx !== -1 ? plan.notes!.slice(colonIdx + 1) : plan.notes ?? '') : ''}
                {@const exercises  = plan.type === 'workout' ? exStr.split(',').map(s => s.trim()).filter(Boolean) : []}

                <div>
                  <div class="flex items-center gap-3 mb-2">
                    <span class="w-2 h-2 rounded-full shrink-0" style="background:{typeColor(plan.type)}"></span>
                    <div class="flex-1 min-w-0">
                      {#if plan.type === 'workout'}
                        <div class="text-sm font-semibold">{title ?? 'Workout'}</div>
                      {:else}
                        <div class="text-sm font-semibold capitalize">{plan.type}</div>
                        {#if plan.notes}<div class="text-xs text-base-content/50">{plan.notes}</div>{/if}
                      {/if}
                    </div>
                    {#if plan.type === 'workout'}
                      <button
                        class="btn btn-primary btn-sm shrink-0"
                        onclick={() => goto(`/workout/${plan.date}`)}
                      >Start</button>
                    {/if}
                    <button
                      class="btn btn-ghost btn-xs text-error shrink-0"
                      onclick={() => handleDeletePlan(plan.id, plan.date)}
                    >✕</button>
                  </div>

                  {#if exercises.length > 0}
                    <ul class="ml-5 space-y-1">
                      {#each exercises as ex}
                        <li class="text-sm text-base-content/70 flex gap-2">
                          <span class="text-base-content/30 select-none">–</span>{ex}
                        </li>
                      {/each}
                    </ul>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        {/await}
      </div>
    </div>
  </div>
{/if}
