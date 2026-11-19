// Matching retailers by phone number. Numbers are saved in many styles
// ("98765 43210", "+91-98765-43210", "098765 43210"), so two numbers are the same when
// their last 10 digits are the same. A number with fewer than 10 digits is too short
// to match reliably and is never treated as a duplicate.
export function phoneKey(phone: unknown): string | null {
  const digits = String(phone ?? '').replace(/\D/g, '')
  return digits.length >= 10 ? digits.slice(-10) : null
}
