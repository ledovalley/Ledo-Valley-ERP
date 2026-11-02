'use client'

// Shown when the ledger can't be loaded completely. Better no totals than wrong ones.
export default function LedgerError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="max-w-xl mx-auto mt-16 bg-white border border-rose-200 rounded-2xl p-6 text-center">
      <h2 className="text-lg font-semibold text-slate-900">The ledger couldn&apos;t be loaded completely</h2>
      <p className="text-sm text-slate-600 mt-2">
        No totals are shown, so you never see incomplete payout figures. Please try again.
      </p>
      {error?.digest && <p className="text-xs text-slate-400 mt-2">Reference: {error.digest}</p>}
      <button
        onClick={() => reset()}
        className="mt-5 px-4 py-2 rounded-xl bg-[#0D4728] text-white text-sm font-semibold"
      >
        Try again
      </button>
    </div>
  )
}
