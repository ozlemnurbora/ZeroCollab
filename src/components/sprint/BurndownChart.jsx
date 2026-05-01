import { useMemo } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts'
import { buildSprintBurndownSeries } from '../../utils/sprintBurndown.js'

const axisTick = { fill: 'rgb(163 163 181)', fontSize: 11 }
const gridStroke = 'rgba(148, 163, 184, 0.25)'

function formatSp(n) {
  if (!Number.isFinite(n)) return '0'
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

function BurndownTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel))] px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-[rgb(var(--zc-text))]">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="text-[rgb(var(--zc-muted))]">
          <span style={{ color: p.color }}>{p.name}: </span>
          {typeof p.value === 'number' ? formatSp(p.value) : p.value} SP
        </p>
      ))}
    </div>
  )
}

export function BurndownChart({ activeSprint, sprintTasks, isLoading }) {
  const built = useMemo(
    () => buildSprintBurndownSeries(activeSprint, sprintTasks),
    [activeSprint, sprintTasks],
  )

  const todayLabel = built?.meta?.todayKey
    ? built.chartData.find((d) => d.key === built.meta.todayKey)?.label
    : null

  if (isLoading) {
    return (
      <section className="mb-6 rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.35)] p-5">
        <h3 className="text-lg font-semibold text-[rgb(var(--zc-text))]">
          Burndown Chart
        </h3>
        <p className="mt-3 text-sm text-[rgb(var(--zc-muted2))]">Loading…</p>
      </section>
    )
  }

  if (!activeSprint || !built?.chartData?.length) {
    return (
      <section className="mb-6 rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.35)] p-5">
        <h3 className="text-lg font-semibold text-[rgb(var(--zc-text))]">
          Burndown Chart
        </h3>
        <p className="mt-3 text-sm text-[rgb(var(--zc-muted2))]">
          Sprint dates are missing or invalid.
        </p>
      </section>
    )
  }

  const taskCount = Array.isArray(sprintTasks) ? sprintTasks.length : 0
  if (taskCount === 0) {
    return (
      <section className="mb-6 rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.35)] p-5">
        <h3 className="text-lg font-semibold text-[rgb(var(--zc-text))]">
          Burndown Chart
        </h3>
        <p className="mt-3 text-sm text-[rgb(var(--zc-muted2))]">
          No sprint tasks available for burndown chart.
        </p>
      </section>
    )
  }

  if (built.meta.totalCommitted <= 0) {
    return (
      <section className="mb-6 rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.35)] p-5">
        <h3 className="text-lg font-semibold text-[rgb(var(--zc-text))]">
          Burndown Chart
        </h3>
        <p className="mt-3 text-sm text-[rgb(var(--zc-muted2))]">
          Add story points to sprint tasks to generate burndown chart.
        </p>
      </section>
    )
  }

  const { chartData, meta } = built

  return (
    <section className="mb-6 rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.35)] p-5">
      <h3 className="text-lg font-semibold text-[rgb(var(--zc-text))]">
        Burndown Chart
      </h3>
      <div className="mt-3 flex flex-wrap gap-3 text-sm text-[rgb(var(--zc-muted))]">
        <span>
          Total committed:{' '}
          <span className="font-medium text-[rgb(var(--zc-text))]">
            {meta.totalCommitted} SP
          </span>
        </span>
        <span>
          Remaining actual:{' '}
          <span className="font-medium text-[rgb(var(--zc-text))]">
            {formatSp(meta.remainingActual)} SP
          </span>
        </span>
        <span>
          Completed:{' '}
          <span className="font-medium text-[rgb(var(--zc-text))]">
            {meta.completedSp} SP
          </span>
        </span>
      </div>
      <div className="mt-4 h-[220px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
          >
            <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tick={axisTick}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={axisTick}
              width={36}
              allowDecimals
              domain={[0, 'auto']}
            />
            <Tooltip content={<BurndownTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 12, color: 'rgb(163 163 181)' }}
            />
            <Line
              type="monotone"
              dataKey="ideal"
              name="Ideal"
              stroke="#a5b4fc"
              strokeWidth={2}
              dot={{ r: 3, fill: '#a5b4fc' }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="actual"
              name="Actual"
              stroke="#34d399"
              strokeWidth={2}
              dot={{ r: 3, fill: '#34d399' }}
              activeDot={{ r: 5 }}
            />
            {todayLabel ? (
              <ReferenceLine
                x={todayLabel}
                stroke="#fbbf24"
                strokeDasharray="4 4"
                label={{
                  value: 'Today',
                  position: 'top',
                  fill: '#fbbf24',
                  fontSize: 11,
                }}
              />
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
