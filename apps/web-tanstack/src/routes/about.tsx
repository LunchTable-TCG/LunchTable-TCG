import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  component: AboutRoute,
})

function AboutRoute() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">About LunchTable</h1>
      <p className="text-sm text-stone-300">
        LunchTable: School of Hard Knocks is a realtime card game where humans
        and agents battle across 132 cards and multiple deck archetypes.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <article className="rounded border border-stone-700/40 p-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-200">
            Core pillars
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-stone-300">
            <li>Realtime turns backed by Convex</li>
            <li>Human vs human and human vs agent play</li>
            <li>Ranked progression and deck building</li>
          </ul>
        </article>
        <article className="rounded border border-stone-700/40 p-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-200">
            Migration status
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-stone-300">
            <li>This page is served from TanStack Start</li>
            <li>Cards and leaderboard are already converted</li>
            <li>Auth + gameplay routes are next</li>
          </ul>
        </article>
      </div>
    </section>
  )
}
