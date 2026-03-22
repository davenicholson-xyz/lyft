<script lang="ts">
  import { getMonthData, getDayDetail, addPlan, deletePlan } from './calendar.remote';

  type View = 'month' | 'week';

  const today = new Date();

  let view             = $state<View>('month');
  let currentYear      = $state(today.getFullYear());
  let currentMonth     = $state(today.getMonth()); // 0-indexed
  let currentWeekStart = $state(getMonday(today));  // always a Monday Date
  let selectedDate     = $state<string | null>(null);
  let showAddForm      = $state(false);
  let addType          = $state('weights');
  let addNotes         = $state('');

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
    if (type === 'weights')    return '#a855f7';
    if (type === 'run')        return '#f87171';
    if (type === 'kettlebell') return '#2dd4bf';
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
    showAddForm = false;
    addNotes = '';
  }

  function closePanel() {
    selectedDate = null;
    showAddForm = false;
    addNotes = '';
  }

  async function handleAddPlan() {
    if (!selectedDate) return;
    await addPlan({ date: selectedDate, type: addType, notes: addNotes || undefined });
    showAddForm = false;
    addNotes = '';
  }

  async function handleDeletePlan(id: number, date: string) {
    await deletePlan({ id, date });
  }

  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
</script>

<div class="min-h-screen bg-base-100 text-base-content p-4 pb-0 max-w-lg mx-auto">
  <!-- View toggle -->
  <div class="flex gap-2 mb-4">
    <button
      class="btn btn-sm {view === 'month' ? 'btn-primary' : 'btn-ghost'}"
      onclick={() => view = 'month'}
    >Month</button>
    <button
      class="btn btn-sm {view === 'week' ? 'btn-primary' : 'btn-ghost'}"
      onclick={() => view = 'week'}
    >Week</button>
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
          <span class="font-semibold text-sm">{toISO(currentWeekStart)} – {toISO(weekEnd)}</span>
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
      {/await}
    {/if}
  {/await}
</div>

<!-- Bottom panel -->
{#if selectedDate}
  <div class="fixed bottom-0 left-0 right-0 bg-base-200 rounded-t-2xl max-h-[60vh] overflow-y-auto shadow-xl z-50 max-w-lg mx-auto">
    <div class="p-4">
      <div class="flex items-center justify-between mb-3">
        <h2 class="font-semibold text-base">{selectedDate}</h2>
        <button class="btn btn-ghost btn-sm btn-circle" onclick={closePanel}>✕</button>
      </div>

      {#await getDayDetail(selectedDate)}
        <div class="flex justify-center py-8"><span class="loading loading-spinner loading-md"></span></div>
      {:then dayData}
        <!-- Sessions -->
        {#if dayData.sessions.length > 0}
          <div class="mb-3">
            <div class="text-xs text-base-content/50 uppercase tracking-wide mb-2">Sessions</div>
            {#each dayData.sessions as session}
              <div class="card bg-base-100 mb-2 overflow-hidden">
                <div class="flex">
                  <div class="w-1 shrink-0" style="background:{typeColor(session.type)}"></div>
                  <div class="p-3">
                    <div class="font-medium capitalize">{session.type}</div>
                    {#if session.notes}<div class="text-sm text-base-content/70 mt-0.5">{session.notes}</div>{/if}
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}

        <!-- Plans -->
        {#if dayData.plans.length > 0}
          <div class="mb-3">
            <div class="text-xs text-base-content/50 uppercase tracking-wide mb-2">Plans</div>
            {#each dayData.plans as plan}
              <div class="card bg-base-100 mb-2 overflow-hidden">
                <div class="flex items-center">
                  <div class="w-1 shrink-0 self-stretch" style="background:{typeColor(plan.type)}"></div>
                  <div class="p-3 flex-1">
                    <div class="font-medium capitalize">{plan.type}
                      <span class="badge badge-sm ml-1 {plan.status === 'done' ? 'badge-success' : 'badge-ghost'}">{plan.status}</span>
                    </div>
                    {#if plan.notes}<div class="text-sm text-base-content/70 mt-0.5">{plan.notes}</div>{/if}
                  </div>
                  <button
                    class="btn btn-ghost btn-sm btn-circle mr-2 text-error"
                    onclick={() => handleDeletePlan(plan.id, plan.date)}
                  >✕</button>
                </div>
              </div>
            {/each}
          </div>
        {/if}

        {#if dayData.plans.length === 0 && dayData.sessions.length === 0}
          <p class="text-base-content/50 text-sm py-2">Nothing planned</p>
        {/if}

        <!-- Add form -->
        {#if !showAddForm}
          <button class="btn btn-sm btn-outline w-full mt-2" onclick={() => showAddForm = true}>
            + Add plan
          </button>
        {:else}
          <div class="bg-base-100 rounded-xl p-3 mt-2 flex flex-col gap-2">
            <select class="select select-sm select-bordered w-full" bind:value={addType}>
              <option value="weights">Weights</option>
              <option value="run">Run</option>
              <option value="kettlebell">Kettlebell</option>
            </select>
            <input
              class="input input-sm input-bordered w-full"
              placeholder="Notes (optional)"
              bind:value={addNotes}
            />
            <div class="flex gap-2">
              <button class="btn btn-sm btn-primary flex-1" onclick={handleAddPlan}>Save</button>
              <button class="btn btn-sm btn-ghost flex-1" onclick={() => { showAddForm = false; addNotes = ''; }}>Cancel</button>
            </div>
          </div>
        {/if}
      {/await}
    </div>
  </div>
{/if}
