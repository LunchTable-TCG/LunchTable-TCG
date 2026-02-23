import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { api } from '~/lib/convexApi'
import { useConvexMutation } from '@convex-dev/react-query'

type PvpCreateResult = {
  matchId: string
  joinCode: string | null
  visibility: 'public' | 'private'
  status: 'waiting'
  createdAt: number
}

type PvpJoinResult = {
  matchId: string
  seat: 'away'
  mode: 'pvp'
  status: 'active'
}

function getOrigin() {
  if (typeof window === 'undefined') return ''
  return window.location.origin
}

async function tryCopy(value: string) {
  if (typeof navigator === 'undefined' || !navigator.clipboard) return false
  await navigator.clipboard.writeText(value)
  return true
}

export const Route = createFileRoute('/duel')({
  component: DuelRoute,
})

function DuelRoute() {
  const navigate = Route.useNavigate()
  const [joinInput, setJoinInput] = useState('')
  const [activeLobbyId, setActiveLobbyId] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [copied, setCopied] = useState<'web' | 'tgMini' | 'tgGame' | null>(null)

  const createLobby = useConvexMutation(api.game.createPvpLobby)
  const joinLobby = useConvexMutation(api.game.joinPvpLobby)

  const botUsernameRaw = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME ?? '').trim()
  const botUsername = botUsernameRaw.replace(/^@/, '')
  const miniAppShortNameRaw = (import.meta.env.VITE_TELEGRAM_MINIAPP_SHORT_NAME ?? '').trim()
  const miniAppShortName = /^[A-Za-z0-9_]{3,64}$/.test(miniAppShortNameRaw)
    ? miniAppShortNameRaw
    : ''
  const gameShortNameRaw = (import.meta.env.VITE_TELEGRAM_GAME_SHORT_NAME ?? '').trim()
  const gameShortName = /^[A-Za-z0-9_]{3,64}$/.test(gameShortNameRaw)
    ? gameShortNameRaw
    : ''

  const webJoinLink = activeLobbyId
    ? `${getOrigin()}/play/${activeLobbyId}?autojoin=1`
    : ''
  const telegramMiniLink =
    activeLobbyId && botUsername
      ? miniAppShortName
        ? `https://t.me/${botUsername}/${miniAppShortName}?startapp=${encodeURIComponent(
            `m_${activeLobbyId}`,
          )}`
        : `https://t.me/${botUsername}?startapp=${encodeURIComponent(
            `m_${activeLobbyId}`,
          )}`
      : ''
  const telegramGameLink =
    botUsername && gameShortName
      ? `https://t.me/${botUsername}?game=${encodeURIComponent(gameShortName)}`
      : ''

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Duel</h1>
      <p className="text-sm text-stone-300">Create or join a direct duel lobby.</p>

      <article className="rounded border border-stone-700/40 p-3 text-sm">
        <h2 className="text-xs uppercase tracking-wide text-stone-400">Create lobby</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            onClick={async () => {
              setBusy('create')
              setError('')
              setMessage('')
              try {
                const result = (await createLobby({
                  visibility: 'public',
                })) as PvpCreateResult
                setActiveLobbyId(result.matchId)
                setMessage('Lobby created.')
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to create lobby.')
              } finally {
                setBusy(null)
              }
            }}
            disabled={busy != null}
            className="rounded border border-stone-600 px-3 py-1 text-xs disabled:opacity-50"
          >
            {busy === 'create' ? 'Creating...' : 'Create Public Duel Lobby'}
          </button>
          <button
            onClick={() => {
              if (!activeLobbyId) return
              navigate({ to: '/play/$matchId', params: { matchId: activeLobbyId } })
            }}
            disabled={!activeLobbyId}
            className="rounded border border-stone-600 px-3 py-1 text-xs disabled:opacity-50"
          >
            Open Lobby
          </button>
        </div>
        {activeLobbyId ? (
          <p className="mt-2 text-xs text-stone-300">
            Match ID: <code>{activeLobbyId}</code>
          </p>
        ) : null}
      </article>

      <article className="rounded border border-stone-700/40 p-3 text-sm">
        <h2 className="text-xs uppercase tracking-wide text-stone-400">Join by match ID</h2>
        <div className="mt-2 flex gap-2">
          <input
            value={joinInput}
            onChange={(event) => setJoinInput(event.target.value)}
            placeholder="Match ID"
            className="w-full rounded border border-stone-600 bg-stone-950 px-2 py-1 text-xs"
          />
          <button
            onClick={async () => {
              const matchId = joinInput.trim()
              if (!matchId) {
                setError('Enter a match ID.')
                return
              }
              setBusy('join')
              setError('')
              setMessage('')
              try {
                const result = (await joinLobby({ matchId })) as PvpJoinResult
                navigate({ to: '/play/$matchId', params: { matchId: result.matchId } })
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to join lobby.')
              } finally {
                setBusy(null)
              }
            }}
            disabled={busy != null}
            className="rounded border border-stone-600 px-3 py-1 text-xs disabled:opacity-50"
          >
            {busy === 'join' ? 'Joining...' : 'Join'}
          </button>
        </div>
      </article>

      {activeLobbyId ? (
        <article className="rounded border border-stone-700/40 p-3 text-sm">
          <h2 className="text-xs uppercase tracking-wide text-stone-400">Share invite</h2>
          <div className="mt-2 space-y-2 text-xs">
            <div className="space-y-1">
              <p className="text-stone-300">Web invite</p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={webJoinLink}
                  className="w-full rounded border border-stone-600 bg-stone-950 px-2 py-1 text-xs"
                />
                <button
                  onClick={async () => {
                    const ok = await tryCopy(webJoinLink)
                    setCopied(ok ? 'web' : null)
                  }}
                  className="rounded border border-stone-600 px-2 py-1"
                >
                  {copied === 'web' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-stone-300">Telegram mini app</p>
              {telegramMiniLink ? (
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={telegramMiniLink}
                    className="w-full rounded border border-stone-600 bg-stone-950 px-2 py-1 text-xs"
                  />
                  <button
                    onClick={async () => {
                      const ok = await tryCopy(telegramMiniLink)
                      setCopied(ok ? 'tgMini' : null)
                    }}
                    className="rounded border border-stone-600 px-2 py-1"
                  >
                    {copied === 'tgMini' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              ) : (
                <p className="text-stone-400">
                  Configure <code>VITE_TELEGRAM_BOT_USERNAME</code> and optional{' '}
                  <code>VITE_TELEGRAM_MINIAPP_SHORT_NAME</code>.
                </p>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-stone-300">Telegram game link</p>
              {telegramGameLink ? (
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={telegramGameLink}
                    className="w-full rounded border border-stone-600 bg-stone-950 px-2 py-1 text-xs"
                  />
                  <button
                    onClick={async () => {
                      const ok = await tryCopy(telegramGameLink)
                      setCopied(ok ? 'tgGame' : null)
                    }}
                    className="rounded border border-stone-600 px-2 py-1"
                  >
                    {copied === 'tgGame' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              ) : (
                <p className="text-stone-400">
                  Configure <code>VITE_TELEGRAM_GAME_SHORT_NAME</code> for legacy game links.
                </p>
              )}
            </div>
          </div>
        </article>
      ) : null}

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {message ? <p className="text-sm text-stone-300">{message}</p> : null}
    </section>
  )
}
