import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/duel')({
  component: DuelRoute,
})

function DuelRoute() {
  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-semibold">Duel</h1>
      <p className="text-sm text-stone-300">
        Gameplay board migration is pending. Use this route as the TanStack
        shell target for the next phase.
      </p>
      <div className="rounded border border-stone-700/40 p-3 text-sm text-stone-400">
        Next step: mount converted game board + turn-state hooks here.
      </div>
    </section>
  )
}
