import { convexQuery, useConvexMutation } from '@convex-dev/react-query'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { api } from '~/lib/convexApi'

type Seat = 'host' | 'away'

type MatchMeta = {
  status?: string
  mode?: string
  hostId?: string
  awayId?: string
  winner?: string | null
}

type CurrentUser = {
  _id: string
}

type EventBatch = {
  command: string
  events: string
  seat: string
  version: number
  createdAt: number
}

type CatalogCard = {
  _id: string
  name: string
  cardType: string
  attack?: number
  defense?: number
}

type BoardCard = {
  cardId?: string
  definitionId?: string
  position?: string
  faceDown?: boolean
  attack?: number
  defense?: number
}

type SpellTrapCard = {
  cardId?: string
  definitionId?: string
  faceDown?: boolean
}

type ChainLink = {
  cardId?: string
  activatingPlayer?: Seat
}

type PlayerView = {
  instanceDefinitions: Record<string, string>
  hand: string[]
  board: BoardCard[]
  spellTrapZone: SpellTrapCard[]
  fieldSpell: SpellTrapCard | null
  graveyard: string[]
  banished: string[]
  lifePoints: number | null
  deckCount: number | null
  opponentHandCount: number | null
  opponentBoard: BoardCard[]
  opponentSpellTrapZone: SpellTrapCard[]
  opponentFieldSpell: SpellTrapCard | null
  opponentGraveyard: string[]
  opponentBanished: string[]
  opponentLifePoints: number | null
  opponentDeckCount: number | null
  currentTurnPlayer: string | null
  currentPriorityPlayer: string | null
  turnNumber: number | null
  currentPhase: string | null
  currentChain: ChainLink[]
  gameOver: boolean
  winner: string | null
  topDeckView: string[] | null
}

type OpenPrompt = {
  promptType?: string
  data?: string
}

type ChainPromptTrap = {
  cardId: string
  cardDefinitionId: string | undefined
  name: string | undefined
}

type ChainPromptData = {
  opponentCardName?: string
  activatableTraps: ChainPromptTrap[]
}

type LegalMove = {
  type: string
  [key: string]: unknown
}

function asSeat(value: unknown): Seat | null {
  return value === 'host' || value === 'away' ? value : null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null
  try {
    const parsed = JSON.parse(value)
    return asRecord(parsed)
  } catch {
    return null
  }
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((entry) => asString(entry)).filter((entry): entry is string => entry != null)
}

function asStringRecord(value: unknown): Record<string, string> {
  const record = asRecord(value)
  if (!record) return {}
  const output: Record<string, string> = {}
  for (const [key, entry] of Object.entries(record)) {
    const next = asString(entry)
    if (next != null) output[key] = next
  }
  return output
}

function asBoardCards(value: unknown): BoardCard[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry != null)
    .map((entry) => ({
      cardId: asString(entry.cardId) ?? undefined,
      definitionId: asString(entry.definitionId) ?? undefined,
      position: asString(entry.position) ?? undefined,
      faceDown: asBoolean(entry.faceDown) ?? undefined,
      attack: asNumber(entry.attack) ?? undefined,
      defense: asNumber(entry.defense) ?? undefined,
    }))
}

function asSpellTrapCards(value: unknown): SpellTrapCard[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry != null)
    .map((entry) => ({
      cardId: asString(entry.cardId) ?? undefined,
      definitionId: asString(entry.definitionId) ?? undefined,
      faceDown: asBoolean(entry.faceDown) ?? undefined,
    }))
}

function asChainLinks(value: unknown): ChainLink[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry != null)
    .map((entry) => ({
      cardId: asString(entry.cardId) ?? undefined,
      activatingPlayer: asSeat(entry.activatingPlayer) ?? undefined,
    }))
}

function parsePlayerView(value: unknown): PlayerView | null {
  const view = parseJsonRecord(value)
  if (!view) return null

  return {
    instanceDefinitions: asStringRecord(view.instanceDefinitions),
    hand: asStringArray(view.hand),
    board: asBoardCards(view.board),
    spellTrapZone: asSpellTrapCards(view.spellTrapZone),
    fieldSpell: asRecord(view.fieldSpell)
      ? {
          cardId: asString(asRecord(view.fieldSpell)?.cardId) ?? undefined,
          definitionId: asString(asRecord(view.fieldSpell)?.definitionId) ?? undefined,
          faceDown: asBoolean(asRecord(view.fieldSpell)?.faceDown) ?? undefined,
        }
      : null,
    graveyard: asStringArray(view.graveyard),
    banished: asStringArray(view.banished),
    lifePoints: asNumber(view.lifePoints),
    deckCount: asNumber(view.deckCount),
    opponentHandCount: asNumber(view.opponentHandCount),
    opponentBoard: asBoardCards(view.opponentBoard),
    opponentSpellTrapZone: asSpellTrapCards(view.opponentSpellTrapZone),
    opponentFieldSpell: asRecord(view.opponentFieldSpell)
      ? {
          cardId: asString(asRecord(view.opponentFieldSpell)?.cardId) ?? undefined,
          definitionId: asString(asRecord(view.opponentFieldSpell)?.definitionId) ?? undefined,
          faceDown: asBoolean(asRecord(view.opponentFieldSpell)?.faceDown) ?? undefined,
        }
      : null,
    opponentGraveyard: asStringArray(view.opponentGraveyard),
    opponentBanished: asStringArray(view.opponentBanished),
    opponentLifePoints: asNumber(view.opponentLifePoints),
    opponentDeckCount: asNumber(view.opponentDeckCount),
    currentTurnPlayer: asString(view.currentTurnPlayer),
    currentPriorityPlayer: asString(view.currentPriorityPlayer),
    turnNumber: asNumber(view.turnNumber),
    currentPhase: asString(view.currentPhase),
    currentChain: asChainLinks(view.currentChain),
    gameOver: view.gameOver === true,
    winner: asString(view.winner),
    topDeckView: Array.isArray(view.topDeckView) ? asStringArray(view.topDeckView) : null,
  }
}

function parseChainPromptData(prompt: OpenPrompt | null | undefined): ChainPromptData | null {
  if (!prompt || prompt.promptType !== 'chain_response') return null
  const payload = parseJsonRecord(prompt.data)
  if (!payload) {
    return {
      activatableTraps: [],
    }
  }

  const activatableTraps = Array.isArray(payload.activatableTraps)
    ? payload.activatableTraps
        .map((entry) => asRecord(entry))
        .filter((entry): entry is Record<string, unknown> => entry != null)
        .map((entry) => {
          const cardId = asString(entry.cardId)
          if (!cardId) return null
          return {
            cardId,
            cardDefinitionId: asString(entry.cardDefinitionId) ?? undefined,
            name: asString(entry.name) ?? undefined,
          }
        })
        .filter((entry): entry is ChainPromptTrap => entry != null)
    : []

  return {
    opponentCardName: asString(payload.opponentCardName) ?? undefined,
    activatableTraps,
  }
}

function parseLegalMoves(value: unknown): LegalMove[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry != null)
    .map((entry) => {
      const type = asString(entry.type)
      if (!type) return null
      return {
        ...entry,
        type,
      } as LegalMove
    })
    .filter((entry): entry is LegalMove => entry != null)
}

function getMoveString(move: LegalMove, key: string): string | null {
  return asString(move[key])
}

function getMoveStringArray(move: LegalMove, key: string): string[] {
  return asStringArray(move[key])
}

function getMoveNumber(move: LegalMove, key: string): number | null {
  return asNumber(move[key])
}

function getMoveBoolean(move: LegalMove, key: string): boolean | null {
  return asBoolean(move[key])
}

function toCommandPayload(move: LegalMove): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(move)) {
    if (value !== undefined) payload[key] = value
  }
  return payload
}

function resolveSeat(meta: MatchMeta | null | undefined, userId: string | undefined): Seat | null {
  if (!meta || !userId) return null
  if (meta.hostId === userId) return 'host'
  if (meta.awayId === userId) return 'away'
  return null
}

function parseCommandType(batch: EventBatch): string {
  const command = parseJsonRecord(batch.command)
  return asString(command?.type) ?? 'UNKNOWN'
}

function parseEventCount(batch: EventBatch): number {
  try {
    const parsed = JSON.parse(batch.events)
    return Array.isArray(parsed) ? parsed.length : 0
  } catch {
    return 0
  }
}

function resolveCardLabel(args: {
  cardId: string
  definitionId: string | null
  instanceDefinitions: Record<string, string>
  cardNamesById: Map<string, string>
}): string {
  const resolvedDefinition = resolveDefinitionId({
    cardId: args.cardId,
    definitionId: args.definitionId,
    instanceDefinitions: args.instanceDefinitions,
  })

  if (resolvedDefinition === 'hidden') {
    return 'Hidden card'
  }

  if (!resolvedDefinition) {
    return args.cardId
  }

  return args.cardNamesById.get(resolvedDefinition) ?? resolvedDefinition
}

function resolveDefinitionId(args: {
  cardId: string
  definitionId: string | null
  instanceDefinitions: Record<string, string>
}): string | null {
  return args.definitionId ?? args.instanceDefinitions[args.cardId] ?? null
}

function describeLegalMove(args: {
  move: LegalMove
  instanceDefinitions: Record<string, string>
  cardNamesById: Map<string, string>
}): string {
  const { move, instanceDefinitions, cardNamesById } = args
  const type = move.type

  if (type === 'ADVANCE_PHASE') return 'Advance phase'
  if (type === 'END_TURN') return 'End turn'
  if (type === 'SURRENDER') return 'Surrender'

  const resolveName = (cardId: string | null) => {
    if (!cardId) return null
    return resolveCardLabel({
      cardId,
      definitionId: null,
      instanceDefinitions,
      cardNamesById,
    })
  }

  if (type === 'SUMMON') {
    const cardId = getMoveString(move, 'cardId')
    const position = getMoveString(move, 'position') ?? 'unknown'
    const tributes = getMoveStringArray(move, 'tributeCardIds')
    const tributeLabel = tributes.length > 0 ? ` (${tributes.length} tribute)` : ''
    return `Summon ${resolveName(cardId) ?? cardId ?? 'card'} in ${position}${tributeLabel}`
  }

  if (type === 'SET_MONSTER') {
    const cardId = getMoveString(move, 'cardId')
    return `Set monster ${resolveName(cardId) ?? cardId ?? ''}`.trim()
  }

  if (type === 'SET_SPELL_TRAP') {
    const cardId = getMoveString(move, 'cardId')
    return `Set spell/trap ${resolveName(cardId) ?? cardId ?? ''}`.trim()
  }

  if (type === 'ACTIVATE_SPELL' || type === 'ACTIVATE_TRAP' || type === 'ACTIVATE_EFFECT') {
    const cardId = getMoveString(move, 'cardId')
    const targets = getMoveStringArray(move, 'targets')
    const targetLabel =
      targets.length > 0
        ? ` -> ${targets.map((target) => resolveName(target) ?? target).join(', ')}`
        : ''
    return `${type.toLowerCase().replace('_', ' ')} ${resolveName(cardId) ?? cardId ?? ''}${targetLabel}`.trim()
  }

  if (type === 'FLIP_SUMMON') {
    const cardId = getMoveString(move, 'cardId')
    return `Flip summon ${resolveName(cardId) ?? cardId ?? ''}`.trim()
  }

  if (type === 'CHANGE_POSITION') {
    const cardId = getMoveString(move, 'cardId')
    return `Change position ${resolveName(cardId) ?? cardId ?? ''}`.trim()
  }

  if (type === 'DECLARE_ATTACK') {
    const attackerId = getMoveString(move, 'attackerId')
    const targetId = getMoveString(move, 'targetId')
    if (!targetId) {
      return `Direct attack with ${resolveName(attackerId) ?? attackerId ?? 'attacker'}`
    }
    return `Attack ${resolveName(targetId) ?? targetId} with ${resolveName(attackerId) ?? attackerId ?? 'attacker'}`
  }

  if (type === 'CHAIN_RESPONSE') {
    const pass = getMoveBoolean(move, 'pass')
    if (pass) return 'Pass chain response'
    const cardId = getMoveString(move, 'cardId')
    return `Respond in chain with ${resolveName(cardId) ?? cardId ?? 'card'}`
  }

  if (type === 'PONG_SHOOT') {
    const result = getMoveString(move, 'result') ?? 'unknown'
    return `Pong shot (${result})`
  }

  if (type === 'PONG_DECLINE') return 'Decline pong'
  if (type === 'REDEMPTION_SHOOT') {
    const result = getMoveString(move, 'result') ?? 'unknown'
    return `Redemption shot (${result})`
  }
  if (type === 'REDEMPTION_DECLINE') return 'Decline redemption'

  return type
}

export const Route = createFileRoute('/play/$matchId')({
  loader: async ({ context }) => {
    if (!context.convexConfigured) return
    await context.queryClient.ensureQueryData(convexQuery(api.auth.currentUser, {}))
  },
  component: PlayRoute,
})

function PlayRoute() {
  const { convexConfigured } = Route.useRouteContext()
  const { matchId } = Route.useParams()

  const [actionMessage, setActionMessage] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [customCommand, setCustomCommand] = useState('{\n  "type": "ADVANCE_PHASE"\n}')

  const submitAction = useConvexMutation(api.game.submitAction)

  const currentUser = useQuery({
    ...convexQuery(api.auth.currentUser, {}),
    enabled: convexConfigured,
  })
  const meta = useQuery({
    ...convexQuery(api.game.getMatchMeta, { matchId }),
    enabled: convexConfigured && currentUser.data != null,
    retry: false,
    refetchInterval: 2000,
  })

  const seat = useMemo(
    () =>
      resolveSeat(
        (meta.data ?? null) as MatchMeta | null,
        (currentUser.data as CurrentUser | undefined)?._id,
      ),
    [meta.data, currentUser.data],
  )

  const storyContext = useQuery({
    ...convexQuery(api.game.getStoryMatchContext, { matchId }),
    enabled:
      convexConfigured &&
      currentUser.data != null &&
      (meta.data as MatchMeta | undefined)?.mode === 'story',
    retry: false,
  })
  const snapshotVersion = useQuery({
    ...convexQuery(api.game.getLatestSnapshotVersion, { matchId }),
    enabled: convexConfigured && currentUser.data != null,
    retry: false,
    refetchInterval: 1200,
  })
  const playerView = useQuery({
    ...convexQuery(api.game.getPlayerView, { matchId, seat: seat ?? 'host' }),
    enabled: convexConfigured && currentUser.data != null && seat != null,
    retry: false,
    refetchInterval: 1000,
  })
  const openPrompt = useQuery({
    ...convexQuery(api.game.getOpenPrompt, { matchId, seat: seat ?? 'host' }),
    enabled: convexConfigured && currentUser.data != null && seat != null,
    retry: false,
    refetchInterval: 1000,
  })
  const legalMoves = useQuery({
    ...convexQuery(api.game.getLegalMoves, { matchId, seat: seat ?? 'host' }),
    enabled: convexConfigured && currentUser.data != null && seat != null,
    retry: false,
    refetchInterval: 1000,
  })

  const sinceVersion = useMemo(() => {
    if (typeof snapshotVersion.data !== 'number') return 0
    return Math.max(snapshotVersion.data - 40, 0)
  }, [snapshotVersion.data])

  const recentEvents = useQuery({
    ...convexQuery(api.game.getRecentEvents, { matchId, sinceVersion }),
    enabled: convexConfigured && currentUser.data != null,
    retry: false,
    refetchInterval: 1000,
  })

  const catalogCards = useQuery({
    ...convexQuery(api.game.getCatalogCards, {}),
    enabled: convexConfigured,
    retry: false,
  })

  const parsedView = useMemo(() => parsePlayerView(playerView.data), [playerView.data])

  const cardNamesById = useMemo(() => {
    const map = new Map<string, string>()
    for (const card of (catalogCards.data ?? []) as CatalogCard[]) {
      if (typeof card._id === 'string' && typeof card.name === 'string') {
        map.set(card._id, card.name)
      }
    }
    return map
  }, [catalogCards.data])

  const cardTypesById = useMemo(() => {
    const map = new Map<string, string>()
    for (const card of (catalogCards.data ?? []) as CatalogCard[]) {
      if (typeof card._id === 'string' && typeof card.cardType === 'string') {
        map.set(card._id, card.cardType)
      }
    }
    return map
  }, [catalogCards.data])

  const chainPrompt = useMemo(
    () => parseChainPromptData((openPrompt.data ?? null) as OpenPrompt | null),
    [openPrompt.data],
  )

  const parsedLegalMoves = useMemo(
    () => parseLegalMoves(legalMoves.data),
    [legalMoves.data],
  )

  const eventRows = useMemo(
    () => ((recentEvents.data as EventBatch[] | undefined) ?? []).slice(-30).reverse(),
    [recentEvents.data],
  )

  const coreLegalMoves = useMemo(
    () =>
      parsedLegalMoves.filter(
        (move) =>
          move.type === 'ADVANCE_PHASE' ||
          move.type === 'END_TURN' ||
          move.type === 'SURRENDER',
      ),
    [parsedLegalMoves],
  )

  const chainLegalMoves = useMemo(
    () => parsedLegalMoves.filter((move) => move.type === 'CHAIN_RESPONSE'),
    [parsedLegalMoves],
  )

  const handActionRows = useMemo(() => {
    if (!parsedView) return []

    return parsedView.hand.map((cardId) => {
      const definitionId = resolveDefinitionId({
        cardId,
        definitionId: null,
        instanceDefinitions: parsedView.instanceDefinitions,
      })
      return {
        cardId,
        definitionId,
        name: resolveCardLabel({
          cardId,
          definitionId,
          instanceDefinitions: parsedView.instanceDefinitions,
          cardNamesById,
        }),
        cardType: definitionId ? cardTypesById.get(definitionId) ?? null : null,
        legalMoves: parsedLegalMoves.filter((move) => {
          const moveCardId = getMoveString(move, 'cardId')
          if (moveCardId !== cardId) return false
          return (
            move.type === 'SUMMON' ||
            move.type === 'SET_MONSTER' ||
            move.type === 'SET_SPELL_TRAP' ||
            move.type === 'ACTIVATE_SPELL'
          )
        }),
      }
    })
  }, [cardNamesById, cardTypesById, parsedLegalMoves, parsedView])

  const boardActionRows = useMemo(() => {
    if (!parsedView) return []

    return parsedView.board
      .map((card, index) => {
        const cardId = card.cardId
        if (!cardId) return null
        const definitionId = resolveDefinitionId({
          cardId,
          definitionId: card.definitionId ?? null,
          instanceDefinitions: parsedView.instanceDefinitions,
        })
        return {
          key: `${cardId}-${index}`,
          cardId,
          definitionId,
          position: card.position ?? null,
          name: resolveCardLabel({
            cardId,
            definitionId,
            instanceDefinitions: parsedView.instanceDefinitions,
            cardNamesById,
          }),
          legalMoves: parsedLegalMoves.filter((move) => {
            const moveCardId = getMoveString(move, 'cardId')
            const attackerId = getMoveString(move, 'attackerId')
            if (moveCardId === cardId) {
              return (
                move.type === 'CHANGE_POSITION' ||
                move.type === 'FLIP_SUMMON' ||
                move.type === 'ACTIVATE_EFFECT'
              )
            }
            if (attackerId === cardId) {
              return move.type === 'DECLARE_ATTACK'
            }
            return false
          }),
        }
      })
      .filter((row): row is { key: string; cardId: string; definitionId: string | null; position: string | null; name: string; legalMoves: LegalMove[] } => row != null)
  }, [cardNamesById, parsedLegalMoves, parsedView])

  const spellTrapActionRows = useMemo(() => {
    if (!parsedView) return []

    return parsedView.spellTrapZone
      .map((card, index) => {
        const cardId = card.cardId
        if (!cardId) return null
        const definitionId = resolveDefinitionId({
          cardId,
          definitionId: card.definitionId ?? null,
          instanceDefinitions: parsedView.instanceDefinitions,
        })
        return {
          key: `${cardId}-${index}`,
          cardId,
          definitionId,
          faceDown: card.faceDown === true,
          name: resolveCardLabel({
            cardId,
            definitionId,
            instanceDefinitions: parsedView.instanceDefinitions,
            cardNamesById,
          }),
          cardType: definitionId ? cardTypesById.get(definitionId) ?? null : null,
          legalMoves: parsedLegalMoves.filter((move) => {
            const moveCardId = getMoveString(move, 'cardId')
            return (
              moveCardId === cardId &&
              (move.type === 'ACTIVATE_SPELL' ||
                move.type === 'ACTIVATE_TRAP' ||
                move.type === 'CHAIN_RESPONSE')
            )
          }),
        }
      })
      .filter((row): row is { key: string; cardId: string; definitionId: string | null; faceDown: boolean; name: string; cardType: string | null; legalMoves: LegalMove[] } => row != null)
  }, [cardNamesById, cardTypesById, parsedLegalMoves, parsedView])

  const submitCommand = async (command: Record<string, unknown>, successMessage: string) => {
    if (!seat) {
      setActionMessage('You are not seated in this match.')
      return
    }
    if (typeof snapshotVersion.data !== 'number' || snapshotVersion.data < 0) {
      setActionMessage('State not synced yet. Wait and retry.')
      return
    }

    setActionBusy(true)
    setActionMessage('')
    try {
      await submitAction({
        matchId,
        seat,
        expectedVersion: snapshotVersion.data,
        command: JSON.stringify(command),
      })
      setActionMessage(successMessage)
      await Promise.all([
        meta.refetch(),
        snapshotVersion.refetch(),
        playerView.refetch(),
        openPrompt.refetch(),
        legalMoves.refetch(),
        recentEvents.refetch(),
      ])
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Action failed.')
    } finally {
      setActionBusy(false)
    }
  }

  const submitLegalMove = async (move: LegalMove) => {
    const label = describeLegalMove({
      move,
      instanceDefinitions: parsedView?.instanceDefinitions ?? {},
      cardNamesById,
    })
    await submitCommand(toCommandPayload(move), `${label} submitted.`)
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Play Match</h1>
      <p className="text-xs text-stone-400">matchId: {matchId}</p>

      {!convexConfigured ? (
        <p className="text-sm text-amber-300">
          Add <code>VITE_CONVEX_URL</code> to load match data.
        </p>
      ) : currentUser.data == null ? (
        <p className="text-sm text-amber-300">Sign in to access this match.</p>
      ) : meta.isLoading ? (
        <p className="text-sm text-stone-400">Loading match meta…</p>
      ) : meta.isError ? (
        <p className="text-sm text-rose-300">Match unavailable or you are not a participant.</p>
      ) : seat == null ? (
        <p className="text-sm text-rose-300">You are not a participant in this match.</p>
      ) : (
        <>
          <article className="rounded border border-stone-700/40 p-3 text-sm">
            <h2 className="text-xs uppercase tracking-wide text-stone-400">Match state</h2>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Seat" value={seat} />
              <Stat
                label="Status"
                value={String((meta.data as MatchMeta | undefined)?.status ?? 'unknown')}
              />
              <Stat label="Phase" value={parsedView?.currentPhase ?? 'loading'} />
              <Stat label="Turn" value={String(parsedView?.turnNumber ?? '-')} />
              <Stat label="My LP" value={String(parsedView?.lifePoints ?? '-')} />
              <Stat label="Opponent LP" value={String(parsedView?.opponentLifePoints ?? '-')} />
              <Stat
                label="My Deck/Hand"
                value={`${parsedView?.deckCount ?? '-'} / ${parsedView?.hand.length ?? '-'}`}
              />
              <Stat
                label="Opp Deck/Hand"
                value={`${parsedView?.opponentDeckCount ?? '-'} / ${parsedView?.opponentHandCount ?? '-'}`}
              />
            </div>
            <p className="mt-2 text-xs text-stone-400">
              Snapshot version: {String(snapshotVersion.data ?? 'n/a')} · turn:
              {' '}
              {parsedView?.currentTurnPlayer ?? 'unknown'} · priority:
              {' '}
              {parsedView?.currentPriorityPlayer ?? 'none'}
            </p>
          </article>

          <article className="rounded border border-stone-700/40 p-3 text-sm">
            <h2 className="text-xs uppercase tracking-wide text-stone-400">Board + zones</h2>
            {!parsedView ? (
              <p className="mt-2 text-stone-400">Loading player view…</p>
            ) : (
              <div className="mt-2 grid gap-3 lg:grid-cols-2">
                <ZoneList
                  title={`Hand (${parsedView.hand.length})`}
                  items={parsedView.hand.map((cardId) =>
                    resolveCardLabel({
                      cardId,
                      definitionId: null,
                      instanceDefinitions: parsedView.instanceDefinitions,
                      cardNamesById,
                    }),
                  )}
                />
                <ZoneList
                  title={`Top Deck Preview (${parsedView.topDeckView?.length ?? 0})`}
                  items={(parsedView.topDeckView ?? []).map((cardId) =>
                    resolveCardLabel({
                      cardId,
                      definitionId: null,
                      instanceDefinitions: parsedView.instanceDefinitions,
                      cardNamesById,
                    }),
                  )}
                  emptyLabel="Top deck not revealed"
                />
                <CardZone
                  title={`Board (${parsedView.board.length})`}
                  cards={parsedView.board.map((card, index) => {
                    const cardId = card.cardId ?? 'unknown'
                    return {
                      key: `${cardId}-${index}`,
                      name: resolveCardLabel({
                        cardId,
                        definitionId: card.definitionId ?? null,
                        instanceDefinitions: parsedView.instanceDefinitions,
                        cardNamesById,
                      }),
                      detail: [
                        card.position ? `Position: ${card.position}` : null,
                        typeof card.attack === 'number' ? `ATK ${card.attack}` : null,
                        typeof card.defense === 'number' ? `DEF ${card.defense}` : null,
                      ]
                        .filter((entry): entry is string => entry != null)
                        .join(' · '),
                    }
                  })}
                />
                <CardZone
                  title={`Spell/Trap (${parsedView.spellTrapZone.length})`}
                  cards={parsedView.spellTrapZone.map((card, index) => {
                    const cardId = card.cardId ?? 'unknown'
                    return {
                      key: `${cardId}-${index}`,
                      name: resolveCardLabel({
                        cardId,
                        definitionId: card.definitionId ?? null,
                        instanceDefinitions: parsedView.instanceDefinitions,
                        cardNamesById,
                      }),
                      detail: card.faceDown ? 'Set' : 'Face up',
                    }
                  })}
                />
                <CardZone
                  title="Field Spell"
                  cards={
                    parsedView.fieldSpell
                      ? [
                          {
                            key: parsedView.fieldSpell.cardId ?? 'field-spell',
                            name: resolveCardLabel({
                              cardId: parsedView.fieldSpell.cardId ?? 'field-spell',
                              definitionId: parsedView.fieldSpell.definitionId ?? null,
                              instanceDefinitions: parsedView.instanceDefinitions,
                              cardNamesById,
                            }),
                            detail: parsedView.fieldSpell.faceDown ? 'Set' : 'Face up',
                          },
                        ]
                      : []
                  }
                />
                <CardZone
                  title={`Opponent Board (${parsedView.opponentBoard.length})`}
                  cards={parsedView.opponentBoard.map((card, index) => {
                    const cardId = card.cardId ?? `opponent-${index}`
                    return {
                      key: cardId,
                      name: resolveCardLabel({
                        cardId,
                        definitionId: card.definitionId ?? null,
                        instanceDefinitions: parsedView.instanceDefinitions,
                        cardNamesById,
                      }),
                      detail: [
                        card.position ? `Position: ${card.position}` : null,
                        typeof card.attack === 'number' ? `ATK ${card.attack}` : null,
                        typeof card.defense === 'number' ? `DEF ${card.defense}` : null,
                      ]
                        .filter((entry): entry is string => entry != null)
                        .join(' · '),
                    }
                  })}
                />
                <CardZone
                  title={`Opponent Spell/Trap (${parsedView.opponentSpellTrapZone.length})`}
                  cards={parsedView.opponentSpellTrapZone.map((card, index) => {
                    const cardId = card.cardId ?? `opponent-spell-${index}`
                    return {
                      key: cardId,
                      name: resolveCardLabel({
                        cardId,
                        definitionId: card.definitionId ?? null,
                        instanceDefinitions: parsedView.instanceDefinitions,
                        cardNamesById,
                      }),
                      detail: card.faceDown ? 'Set' : 'Face up',
                    }
                  })}
                />
                <CardZone
                  title="Opponent Field Spell"
                  cards={
                    parsedView.opponentFieldSpell
                      ? [
                          {
                            key: parsedView.opponentFieldSpell.cardId ?? 'opponent-field-spell',
                            name: resolveCardLabel({
                              cardId: parsedView.opponentFieldSpell.cardId ?? 'opponent-field-spell',
                              definitionId: parsedView.opponentFieldSpell.definitionId ?? null,
                              instanceDefinitions: parsedView.instanceDefinitions,
                              cardNamesById,
                            }),
                            detail: parsedView.opponentFieldSpell.faceDown ? 'Set' : 'Face up',
                          },
                        ]
                      : []
                  }
                />
                <ZoneList
                  title={`Graveyard (${parsedView.graveyard.length})`}
                  items={parsedView.graveyard.map((cardId) =>
                    resolveCardLabel({
                      cardId,
                      definitionId: null,
                      instanceDefinitions: parsedView.instanceDefinitions,
                      cardNamesById,
                    }),
                  )}
                />
                <ZoneList
                  title={`Banished (${parsedView.banished.length})`}
                  items={parsedView.banished.map((cardId) =>
                    resolveCardLabel({
                      cardId,
                      definitionId: null,
                      instanceDefinitions: parsedView.instanceDefinitions,
                      cardNamesById,
                    }),
                  )}
                />
              </div>
            )}
          </article>

          <article className="rounded border border-stone-700/40 p-3 text-sm">
            <h2 className="text-xs uppercase tracking-wide text-stone-400">Action builders</h2>
            {!parsedView ? (
              <p className="mt-2 text-stone-400">Loading action context…</p>
            ) : (
              <div className="mt-2 grid gap-3 lg:grid-cols-2">
                <div className="rounded border border-stone-700/40 p-2 lg:col-span-2">
                  <p className="text-[11px] uppercase tracking-wide text-stone-400">
                    Legal move source
                  </p>
                  {legalMoves.isLoading ? (
                    <p className="mt-2 text-xs text-stone-500">Computing legal moves…</p>
                  ) : legalMoves.isError ? (
                    <p className="mt-2 text-xs text-rose-300">Failed to load legal moves.</p>
                  ) : (
                    <p className="mt-2 text-xs text-stone-300">
                      {parsedLegalMoves.length} legal moves available for this state.
                    </p>
                  )}
                </div>

                <div className="rounded border border-stone-700/40 p-2">
                  <p className="text-[11px] uppercase tracking-wide text-stone-400">From hand</p>
                  {handActionRows.length === 0 ? (
                    <p className="mt-2 text-xs text-stone-500">No cards in hand.</p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {handActionRows.map((row) => (
                        <li key={row.cardId} className="rounded border border-stone-700/40 p-2">
                          <p className="text-xs text-stone-200">{row.name}</p>
                          <p className="text-[11px] text-stone-500">
                            {row.cardType ?? 'unknown type'}
                          </p>
                          {row.legalMoves.length === 0 ? (
                            <p className="mt-2 text-[11px] text-stone-500">No legal hand actions.</p>
                          ) : (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {row.legalMoves.map((move, index) => (
                                <button
                                  key={`${row.cardId}-move-${index}`}
                                  onClick={() => {
                                    void submitLegalMove(move)
                                  }}
                                  disabled={actionBusy}
                                  className="rounded border border-stone-600 px-2 py-1 text-[11px] disabled:opacity-50"
                                >
                                  {describeLegalMove({
                                    move,
                                    instanceDefinitions: parsedView.instanceDefinitions,
                                    cardNamesById,
                                  })}
                                </button>
                              ))}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rounded border border-stone-700/40 p-2">
                  <p className="text-[11px] uppercase tracking-wide text-stone-400">Board controls</p>
                  {boardActionRows.length === 0 ? (
                    <p className="mt-2 text-xs text-stone-500">No monsters on board.</p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {boardActionRows.map((row) => (
                        <li key={row.key} className="rounded border border-stone-700/40 p-2">
                          <p className="text-xs text-stone-200">{row.name}</p>
                          <p className="text-[11px] text-stone-500">
                            {row.position ? `Position: ${row.position}` : 'Position unknown'}
                          </p>
                          {row.legalMoves.length === 0 ? (
                            <p className="mt-2 text-[11px] text-stone-500">No legal board actions.</p>
                          ) : (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {row.legalMoves.map((move, index) => (
                                <button
                                  key={`${row.key}-move-${index}`}
                                  onClick={() => {
                                    void submitLegalMove(move)
                                  }}
                                  disabled={actionBusy}
                                  className="rounded border border-stone-600 px-2 py-1 text-[11px] disabled:opacity-50"
                                >
                                  {describeLegalMove({
                                    move,
                                    instanceDefinitions: parsedView.instanceDefinitions,
                                    cardNamesById,
                                  })}
                                </button>
                              ))}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rounded border border-stone-700/40 p-2 lg:col-span-2">
                  <p className="text-[11px] uppercase tracking-wide text-stone-400">
                    Spell/Trap zone controls
                  </p>
                  {spellTrapActionRows.length === 0 ? (
                    <p className="mt-2 text-xs text-stone-500">No spell/trap cards in zone.</p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {spellTrapActionRows.map((row) => (
                        <li key={row.key} className="rounded border border-stone-700/40 p-2">
                          <p className="text-xs text-stone-200">{row.name}</p>
                          <p className="text-[11px] text-stone-500">
                            {row.cardType ?? 'unknown type'} · {row.faceDown ? 'set' : 'face up'}
                          </p>
                          {row.legalMoves.length === 0 ? (
                            <p className="mt-2 text-[11px] text-stone-500">No legal zone actions.</p>
                          ) : (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {row.legalMoves.map((move, index) => (
                                <button
                                  key={`${row.key}-move-${index}`}
                                  onClick={() => {
                                    void submitLegalMove(move)
                                  }}
                                  disabled={actionBusy}
                                  className="rounded border border-cyan-700/60 px-2 py-1 text-[11px] text-cyan-200 disabled:opacity-50"
                                >
                                  {describeLegalMove({
                                    move,
                                    instanceDefinitions: parsedView.instanceDefinitions,
                                    cardNamesById,
                                  })}
                                </button>
                              ))}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </article>

          <article className="rounded border border-stone-700/40 p-3 text-sm">
            <h2 className="text-xs uppercase tracking-wide text-stone-400">Chain prompt</h2>
            {openPrompt.isLoading ? (
              <p className="mt-2 text-stone-400">Checking prompt…</p>
            ) : openPrompt.isError ? (
              <p className="mt-2 text-rose-300">Failed to load open prompt.</p>
            ) : !openPrompt.data ? (
              <p className="mt-2 text-stone-400">No open prompt.</p>
            ) : (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-stone-300">
                  Prompt type: {(openPrompt.data as OpenPrompt).promptType ?? 'unknown'}
                </p>
                {chainPrompt ? (
                  <>
                    <p className="text-xs text-stone-400">
                      Last opposing chain card: {chainPrompt.opponentCardName ?? 'Unknown card'}
                    </p>
                    {chainLegalMoves.length === 0 ? (
                      <p className="text-xs text-stone-500">No legal chain responses right now.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {chainLegalMoves.map((move, index) => (
                          <button
                            key={`chain-move-${index}`}
                            onClick={() => {
                              void submitLegalMove(move)
                            }}
                            disabled={actionBusy}
                            className="rounded border border-cyan-700/60 px-3 py-1 text-xs text-cyan-200 disabled:opacity-50"
                          >
                            {describeLegalMove({
                              move,
                              instanceDefinitions: parsedView?.instanceDefinitions ?? {},
                              cardNamesById,
                            })}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <pre className="overflow-x-auto rounded border border-stone-700/40 p-2 text-xs text-stone-300">
                    {JSON.stringify(openPrompt.data, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </article>

          <article className="rounded border border-stone-700/40 p-3 text-sm">
            <h2 className="text-xs uppercase tracking-wide text-stone-400">Core actions</h2>
            {coreLegalMoves.length === 0 ? (
              <p className="mt-2 text-xs text-stone-500">No core actions legal in this state.</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {coreLegalMoves.map((move, index) => (
                  <button
                    key={`core-${move.type}-${index}`}
                    onClick={() => {
                      void submitLegalMove(move)
                    }}
                    disabled={actionBusy}
                    className={`rounded border px-3 py-1 text-xs disabled:opacity-50 ${
                      move.type === 'SURRENDER'
                        ? 'border-rose-700/60 text-rose-300'
                        : 'border-stone-600'
                    }`}
                  >
                    {describeLegalMove({
                      move,
                      instanceDefinitions: parsedView?.instanceDefinitions ?? {},
                      cardNamesById,
                    })}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-3 space-y-2">
              <p className="text-xs text-stone-400">Custom command JSON</p>
              <textarea
                value={customCommand}
                onChange={(event) => setCustomCommand(event.target.value)}
                rows={5}
                className="w-full rounded border border-stone-700/50 bg-stone-950/40 p-2 text-xs text-stone-200"
              />
              <button
                onClick={() => {
                  let parsed: Record<string, unknown>
                  try {
                    const next = JSON.parse(customCommand)
                    const record = asRecord(next)
                    if (!record) {
                      setActionMessage('Custom command must be a JSON object.')
                      return
                    }
                    parsed = record
                  } catch {
                    setActionMessage('Custom command is not valid JSON.')
                    return
                  }
                  void submitCommand(parsed, `${String(parsed.type ?? 'CUSTOM')} submitted.`)
                }}
                disabled={actionBusy}
                className="rounded border border-amber-700/60 px-3 py-1 text-xs text-amber-200 disabled:opacity-50"
              >
                Submit Custom Command
              </button>
            </div>

            {actionMessage ? <p className="mt-2 text-xs text-stone-300">{actionMessage}</p> : null}
          </article>

          <article className="rounded border border-stone-700/40 p-3 text-sm">
            <h2 className="text-xs uppercase tracking-wide text-stone-400">All legal moves</h2>
            {legalMoves.isLoading ? (
              <p className="mt-2 text-stone-400">Loading legal moves…</p>
            ) : legalMoves.isError ? (
              <p className="mt-2 text-rose-300">Failed to load legal moves.</p>
            ) : parsedLegalMoves.length === 0 ? (
              <p className="mt-2 text-stone-400">No legal moves available.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-xs">
                {parsedLegalMoves.map((move, index) => (
                  <li
                    key={`legal-${move.type}-${index}`}
                    className="rounded border border-stone-700/40 px-2 py-1 text-stone-300"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        {describeLegalMove({
                          move,
                          instanceDefinitions: parsedView?.instanceDefinitions ?? {},
                          cardNamesById,
                        })}
                      </span>
                      <button
                        onClick={() => {
                          void submitLegalMove(move)
                        }}
                        disabled={actionBusy}
                        className="rounded border border-stone-600 px-2 py-1 text-[11px] disabled:opacity-50"
                      >
                        Run
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="rounded border border-stone-700/40 p-3 text-sm">
            <h2 className="text-xs uppercase tracking-wide text-stone-400">Current chain stack</h2>
            {!parsedView ? (
              <p className="mt-2 text-stone-400">Loading chain state…</p>
            ) : parsedView.currentChain.length === 0 ? (
              <p className="mt-2 text-stone-400">No chain links active.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-xs">
                {parsedView.currentChain.map((link, index) => (
                  <li
                    key={`${link.cardId ?? 'link'}-${index}`}
                    className="rounded border border-stone-700/40 px-2 py-1 text-stone-300"
                  >
                    Link {index + 1}: {link.activatingPlayer ?? 'unknown'} ·{' '}
                    {link.cardId
                      ? resolveCardLabel({
                          cardId: link.cardId,
                          definitionId: null,
                          instanceDefinitions: parsedView.instanceDefinitions,
                          cardNamesById,
                        })
                      : 'unknown card'}
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="rounded border border-stone-700/40 p-3 text-sm">
            <h2 className="text-xs uppercase tracking-wide text-stone-400">Recent events</h2>
            {recentEvents.isLoading ? (
              <p className="mt-2 text-stone-400">Loading events…</p>
            ) : recentEvents.isError ? (
              <p className="mt-2 text-rose-300">Failed to load events.</p>
            ) : eventRows.length === 0 ? (
              <p className="mt-2 text-stone-400">No events yet.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-xs">
                {eventRows.map((row) => (
                  <li
                    key={`${row.version}:${row.createdAt}`}
                    className="rounded border border-stone-700/40 px-2 py-1 text-stone-300"
                  >
                    <span className="text-stone-500">v{row.version}</span>{' '}
                    <span className="text-stone-400">{row.seat}</span>{' '}
                    <span>{parseCommandType(row)}</span>{' '}
                    <span className="text-stone-500">({parseEventCount(row)} events)</span>
                  </li>
                ))}
              </ul>
            )}
          </article>

          {(meta.data as MatchMeta | undefined)?.mode === 'story' ? (
            <article className="rounded border border-stone-700/40 p-3 text-sm">
              <h2 className="text-xs uppercase tracking-wide text-stone-400">Story Context</h2>
              {storyContext.isLoading ? (
                <p className="mt-2 text-stone-400">Loading story context…</p>
              ) : storyContext.isError ? (
                <p className="mt-2 text-rose-300">Failed to load story context.</p>
              ) : (
                <pre className="mt-2 overflow-x-auto text-xs text-stone-300">
                  {JSON.stringify(storyContext.data, null, 2)}
                </pre>
              )}
            </article>
          ) : null}

          {parsedView?.gameOver ? (
            <article className="rounded border border-emerald-700/50 p-3 text-sm text-emerald-200">
              Match complete. Winner: {parsedView.winner ?? 'none'}
            </article>
          ) : null}
        </>
      )}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-stone-700/40 p-2">
      <p className="text-[10px] uppercase tracking-wide text-stone-500">{label}</p>
      <p className="text-sm text-stone-200">{value}</p>
    </div>
  )
}

function ZoneList({
  title,
  items,
  emptyLabel = 'No cards in this zone',
}: {
  title: string
  items: string[]
  emptyLabel?: string
}) {
  return (
    <div className="rounded border border-stone-700/40 p-2">
      <p className="text-[11px] uppercase tracking-wide text-stone-400">{title}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-xs text-stone-500">{emptyLabel}</p>
      ) : (
        <ul className="mt-2 space-y-1 text-xs text-stone-200">
          {items.map((item, index) => (
            <li key={`${item}-${index}`} className="truncate">
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CardZone({
  title,
  cards,
}: {
  title: string
  cards: Array<{ key: string; name: string; detail?: string }>
}) {
  return (
    <div className="rounded border border-stone-700/40 p-2">
      <p className="text-[11px] uppercase tracking-wide text-stone-400">{title}</p>
      {cards.length === 0 ? (
        <p className="mt-2 text-xs text-stone-500">No cards in this zone</p>
      ) : (
        <ul className="mt-2 space-y-1 text-xs text-stone-200">
          {cards.map((card) => (
            <li key={card.key}>
              <p>{card.name}</p>
              {card.detail ? <p className="text-stone-500">{card.detail}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
