import { convexQuery } from '@convex-dev/react-query'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { api } from '~/lib/convexApi'

const getAllCardsQuery = convexQuery(api.cards.getAllCards, {})

export const Route = createFileRoute('/')({
  loader: async ({ context }) => {
    if (!context.convexConfigured) return
    await context.queryClient.ensureQueryData(getAllCardsQuery)
  },
  component: Home,
})

function Home() {
  const { convexConfigured } = Route.useRouteContext()
  const cardsQuery = useQuery({
    ...getAllCardsQuery,
    enabled: convexConfigured,
  })
  const cardCount = cardsQuery.data?.length ?? 0
  const previewNames =
    cardsQuery.data
      ?.slice(0, 5)
      .map((card: Record<string, unknown>) =>
        String(
          card.name ??
            card.id ??
            'unknown',
        ),
      )
      .join(', ') ?? ''

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">Migration checkpoint: home route</h1>
      <p className="text-sm text-stone-300">
        This TanStack Start app is now wired to the existing Convex backend.
      </p>
      {!convexConfigured ? (
        <p className="text-sm text-amber-300">
          Add <code>VITE_CONVEX_URL</code> to run live data queries.
        </p>
      ) : (
        <div className="text-sm text-stone-200 space-y-1">
          <p>
            <strong>Total cards:</strong> {cardCount}
          </p>
          <p>
            <strong>Sample cards:</strong> {previewNames || 'No cards returned yet'}
          </p>
        </div>
      )}
    </div>
  )
}
