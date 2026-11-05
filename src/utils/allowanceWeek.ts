// Weeks for the weekly allowance: Monday to Sunday, India time (IST, UTC+05:30).

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** A date (YYYY-MM-DD) as a UTC date object at midnight, for day arithmetic only. */
function d(ymd: string) {
  const [y, m, day] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day))
}
const ymd = (t: Date) => t.toISOString().slice(0, 10)

/** Today's date in India (YYYY-MM-DD). */
export function todayIST(now = new Date()) {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

/** The India date (YYYY-MM-DD) of a timestamp. */
export function istDate(ts: string | Date) {
  return new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

/** The Monday (YYYY-MM-DD) of the week containing this date. */
export function mondayOf(dateYmd: string) {
  const t = d(dateYmd)
  const back = (t.getUTCDay() + 6) % 7 // Mon=0 ... Sun=6
  t.setUTCDate(t.getUTCDate() - back)
  return ymd(t)
}

export function addDays(dateYmd: string, n: number) {
  const t = d(dateYmd)
  t.setUTCDate(t.getUTCDate() + n)
  return ymd(t)
}

export const isYmd = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(d(s).getTime())

/** Start (inclusive) and end (exclusive) of the week as IST-midnight timestamps, plus labels. */
export function weekRange(monday: string) {
  const sunday = addDays(monday, 6)
  const next = addDays(monday, 7)
  const a = d(monday), b = d(sunday)
  const label = a.getUTCFullYear() === b.getUTCFullYear()
    ? `Mon ${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]} – Sun ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]} ${b.getUTCFullYear()}`
    : `Mon ${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]} ${a.getUTCFullYear()} – Sun ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]} ${b.getUTCFullYear()}`
  return {
    monday,
    sunday,
    from: `${monday}T00:00:00+05:30`,
    to: `${next}T00:00:00+05:30`,
    label,
    days: Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  }
}

/** "Mon 2 Nov" */
export function dayLabel(dateYmd: string) {
  const t = d(dateYmd)
  return `${DAYS[t.getUTCDay()]} ${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]}`
}
