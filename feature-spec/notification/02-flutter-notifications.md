# Flutter Notification Integration

**Document 2 of 4 — Mobile Client Architecture**
Assumes the paradigm, vocabulary, and backend contract defined in `01-architecture-overview.md`. This document does not redefine the event bus, broker, or reliability model — it describes how the Flutter client participates in them as a consumer.

---

## 1. Role of the Flutter Client in the Overall Architecture

Flutter is a **presentation-layer consumer** of a stable notification contract. It sits at the far right of the system diagram in Document 1: it holds an authenticated WebSocket connection to the Realtime Gateway for low-latency push, and it calls REST endpoints against the backend for history, pagination, and read-state mutation. It has no knowledge of Redis, Postgres, the Notification Worker, or how recipients are resolved — those are backend concerns entirely.

## 2. Responsibilities Flutter Owns vs. Does Not Own

| Owns | Does not own |
|---|---|
| Maintaining a live socket connection while the app is usable | Deciding *who* a notification's recipient is |
| Reacting to app lifecycle transitions (foreground/background) | Persisting notifications durably (source of truth is the backend) |
| Local, in-memory/cached notification state for fast UI rendering | Retry logic for failed deliveries |
| Deduplicating notifications arriving from two sources (push + fetch) | Generating idempotency keys |
| Displaying local system notifications while foregrounded | Deciding which channels (in-app/push/email) a notification type uses |
| Requesting missed notifications after reconnect | Broker/queue infrastructure of any kind |

## 3. Recommended Packages

Per your instruction to use mature libraries rather than reinventing low-level mechanisms:

| Concern | Package | Why |
|---|---|---|
| Real-time transport client | `socket_io_client` | Matches the Socket.IO server chosen in Document 1/4; handles reconnection, acks, rooms transparently |
| State management | `flutter_riverpod` (or `flutter_bloc` if that's already the project's standard) | Testable, supports dependency injection of the repository interface described below |
| REST networking | `dio` | Interceptors for auth token attachment/refresh, cancellation, typed error handling |
| Background/killed-state push | `firebase_messaging` | Delivers notifications when the socket cannot realistically stay open (app backgrounded/killed) — this is the `push` channel adapter's client-side counterpart from Document 4 |
| Local notification display | `flutter_local_notifications` | Shows a system notification when a socket-delivered event arrives while the app is foregrounded but the user isn't looking at the relevant screen |
| Connectivity awareness | `connectivity_plus` | Used to avoid futile reconnect attempts while genuinely offline, and to trigger reconciliation fetch on connectivity restoration |
| Lifecycle observation | `WidgetsBindingObserver` (Flutter SDK, no package needed) | Drives the foreground/background socket policy in §7 |

## 4. Internal Layering

The Flutter app applies the same ports-and-adapters discipline internally that the backend applies — this is what lets it swap Socket.IO for something else later without touching a single UI widget:

```
lib/
  notifications/
    domain/
      notification.dart                 // plain model, no transport knowledge
      notification_repository.dart      // abstract interface (the "port")
    data/
      remote_notification_repository.dart // implements the interface
      notification_socket_service.dart    // wraps socket_io_client entirely
      notification_api_client.dart        // wraps dio REST calls
    presentation/
      notification_provider.dart        // Riverpod StateNotifier / Bloc
      notification_bell_widget.dart
      notification_list_screen.dart
```

```dart
// domain/notification_repository.dart — the abstraction every widget/provider depends on
abstract class NotificationRepository {
  Stream<AppNotification> watchIncoming();          // live push events
  Future<List<AppNotification>> fetchHistory({
    required int page,
    bool unreadOnly = false,
  });
  Future<int> fetchUnreadCount();
  Future<void> markAsRead(String notificationId);
  Future<void> markAllAsRead();
}
```

No widget, provider, or business-logic class ever imports `socket_io_client` or `dio` directly — only `RemoteNotificationRepository` does. If the transport later changed (e.g., to a push-only model, or a different socket library), only the `data/` folder changes.

## 5. Connection Lifecycle

1. **Never connect before authentication.** The socket is created only once a valid session/JWT exists.
2. **Auth is passed at handshake, not as a message after connecting** — the Realtime Gateway (Document 4, §9) verifies the token during the handshake and rejects the connection outright if invalid, rather than accepting an anonymous socket and authenticating later.

```dart
class NotificationSocketService {
  IO.Socket? _socket;

  void connect(String authToken) {
    _socket = IO.io(
      gatewayUrl,
      IO.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': authToken})
          .enableReconnection()
          .setReconnectionAttempts(double.infinity as int) // effectively unbounded, backoff-governed
          .build(),
    );

    _socket!.onConnect((_) => _onConnected());
    _socket!.onDisconnect((_) => _onDisconnected());
    _socket!.onReconnect((_) => _onReconnected());
    _socket!.on('notification:new', (data) => _handleIncoming(data));
    _socket!.on('notification:read', (data) => _handleReadSync(data));
  }

  void disconnect() => _socket?.disconnect();
}
```

3. **No client-specified room joins.** The client never tells the server "put me in room X." The Realtime Gateway derives the user's identity from the verified token and joins the socket to `user:{userId}` server-side. This prevents a compromised or buggy client from subscribing to another user's notifications.

## 6. Subscription and Reconnection Handling

Socket.IO's client handles the mechanics of reconnection (exponential backoff, transport fallback) automatically — the architectural responsibility left to the app is **what to do when a reconnection succeeds**, since messages that would have arrived while disconnected are simply gone (per Document 1 §8.3, the socket is not a durable channel):

```dart
void _onReconnected() {
  final lastSeen = _localCache.lastSeenTimestamp;
  _repository.fetchHistory(sinceTimestamp: lastSeen).then((missed) {
    _notificationProvider.mergeMissed(missed);
  });
}
```

This reconciliation call is not optional — it is the mechanism that guarantees correctness across any gap in connectivity, no matter how it was caused (app backgrounded, network drop, server restart, gateway redeploy).

## 7. Foreground / Background / Killed State Handling

| App state | Socket policy | Delivery mechanism |
|---|---|---|
| **Foreground** | Connected | Real-time push over Socket.IO; shown via in-app UI update, optionally a local system notification (`flutter_local_notifications`) if the relevant screen isn't visible |
| **Background (briefly, e.g. app-switcher)** | Kept connected for a short grace period (tens of seconds), then disconnected | Real-time if still connected; otherwise falls to push |
| **Background (extended) / Killed** | Disconnected — a WebSocket cannot realistically survive OS process suspension or termination | **FCM push notification** (the `push` channel adapter from Document 4), delivered by the OS notification tray outside the app process entirely |

```dart
class AppLifecycleNotificationHandler extends WidgetsBindingObserver {
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    switch (state) {
      case AppLifecycleState.resumed:
        socketService.connect(currentAuthToken);
        // Always reconcile on resume, even if the socket reconnects cleanly —
        // covers the case where the app was killed and relaunched, not just backgrounded.
        notificationProvider.reconcile();
        break;
      case AppLifecycleState.paused:
      case AppLifecycleState.detached:
        socketService.scheduleGracefulDisconnect();
        break;
      default:
        break;
    }
  }
}
```

This two-channel design (Socket.IO while active, FCM while not) is the standard mobile pattern precisely because it avoids the battery and OS-background-execution problems of trying to keep a socket alive indefinitely — and it requires zero backend changes beyond the `push` adapter already defined as a first-class channel in Document 1's adapter table.

## 8. Notification State Management

State is fed from three independent sources and must be merged, not simply concatenated:

1. Real-time socket events (`notification:new`) — prepend + increment unread count.
2. REST fetch (initial load, pull-to-refresh, pagination, reconciliation after reconnect).
3. Local mutations (marking read) that must reflect immediately (optimistic) while the REST call confirms in the background.

```dart
class NotificationState extends StateNotifier<NotificationListState> {
  NotificationState(this._repo) : super(NotificationListState.initial()) {
    _repo.watchIncoming().listen(_mergeIncoming);
  }

  final NotificationRepository _repo;

  void _mergeIncoming(AppNotification n) {
    if (state.byId.containsKey(n.id)) return; // dedup: id is the merge key
    state = state.copyWith(
      items: [n, ...state.items],
      byId: {...state.byId, n.id: n},
      unreadCount: n.readAt == null ? state.unreadCount + 1 : state.unreadCount,
    );
  }

  Future<void> markAsRead(String id) async {
    // optimistic update first
    _applyReadLocally(id);
    try {
      await _repo.markAsRead(id);
    } catch (_) {
      _revertReadLocally(id); // reconcile with next fetch if this ever fails silently
    }
  }
}
```

Deduplication by notification `id` (assigned server-side, globally unique) is what makes it safe for the same notification to arrive via both an initial REST fetch *and* a subsequent real-time push without producing a visible duplicate.

## 9. Fetching History and Pagination

Standard cursor or offset pagination against the REST contract defined in Document 4 (`GET /api/notifications?page=&unreadOnly=`). The repository interface deliberately exposes this as a plain paginated fetch — the UI layer (e.g., an infinite-scroll list) has no idea whether the data underneath came from a cache, a fresh network call, or was merged with a socket push; it only ever sees `List<AppNotification>`.

## 10. Read/Unread Synchronization

`markAsRead` and `markAllAsRead` are REST mutations (`PATCH /api/notifications/:id/read`), never socket emissions from the client — writes go through the authenticated REST surface, which is easier to secure, log, and rate-limit than accepting write operations over the socket. The *result* of that write is then broadcast back out over the real-time channel (`notification:read`) so that a second device belonging to the same user (e.g., tablet + phone both logged in) reflects the read state without a manual refresh — this is the multi-device sync mentioned in Document 1 §5.

## 11. Decoupling Checklist

Before this integration is considered complete, verify:

- [ ] No widget or Riverpod/Bloc provider imports `socket_io_client` or `dio` directly.
- [ ] The socket is never connected without a valid auth token.
- [ ] No client code ever tells the server which "room" to join.
- [ ] Every reconnect triggers a reconciliation fetch against REST.
- [ ] Read-state writes go through REST, not the socket.
- [ ] Notification merging is keyed by server-assigned `id`, not insertion order or timestamp.
- [ ] The app degrades correctly with the socket fully absent (e.g. airplane mode) — the history screen still works via REST once connectivity returns.
