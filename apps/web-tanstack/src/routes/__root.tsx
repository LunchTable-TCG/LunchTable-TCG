/// <reference types="vite/client" />
import {
  HeadContent,
  Link,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { ConvexProvider } from 'convex/react'
import * as React from 'react'
import { DefaultCatchBoundary } from '~/components/DefaultCatchBoundary'
import { NotFound } from '~/components/NotFound'
import appCss from '~/styles/app.css?url'
import type { RouterContext } from '~/routerContext'

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      { title: 'LTCG TanStack Migration' },
      {
        name: 'description',
        content:
          'Initial TanStack Start migration shell for LunchTable TCG with Convex integration.',
      },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.ico' },
    ],
  }),
  errorComponent: DefaultCatchBoundary,
  notFoundComponent: () => <NotFound />,
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  const { queryClient, convexQueryClient, convexConfigured } =
    Route.useRouteContext()

  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <ConvexProvider client={convexQueryClient.convexClient}>
            <div className="p-4 flex flex-col gap-4">
              <header className="flex items-center justify-between border-b border-stone-700/30 pb-2">
                <div className="flex items-center gap-4">
                  <Link
                    to="/"
                    activeProps={{ className: 'font-bold' }}
                    activeOptions={{ exact: true }}
                    className="text-lg"
                  >
                    LTCG TanStack Migration
                  </Link>
                  <Link
                    to="/cards"
                    activeProps={{ className: 'font-semibold text-stone-100' }}
                    className="text-sm text-stone-400"
                  >
                    Cards
                  </Link>
                </div>
                <span
                  className={`text-xs uppercase tracking-wide ${
                    convexConfigured ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {convexConfigured ? 'Convex connected' : 'Convex not configured'}
                </span>
              </header>
              {children}
            </div>
            <TanStackRouterDevtools position="bottom-right" />
            <Scripts />
          </ConvexProvider>
        </QueryClientProvider>
      </body>
    </html>
  )
}
