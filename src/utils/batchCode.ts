import { todayIST } from '@/utils/allowanceWeek';

/** Today's batch date part, e.g. "G-11-12" for 12 Nov (India date, whatever the phone's time zone). */
export function todayBatchDate(now = new Date()) {
  const [, mm, dd] = todayIST(now).split('-');
  return `G-${mm}-${dd}`;
}

/** Full batch code for a blend made today, e.g. "BLEND-LV-G-11-12". */
export function todayBatchCode(now = new Date()) {
  return `BLEND-LV-${todayBatchDate(now)}`;
}
