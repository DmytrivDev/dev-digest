/* providers.tsx — client provider stack: React Query + Theme + active Repo. */
"use client";

import React from "react";
import {
  QueryClient,
  QueryClientProvider,
  QueryCache,
  MutationCache,
} from "@tanstack/react-query";
import { ThemeProvider } from "./theme";
import { RepoProvider } from "./repo-context";
import { ToastProvider, notify } from "./toast";
import { ApiError, describeApiError } from "./api";

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
        // Global error surfacing (errors anywhere → toast). Mutations always
        // toast (they are user actions). Queries only toast on network/5xx —
        // expected 4xx like a 404 "no tour yet" stay silent for inline empty states.
        queryCache: new QueryCache({
          onError: (err) => {
            const status = err instanceof ApiError ? err.status : 500;
            if (status === 0 || status >= 500) notify.error(describeApiError(err));
          },
        }),
        mutationCache: new MutationCache({
          // `meta: { quietError: true }` opts a mutation out of the toast. It
          // exists for calls whose 4xx is an ANSWER rather than a malfunction —
          // the conventions scan replies 422 "no clone"/"no index" and 429 for
          // its rate limit, and the page shows both in place with the server's
          // own wording. A system toast on top would read as a broken app.
          onError: (err, _vars, _ctx, mutation) => {
            if (mutation.meta?.quietError) return;
            notify.error(describeApiError(err));
          },
        }),
      })
  );
  return (
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <ToastProvider>
          <RepoProvider>{children}</RepoProvider>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
