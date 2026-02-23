import { convexQuery } from '@convex-dev/react-query'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { api } from '~/lib/convexApi'

type LeaderboardPlayer = {
  userId: string
  username: string
  rating: number
  tier: string
  gamesPlayed: number
  peakRating: number
}

type Distribution = {
  distribution: Record<string, number>
  totalPlayers: number
}

const leaderboardQuery = convexQuery(api.ranked.getLeaderboard, { limit: 100 })
const distributionQuery = convexQuery(api.ranked.getRankDistribution, {})

const TIER_ORDER = ['all', 'diamond', 'platinum', 'gold', 'silver', 'bronze'] as const
type TierFilter = (typeof TIER_ORDER)[number]

export const Route = createFileRoute('/leaderboard')({
  loader: async ({ context }) => {
    if (!context.convexConfigured) return
    await Promise.all([
      context.queryClient.ensureQueryData(leaderboardQuery),
      context.queryClient.ensureQueryData(distributionQuery),
    ])
  },
  component: LeaderboardRoute,
})

function LeaderboardRoute() {
  const { convexConfigured } = Route.useRouteContext()
  const [tierFilter, setTierFilter] = useState<TierFilter>('all')
  const leaderboard = useQuery({
    ...leaderboardQuery,
    enabled: convexConfigured,
  })
  const distribution = useQuery({
    ...distributionQuery,
    enabled: convexConfigured,
  })

  const rows = useMemo(() => {
    const allRows = (leaderboard.data ?? []) as LeaderboardPlayer[]
    if (tierFilter === 'all') return allRows
    return allRows.filter((row) => row.tier === tierFilter)
  }, [leaderboard.data, tierFilter])

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Leaderboard</h1>

      {!convexConfigured ? (
        <p className="text-sm text-amber-300">
          Add <code>VITE_CONVEX_URL</code> to load ranked data.
        </p>
      ) : (
        <>
          <TierDistribution distribution={distribution.data as Distribution | undefined} />

          <div className="flex flex-wrap gap-2">
            {TIER_ORDER.map((tier) => (
              <button
                key={tier}
                onClick={() => setTierFilter(tier)}
                className={`rounded border px-2 py-1 text-xs uppercase tracking-wide ${
                  tierFilter === tier
                    ? 'border-stone-200 text-stone-100'
                    : 'border-stone-700 text-stone-400'
                }`}
              >
                {tier}
              </button>
            ))}
          </div>

          {leaderboard.isLoading ? (
            <p className="text-sm text-stone-300">Loading leaderboard…</p>
          ) : leaderboard.isError ? (
            <p className="text-sm text-rose-300">Failed to load leaderboard.</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-stone-400">No ranked players yet.</p>
          ) : (
            <div className="overflow-x-auto rounded border border-stone-700/40">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-stone-700/40 bg-stone-900/60 text-xs uppercase tracking-wide text-stone-300">
                  <tr>
                    <th className="px-3 py-2">Rank</th>
                    <th className="px-3 py-2">Player</th>
                    <th className="px-3 py-2">Tier</th>
                    <th className="px-3 py-2">Rating</th>
                    <th className="px-3 py-2">Peak</th>
                    <th className="px-3 py-2">Games</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr
                      key={row.userId}
                      className="border-b border-stone-700/30 last:border-b-0"
                    >
                      <td className="px-3 py-2 font-medium">#{idx + 1}</td>
                      <td className="px-3 py-2">{row.username}</td>
                      <td className="px-3 py-2 capitalize">{row.tier}</td>
                      <td className="px-3 py-2">{row.rating}</td>
                      <td className="px-3 py-2">{row.peakRating}</td>
                      <td className="px-3 py-2">{row.gamesPlayed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function TierDistribution({ distribution }: { distribution: Distribution | undefined }) {
  if (!distribution || distribution.totalPlayers === 0) return null

  const entries = Object.entries(distribution.distribution).sort((a, b) => b[1] - a[1])

  return (
    <div className="rounded border border-stone-700/40 p-3">
      <h2 className="mb-2 text-sm uppercase tracking-wide text-stone-300">
        Tier distribution ({distribution.totalPlayers})
      </h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {entries.map(([tier, count]) => {
          const pct = Math.round((count / distribution.totalPlayers) * 100)
          return (
            <div key={tier} className="flex items-center justify-between text-sm">
              <span className="capitalize text-stone-200">{tier}</span>
              <span className="text-stone-400">
                {count} ({pct}%)
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
