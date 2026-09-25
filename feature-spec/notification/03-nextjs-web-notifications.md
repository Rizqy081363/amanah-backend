# Next.js Web Notification Integration

**Document 3 of 4 — Web Client Architecture**
Assumes the paradigm, vocabulary, and backend contract defined in `01-architecture-overview.md`. This document covers the **web presentation layer** — the pages/components that render notifications to a logged-in user in the browser. The API routes and server-side orchestration are covered in `04-backend-notifications.md`, even though both may live in the same Next.js codebase.

> **Note on structure:** In a Next.js App Router project, "the web interface" and "the backend" are often two halves of the same application (Server/Client Components vs. Route Handlers). This document deliberately treats them as separate architectural *concerns* regardless of whether they end up in one deployable or two — see Document 4 §2 for how the codebase is actually organized.

---

## 1. Role of the Web Client

Identical role to Flutter (Document 2) from the architecture's point of view: a presentation-layer consumer that holds a real-time connection for low-latency updates and falls back to REST for history and mutations. The web client has the added architectural wrinkles of **SSR** (the socket must never attempt to connect during server rendering) and **multi-tab** behavior (a user may have the same account open in several browser tabs simultaneously).

## 2. Responsibilities Owned vs. Not Owned

| Owns | Does not own |
|---|---|
| Establishing the socket connection client-side only, after auth is available | Recipient resolution, persistence, retry logic (all backend) |
| Cleaning up the connection on unmount/logout | Broker or queue infrastructure |
| Synchronizing notification state into the app's client-side cache | Deciding which channels a notification type uses |
| Preventing duplicate rendering across socket + fetch + multiple tabs | Generating idempotency keys |
| Read/unread UI state, optimistic updates | Being the source of truth for read state (the backend is) |

## 3. Connection Establishment

The socket must be created inside a **Client Component** (`'use client'`), never during server rendering — Next.js Server Components execute on the server per-request and have no notion of a persistent browser connection. The connection is established once, at the app-shell level (a layout-scoped provider), not per-page, so navigating between routes doesn't tear down and rebuild the socket.

```tsx
// app/providers/notification-provider.tsx
'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useSession } from '@/lib/auth/use-session'; // however auth/session is exposed client-side

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { session } = useSession();
  const socketRef = useRef<Socket | null>(null);
  const [state, dispatch] = useNotificationReducer();

  useEffect(() => {
    if (!session?.accessToken) return; // never connect unauthenticated

    const socket = io(process.env.NEXT_PUBLIC_REALTIME_GATEWAY_URL!, {
      transports: ['websocket'],
      auth: { token: session.accessToken },
      reconnection: true,
    });

    socket.on('notification:new', (n) => dispatch({ type: 'INCOMING', notification: n }));
    socket.on('notification:read', (n) => dispatch({ type: 'READ_SYNC', notification: n }));
    socket.on('connect', () => reconcile(dispatch)); // covers first-connect AND every reconnect
    socket.io.on('reconnect', () => reconcile(dispatch));

    socketRef.current = socket;

    return () => {
      socket.disconnect(); // critical: cleanup on unmount, session change, or logout
      socketRef.current = null;
    };
  }, [session?.accessToken]);

  return (
    <NotificationContext.Provider value={{ state, dispatch }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
```

Placing this provider once in the root client layout, above the page content, means every page and component simply calls `useNotifications()` — none of them know a socket exists at all.

## 4. Authentication Handshake for Sockets

Same principle as Flutter: the token travels in the Socket.IO `auth` payload at handshake time, verified server-side by the Realtime Gateway before the connection is accepted (Document 4, §9) — never as a follow-up message after an anonymous connection is already open. If the session's access token is refreshed mid-session (e.g. a rotating JWT), the effect above re-runs on token change, tearing down the old socket and establishing a freshly authenticated one, rather than trying to mutate an existing connection's credentials in place.

## 5. Subscription Initialization and Cleanup

- **Initialize**: once, at the provider level, gated on `session` being available — not per-component, to avoid dozens of components each opening their own socket.
- **Clean up**: the `useEffect` return function disconnects on unmount (route change out of the authenticated app shell) and, importantly, re-runs the whole effect (disconnect old, connect new) if `session.accessToken` changes — which naturally covers logout (`session` becomes `null`, socket disconnects, no reconnect attempted) without special-casing it.
- Components that only need to *read* notification state (a bell icon, a dropdown list) never call `io()` themselves — they consume `useNotifications()`, keeping the transport entirely inside the provider.

## 6. Notification State Synchronization

Two reasonable choices exist depending on what's already standard in the codebase; both are shown because the "right" one depends on existing conventions, not this document dictating a new dependency:

**Option A — React Query as the single cache**, with socket events manually written into the query cache so REST-fetched pages and socket-pushed items live in one place:

```tsx
function useIncomingNotificationSync() {
  const queryClient = useQueryClient();
  const { state } = useNotifications(); // the raw socket-delivered item

  useEffect(() => {
    if (!state.lastIncoming) return;
    queryClient.setQueryData(['notifications', 'unread-count'], (old: number = 0) => old + 1);
    queryClient.setQueryData(['notifications', 'list'], (old: NotificationPage[] = []) =>
      mergeById(old, state.lastIncoming)
    );
  }, [state.lastIncoming]);
}
```

**Option B — a dedicated reducer/context** (as sketched in §3) that owns notification state independently of whatever data-fetching library is used elsewhere in the app, with REST calls simply dispatching into the same reducer on resolution.

Either way, the architectural requirement is the same one from Document 1 §8.3: **the socket writes into the same cache that REST reads populate**, so there is exactly one notification list in memory, not two competing ones.

## 7. History Retrieval and Pagination

```tsx
function useNotificationHistory(unreadOnly = false) {
  return useInfiniteQuery({
    queryKey: ['notifications', 'list', { unreadOnly }],
    queryFn: ({ pageParam = 0 }) =>
      fetchNotifications({ page: pageParam, unreadOnly }), // hits the REST contract, Doc 4 §10
    getNextPageParam: (lastPage) => lastPage.nextPage,
  });
}
```

This is a plain REST call against the backend's paginated endpoint — nothing transport-specific leaks into this hook. A component rendering the notification center calls `useNotificationHistory()` and `useNotifications()` together and has no idea one is REST and the other is a live socket feed.

## 8. Read/Unread State and Optimistic Updates

```tsx
function useMarkAsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markNotificationRead(id), // REST PATCH
    onMutate: async (id) => {
      // optimistic: flip read state in the cache immediately
      queryClient.setQueryData(['notifications', 'list'], (old) => flipRead(old, id));
      queryClient.setQueryData(['notifications', 'unread-count'], (c: number) => Math.max(0, c - 1));
    },
    onError: (_err, id, context) => {
      // roll back on failure; the next reconcile/fetch will correct any lingering drift
      queryClient.invalidateQueries(['notifications']);
    },
  });
}
```

Writes always go to REST, exactly as in the Flutter client — the socket is read-only from the client's perspective (Document 1 §5, §7 confirms the gateway is a push-only surface toward clients for this purpose; the only client→server socket traffic is the implicit handshake/heartbeat Socket.IO manages itself).

## 9. Duplicate Prevention

Because a socket push and a REST page fetch can both deliver the same notification (e.g., the user was mid-pagination when a live event arrived), all merges into the shared cache are keyed by the server-assigned notification `id` — `mergeById` above is a `Map`-based upsert, not an array `push`, which makes the merge naturally idempotent regardless of ordering or how many times the same item is seen.

## 10. Multi-Tab Considerations

A user may have several tabs open, each independently holding its own socket connection and each joined to the same `user:{userId}` room server-side (Document 1 §5, §7 — Socket.IO rooms broadcast to *every* socket in the room, which includes every open tab and every device). This is desirable, not a bug: opening a notification in one tab and marking it read triggers the `notification:read` sync event, which every other open tab receives and applies, keeping unread counts consistent across tabs without any tab-to-tab communication (`BroadcastChannel`, etc.) needing to be built separately.

## 11. Decoupling Checklist

- [ ] No page or non-provider component imports `socket.io-client` directly.
- [ ] The socket connection is created only inside a Client Component, gated on an authenticated session.
- [ ] The `useEffect` establishing the socket has a cleanup function that disconnects it.
- [ ] Every `connect`/`reconnect` event triggers a reconciliation fetch (§3), not just the initial mount.
- [ ] All write operations (mark read, mark all read) go through REST endpoints, never socket emits.
- [ ] Notification merges anywhere in the cache are keyed by server-assigned `id`.
- [ ] The notification center renders correctly with the socket entirely disconnected (e.g., gateway temporarily down) by falling back to REST-only data.
