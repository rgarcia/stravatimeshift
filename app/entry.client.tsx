/**
 * By default, Remix will handle hydrating your app on the client for you.
 * You are free to delete this file if you'd like to, but if you ever want it revealed again, you can run `npx remix reveal` ✨
 * For more information, see https://remix.run/docs/en/main/file-conventions/entry.client
 */
import { RemixBrowser, useLocation, useMatches } from "@remix-run/react";
/*eslint import/namespace: [2, { allowComputed: true }]*/
import * as Sentry from "@sentry/remix";
import { startTransition, StrictMode, useEffect } from "react";
import { hydrateRoot } from "react-dom/client";

Sentry.init({
  dsn: "https://fd1058aa18c9a929cb04274a38820cb1@o4506321455939584.ingest.sentry.io/4506321456136192",
  tracesSampleRate: 1,
  replaysSessionSampleRate: 1, // move to 0.1 once we're further along
  replaysOnErrorSampleRate: 1,

  integrations: [
    // eslint-disable-next-line
    new Sentry.BrowserTracing({
      routingInstrumentation: Sentry.remixRouterInstrumentation(
        useEffect,
        useLocation,
        useMatches,
      ),
    }),
    // eslint-disable-next-line
    new Sentry.Replay(),
  ],
});

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <RemixBrowser />
    </StrictMode>,
  );
});
