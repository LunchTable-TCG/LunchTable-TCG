import { createFileRoute } from '@tanstack/react-router'

const SOLANA_TOKEN = 'DfC2mRB5SNF1eCQZPh2cGi5QhNQnm3jRNHwa5Rtkpump'

const VICES = [
  'Gambling',
  'Alcohol',
  'Social Media',
  'Crypto',
  'Validation',
  'Conspiracy',
  'Narcissism',
  'Adderall',
  'MLM',
  'Rage',
]

export const Route = createFileRoute('/token')({
  component: TokenRoute,
})

function TokenRoute() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">$LUNCH Token</h1>
      <p className="text-sm text-stone-300">
        LunchTable token route migration for the Solana deployment.
      </p>

      <div className="rounded border border-stone-700/40 p-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-200">
          Contract
        </h2>
        <a
          href={`https://pump.fun/${SOLANA_TOKEN}`}
          target="_blank"
          rel="noreferrer"
          className="mt-2 block break-all text-sm text-cyan-300 underline"
        >
          {SOLANA_TOKEN}
        </a>
      </div>

      <div className="rounded border border-stone-700/40 p-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-200">
          The 10 Vices
        </h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {VICES.map((vice) => (
            <span
              key={vice}
              className="rounded border border-stone-600 px-2 py-1 text-xs text-stone-300"
            >
              {vice}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
