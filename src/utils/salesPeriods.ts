// Periods for the Sales page, in India time (IST, UTC+05:30).
// Quarters and years follow the Indian financial year (April to March).

export const SALES_DEFAULT_DAYS = 60

export type SalesPeriodKey =
  | '60d'
  | 'this_quarter'
  | 'last_quarter'
  | '6m'
  | 'this_fy'
  | 'last_fy'
  | 'custom'

export const SALES_PERIOD_OPTIONS: { key: SalesPeriodKey; label: string }[] = [
  { key: '60d', label: `Last ${SALES_DEFAULT_DAYS} days` },
  { key: 'this_quarter', label: 'This quarter' },
  { key: 'last_quarter', label: 'Last quarter' },
  { key: '6m', label: 'Last 6 months' },
  { key: 'this_fy', label: 'This financial year' },
  { key: 'last_fy', label: 'Last financial year' },
  { key: 'custom', label: 'Custom dates' }
]

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Today's date in India as { y, m (1-12), d } */
function todayIST(now = new Date()) {
  const [y, m, d] = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).split('-').map(Number)
  return { y, m, d }
}

/** Midnight in India at the start of y-m-d, as an ISO timestamp. Month may overflow (handled). */
function istMidnight(y: number, m: number, d = 1) {
  const t = new Date(Date.UTC(y, m - 1, d))
  const ymd = t.toISOString().slice(0, 10)
  return `${ymd}T00:00:00+05:30`
}

function monthLabel(y: number, m: number) {
  const t = new Date(Date.UTC(y, m - 1, 1))
  return `${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}`
}

/**
 * The time range for a period. `to` is exclusive (null = up to now).
 * For 'custom', from/to are dates (YYYY-MM-DD), both days included.
 */
export function salesPeriodRange(
  key: SalesPeriodKey,
  customFrom?: string,
  customTo?: string,
  now = new Date()
): { from: string; to: string | null; label: string } {
  const { y, m, d } = todayIST(now)
  // Financial-year quarter containing this month: Apr, Jul, Oct, Jan
  const qStartMonth = m >= 4 ? 4 + 3 * Math.floor((m - 4) / 3) : 1
  const fyStartYear = m >= 4 ? y : y - 1

  switch (key) {
    case '60d': {
      const from = new Date(now.getTime() - SALES_DEFAULT_DAYS * 24 * 60 * 60 * 1000).toISOString()
      return { from, to: null, label: `Last ${SALES_DEFAULT_DAYS} days` }
    }
    case 'this_quarter':
      return { from: istMidnight(y, qStartMonth), to: null, label: `This quarter (${monthLabel(y, qStartMonth)} to today)` }
    case 'last_quarter':
      return {
        from: istMidnight(y, qStartMonth - 3),
        to: istMidnight(y, qStartMonth),
        label: `Last quarter (${monthLabel(y, qStartMonth - 3)} to ${monthLabel(y, qStartMonth - 1)})`
      }
    case '6m': {
      // Same day 6 months ago, or that month's last day (31 Aug -> 28/29 Feb)
      const lastDay = new Date(Date.UTC(y, m - 6, 0)).getUTCDate()
      const day = Math.min(d, lastDay)
      return { from: istMidnight(y, m - 6, day), to: null, label: `Last 6 months (since ${day} ${monthLabel(y, m - 6)})` }
    }
    case 'this_fy':
      return { from: istMidnight(fyStartYear, 4), to: null, label: `This financial year (${fyStartYear}-${String((fyStartYear + 1) % 100).padStart(2, '0')})` }
    case 'last_fy':
      return {
        from: istMidnight(fyStartYear - 1, 4),
        to: istMidnight(fyStartYear, 4),
        label: `Last financial year (${fyStartYear - 1}-${String(fyStartYear % 100).padStart(2, '0')})`
      }
    case 'custom': {
      const ok = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)
      if (!ok(customFrom) || !ok(customTo)) throw new Error('Choose both a start and an end date.')
      if (customFrom! > customTo!) throw new Error('The start date is after the end date.')
      const [ty, tm, td] = customTo!.split('-').map(Number)
      return {
        from: `${customFrom}T00:00:00+05:30`,
        to: istMidnight(ty, tm, td + 1), // end date included
        label: `${customFrom} to ${customTo}`
      }
    }
    default:
      throw new Error('Unknown period.')
  }
}

