import { convexQuery, useConvexMutation } from '@convex-dev/react-query'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { api } from '~/lib/convexApi'

const currentUserQuery = convexQuery(api.auth.currentUser, {})
const queueStatusQuery = convexQuery(api.matchmaking.getQueueStatus, {})
const decksQuery = convexQuery(api.cards.getUserDecks, {})

export const Route = createFileRoute('/pvp')({
  loader: async ({ context }) => {
    if (!context.convexConfigured) return
    await context.queryClient.ensureQueryData(currentUserQuery)
  },
  component: PvpRoute,
})

function PvpRoute() {
  const { convexConfigured } = Route.useRouteContext()
  const [selectedDeckId, setSelectedDeckId] = useState('')
  const [statusMessage, setStatusMessage] = useState('')

  const currentUser = useQuery({
    ...currentUserQuery,
    enabled: convexConfigured,
  })
  const queueStatus = useQuery({
    ...queueStatusQuery,
    enabled: convexConfigured && currentUser.data != null,
    retry: false,
  })
  const decks = useQuery({
    ...decksQuery,
    enabled: convexConfigured && currentUser.data != null,
    retry: false,
  })

  const joinQueue = useConvexMutation(api.matchmaking.joinRankedQueue)
  const leaveQueue = useConvexMutation(api.matchmaking.leaveRankedQueue)

  const canAct = convexConfigured && currentUser.data != null

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">PvP Queue</h1>

      {!convexConfigured ? (
        <p className="text-sm text-amber-300">
          Add <code>VITE_CONVEX_URL</code> to use matchmaking.
        </p>
      ) : currentUser.data == null ? (
        <p className="text-sm text-amber-300">Sign in to join PvP queue.</p>
      ) : (
        <>
          <div className="rounded border border-stone-700/40 p-3 text-sm">
            <h2 className="text-xs uppercase tracking-wide text-stone-400">
              Queue status
            </h2>
            {queueStatus.isLoading ? (
              <p className="mt-2 text-stone-400">Loading queue status…</p>
            ) : queueStatus.isError ? (
              <p className="mt-2 text-rose-300">Could not load queue status.</p>
            ) : (
              <pre className="mt-2 overflow-x-auto text-xs text-stone-300">
                {JSON.stringify(queueStatus.data, null, 2)}
              </pre>
            )}
          </div>

          <div className="rounded border border-stone-700/40 p-3 text-sm">
            <h2 className="text-xs uppercase tracking-wide text-stone-400">Join queue</h2>
            <label className="mt-2 block text-xs text-stone-300">
              Deck ID
              <input
                value={selectedDeckId}
                onChange={(e) => setSelectedDeckId(e.target.value)}
                placeholder="deck id"
                className="mt-1 w-full rounded border border-stone-600 bg-stone-950 px-2 py-1 text-sm"
              />
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              {(decks.data as Array<{ deckId: string; name?: string }> | undefined)?.slice(0, 8).map((deck) => (
                <button
                  key={deck.deckId}
                  onClick={() => setSelectedDeckId(deck.deckId)}
                  className="rounded border border-stone-700 px-2 py-1 text-xs text-stone-300"
                >
                  {deck.name ?? deck.deckId}
                </button>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={async () => {
                  if (!selectedDeckId) return
                  try {
                    const result = await joinQueue({ deckId: selectedDeckId })
                    setStatusMessage(JSON.stringify(result))
                    await queueStatus.refetch()
                  } catch (err) {
                    setStatusMessage(err instanceof Error ? err.message : 'Join queue failed')
                  }
                }}
                disabled={!canAct || !selectedDeckId}
                className="rounded border border-stone-600 px-3 py-1 text-xs disabled:opacity-50"
              >
                Join Ranked Queue
              </button>
              <button
                onClick={async () => {
                  try {
                    await leaveQueue({})
                    setStatusMessage('Left queue.')
                    await queueStatus.refetch()
                  } catch (err) {
                    setStatusMessage(err instanceof Error ? err.message : 'Leave queue failed')
                  }
                }}
                disabled={!canAct}
                className="rounded border border-stone-600 px-3 py-1 text-xs disabled:opacity-50"
              >
                Leave Queue
              </button>
            </div>
            {statusMessage ? (
              <p className="mt-2 text-xs text-stone-300">{statusMessage}</p>
            ) : null}
          </div>
        </>
      )}
    </section>
  )
}
