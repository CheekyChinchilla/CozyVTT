# CozyVTT WebSocket Documentation

**Last Updated:** 2026-04-08
**Protocol Version:** 2.0

## Table of Contents

1. [Overview](#overview)
2. [Connection Setup](#connection-setup)
3. [Authentication](#authentication)
4. [Event Reference](#event-reference)
5. [Token Movement — a worked example](#token-movement--a-worked-example)
6. [Error Handling](#error-handling)
7. [Client Examples](#client-examples)
8. [Testing](#testing)
9. [Event Inventory](#event-inventory)

---

## Overview

CozyVTT uses Socket.io for real-time bidirectional communication between clients and server. WebSocket connections enable features like:

- Real-time token movement
- Dice roll synchronization (public and secret rolls)
- In-game chat
- Map switching and token CRUD
- Wall segment management (add, remove, bulk operations)
- Spirit layer control and per-token visibility
- Initiative tracker (combat state, turn advancement)
- Session lifecycle (start, pause, resume, end)
- Vibe tracker updates
- Atmosphere effects and ambient audio
- Character HP updates

### Architecture

```
┌─────────────────┐         WebSocket         ┌─────────────────┐
│                 │ ◄─────────────────────────► │                 │
│  Client A (DM)  │         Socket.io          │  CozyVTT Server │
│                 │ ◄─────────────────────────► │                 │
└─────────────────┘                             └─────────────────┘
                                                         ▲
                                                         │
                                                         │
                                                         ▼
                                                ┌─────────────────┐
                                                │  Client B       │
                                                │  (Player)       │
                                                └─────────────────┘
```

### Room Structure

**User Rooms:**
- Each user has a personal room (userId)
- Allows direct messages to specific users
- Persists across multiple tabs

**Campaign Rooms:**
- Each campaign has a room (campaignId)
- Members join via `authenticate` event
- Used for broadcasting game events

---

## Connection Setup

### Client-Side Connection

```javascript
import io from 'socket.io-client';

// IMPORTANT: Must be logged in via REST API first
// Session cookie required for authentication

const socket = io('http://localhost:4000', {
  withCredentials: true,  // Send session cookie
  transports: ['websocket', 'polling']
});

// Connection established
socket.on('connect', () => {
  console.log('Connected:', socket.id);
});

// Server acknowledges connection
socket.on('connected', (data) => {
  console.log('User ID:', data.userId);
  console.log('Timestamp:', data.timestamp);
});

// Connection errors
socket.on('connect_error', (error) => {
  console.error('Connection failed:', error.message);
});

// Disconnection
socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
});
```

### Prerequisites

1. **Login via REST API:**
```javascript
const response = await fetch('http://localhost:4000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include', // Important!
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'password123'
  })
});
```

2. **Obtain session cookie:**
- Cookie name: `cozyvtt.sid`
- Automatically sent with WebSocket handshake if `withCredentials: true`

3. **Connect to WebSocket:**
```javascript
const socket = io('http://localhost:4000', {
  withCredentials: true
});
```

---

## Authentication

### Campaign Authentication

Before sending/receiving game events, authenticate to a campaign:

```javascript
socket.emit('authenticate', {
  campaignId: 'campaign-uuid-here'
});

// Success
socket.on('authenticated', (data) => {
  console.log('Authenticated to campaign:', data.campaignId);
  console.log('Your role:', data.role); // DM, PLAYER, or SPECTATOR
});

// Error
socket.on('error', (data) => {
  console.error('Authentication failed:', data.message);
});
```

### Authentication Flow

```
1. Client emits 'authenticate' with campaignId
2. Server validates:
   - User is logged in (session exists)
   - User is member of campaign
3. Server joins socket to campaign room
4. Server attaches campaignId and role to socket
5. Server emits 'authenticated' to client
6. Server broadcasts 'user.joined' to other campaign members
```

### Permission Checks

All game events require campaign authentication:
- Token movement
- Dice rolls
- Chat messages
- Map changes

Specific events also check role:
- DM can move any token
- Player can only move tokens they control
- Spectator is read-only

---

## Event Reference

The connection, authentication and presence events, with their payloads.
For every other event, see the [Event Inventory](#event-inventory).

### Connection Events

#### `connected`
**Direction:** Server → Client
**When:** After successful WebSocket connection
**Payload:**
```typescript
{
  userId: string;      // Your user ID
  timestamp: string;   // ISO 8601 timestamp
}
```

#### `disconnect`
**Direction:** Server → Client (automatic)
**When:** Connection lost
**Reason:** String explaining why (e.g., "transport close", "client namespace disconnect")

---

### Authentication Events

#### `authenticate`
**Direction:** Client → Server
**Purpose:** Join a campaign room
**Payload:**
```typescript
{
  campaignId: string;  // UUID of campaign to join
}
```
**Response:** `authenticated` or `error`

#### `authenticated`
**Direction:** Server → Client
**When:** Successfully joined campaign
**Payload:**
```typescript
{
  userId: string;
  campaignId: string;
  role: 'DM' | 'PLAYER' | 'SPECTATOR';
  timestamp: string;
}
```

#### `user.joined`
**Direction:** Server → All Campaign Members (except sender)
**When:** User authenticates to campaign
**Payload:**
```typescript
{
  userId: string;
  timestamp: string;
}
```

#### `user.left`
**Direction:** Server → All Campaign Members
**When:** User disconnects
**Payload:**
```typescript
{
  userId: string;
  timestamp: string;
}
```

> **Note:** neither `user.joined` nor `user.left` writes a chat message any more.
> They used to, and because they fire on every socket authentication and every
> disconnect — so on each page load, refresh and momentary drop — the chat log
> filled with notices. Presence is reported by `presence.state` instead.

#### `presence.state`
**Direction:** Server → All Campaign Members
**When:** Anyone joins or leaves, and in reply to `presence.request`
**Payload:**
```typescript
{
  campaignId: string;
  onlineUserIds: string[];   // distinct users with at least one live socket
}
```

The **whole set** is sent rather than a join/leave delta, so a client that missed
an event cannot drift out of step. A user may hold several sockets at once (two
tabs); they appear once in the list and stay in it until their last socket goes,
which is why this is derived from room membership rather than a counter.

#### `presence.request`
**Direction:** Client → Server
**Purpose:** Ask for the current set — for a view that mounted after the last
push and would otherwise show everyone offline until somebody moved.
**Payload:** None. The reply goes to the requesting socket alone.

---

### Heartbeat Events

#### `ping`
**Direction:** Client → Server
**Purpose:** Check connection health
**Payload:** None

#### `pong`
**Direction:** Server → Client
**Purpose:** Respond to ping
**Payload:**
```typescript
{
  timestamp: string;
}
```

---

### Error Events

#### `error`
**Direction:** Server → Client
**When:** Any operation fails
**Payload:**
```typescript
{
  message: string;  // Human-readable error message
}
```

**Common Errors:**
- "Unauthorized" - Not logged in
- "Not authenticated to a campaign" - Must call `authenticate` first
- "You do not have permission to move this token" - Permission denied
- "Token position out of bounds" - Invalid coordinates
- "Map not found" - Invalid map ID

---

## Token Movement — a worked example

The one subsystem documented end to end, kept because the three-event
start/move/end flow is the pattern the others follow. It is not the only
subsystem; see the [Event Inventory](#event-inventory) for the full list.

### Event Flow

```
┌─────────────────────────────────────────────────────────────┐
│                 Token Movement Lifecycle                     │
└─────────────────────────────────────────────────────────────┘

1. token.move.start
   ↓
   Client begins dragging token
   Server validates permission
   Server broadcasts to others

2. token.move (many times, throttled to 60fps)
   ↓
   Client sends position updates
   Server validates bounds
   Server broadcasts to others

3. token.move.end
   ↓
   Client finishes dragging
   Server validates permission & bounds
   Server updates database
   Server broadcasts final position to ALL (including sender)
```

### token.move.start

**Direction:** Client → Server
**Purpose:** Signal that user is starting to drag a token
**Payload:**
```typescript
{
  tokenId: string;  // UUID of token
  mapId: string;    // UUID of map
}
```

**Permission:**
- DM can move any token
- Player can move tokens where `controlledBy === userId`
- Spectator cannot move tokens

**Broadcast:** `token.move.start` to campaign members (excluding sender)
**Broadcast Payload:**
```typescript
{
  tokenId: string;
  mapId: string;
  movedBy: string;  // userId of person moving token
}
```

**Example:**
```javascript
socket.emit('token.move.start', {
  tokenId: 'token-123',
  mapId: 'map-456'
});

// Other clients receive:
socket.on('token.move.start', (data) => {
  console.log(`${data.movedBy} started moving token ${data.tokenId}`);
  // Show drag indicator on UI
});
```

---

### token.move

**Direction:** Client → Server
**Purpose:** Update token position during drag
**Throttling:** 60 updates per second maximum (16ms interval)
**Payload:**
```typescript
{
  tokenId: string;
  mapId: string;
  x: number;        // New X coordinate
  y: number;        // New Y coordinate
}
```

**Validation:**
- Coordinates must be numbers
- X must be >= 0 and < map.width
- Y must be >= 0 and < map.height
- Invalid data silently ignored during rapid updates

**Broadcast:** `token.moved` to campaign members (excluding sender)
**Broadcast Payload:**
```typescript
{
  tokenId: string;
  mapId: string;
  x: number;
  y: number;
  movedBy: string;
}
```

**Throttling Implementation:**
```typescript
// Server-side (lodash)
const handleTokenMove = throttle(async (socket, data) => {
  // Validate and broadcast
}, 16); // 16ms = ~60fps

socket.on('token.move', (data) => {
  handleTokenMove(socket, data);
});
```

**Client-Side Best Practice:**
```javascript
// Send updates on every mouse move
function onMouseMove(event) {
  const x = event.clientX;
  const y = event.clientY;

  socket.emit('token.move', {
    tokenId: currentToken.id,
    mapId: currentMap.id,
    x,
    y
  });

  // Server throttles to 60fps automatically
  // Client can send as fast as needed
}

// Receive updates from others
socket.on('token.moved', (data) => {
  if (data.movedBy !== myUserId) {
    updateTokenPosition(data.tokenId, data.x, data.y);
  }
});
```

---

### token.move.end

**Direction:** Client → Server
**Purpose:** Finalize token position and save to database
**Payload:**
```typescript
{
  tokenId: string;
  mapId: string;
  x: number;        // Final X coordinate
  y: number;        // Final Y coordinate
}
```

**Permission:**
- Same as `token.move.start`
- DM can move any token
- Player can only move assigned tokens

**Validation:**
- Coordinates must be numbers
- Position must be within map bounds
- Token must exist
- User must have permission

**Database Update:**
- Updates `Map.tokens` JSON array
- Persists final position

**Broadcast:** `token.move.end` to ALL campaign members (including sender)
**Broadcast Payload:**
```typescript
{
  tokenId: string;
  mapId: string;
  x: number;
  y: number;
  movedBy: string;
}
```

**Why broadcast to sender?**
Provides confirmation that database update succeeded. Client can use this to:
- Remove "saving..." indicator
- Revert if position doesn't match expected
- Handle optimistic UI updates

**Example:**
```javascript
// Client finishes drag
function onMouseUp(event) {
  const finalX = event.clientX;
  const finalY = event.clientY;

  socket.emit('token.move.end', {
    tokenId: currentToken.id,
    mapId: currentMap.id,
    x: finalX,
    y: finalY
  });

  // Show "Saving..." indicator
  showSavingIndicator();
}

// Receive confirmation
socket.on('token.move.end', (data) => {
  // Remove "Saving..." indicator
  hideSavingIndicator();

  // Update UI with final position
  setTokenPosition(data.tokenId, data.x, data.y);

  console.log('Token saved:', data);
});
```

---

## Error Handling

### Connection Errors

```javascript
socket.on('connect_error', (error) => {
  if (error.message === 'Unauthorized') {
    // Not logged in - redirect to login
    window.location.href = '/login';
  } else {
    // Network error - show retry UI
    showConnectionError();
  }
});
```

### Permission Errors

```javascript
socket.on('error', (data) => {
  switch (data.message) {
    case 'You do not have permission to move this token':
      alert('You can only move your own tokens');
      break;
    case 'Spectators cannot move tokens':
      alert('Spectators have read-only access');
      break;
    case 'Not authenticated to a campaign':
      // Re-authenticate
      socket.emit('authenticate', { campaignId: currentCampaignId });
      break;
    default:
      console.error('Error:', data.message);
  }
});
```

### Validation Errors

```javascript
socket.on('error', (data) => {
  if (data.message === 'Token position out of bounds') {
    // Revert to last valid position
    revertTokenPosition(currentToken);
  }
});
```

### Disconnection Handling

```javascript
socket.on('disconnect', (reason) => {
  if (reason === 'io server disconnect') {
    // Server kicked us - probably session expired
    window.location.href = '/login';
  } else {
    // Network issue - auto-reconnect
    showReconnectingIndicator();
  }
});

socket.on('reconnect', (attemptNumber) => {
  console.log('Reconnected after', attemptNumber, 'attempts');

  // Re-authenticate to campaign
  socket.emit('authenticate', { campaignId: currentCampaignId });

  hideReconnectingIndicator();
});
```

---

## Client Examples

### React Hook Example

```typescript
import { useEffect, useState } from 'react';
import io, { Socket } from 'socket.io-client';

export function useWebSocket(campaignId: string) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    const newSocket = io('http://localhost:4000', {
      withCredentials: true
    });

    newSocket.on('connect', () => {
      setConnected(true);

      // Authenticate to campaign
      newSocket.emit('authenticate', { campaignId });
    });

    newSocket.on('authenticated', (data) => {
      console.log('Authenticated as', data.role);
      setAuthenticated(true);
    });

    newSocket.on('disconnect', () => {
      setConnected(false);
      setAuthenticated(false);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [campaignId]);

  return { socket, connected, authenticated };
}
```

### Token Movement Hook

```typescript
export function useTokenMovement(socket: Socket | null, mapId: string) {
  const moveToken = useCallback((tokenId: string, x: number, y: number) => {
    if (!socket) return;

    socket.emit('token.move', {
      tokenId,
      mapId,
      x,
      y
    });
  }, [socket, mapId]);

  const startMove = useCallback((tokenId: string) => {
    if (!socket) return;

    socket.emit('token.move.start', {
      tokenId,
      mapId
    });
  }, [socket, mapId]);

  const endMove = useCallback((tokenId: string, x: number, y: number) => {
    if (!socket) return;

    socket.emit('token.move.end', {
      tokenId,
      mapId,
      x,
      y
    });
  }, [socket, mapId]);

  // Listen for token movements from others
  useEffect(() => {
    if (!socket) return;

    socket.on('token.moved', (data) => {
      // Update token position in state
      updateTokenPosition(data.tokenId, data.x, data.y);
    });

    socket.on('token.move.end', (data) => {
      // Final position confirmed
      confirmTokenPosition(data.tokenId, data.x, data.y);
    });

    return () => {
      socket.off('token.moved');
      socket.off('token.move.end');
    };
  }, [socket]);

  return { startMove, moveToken, endMove };
}
```

---

## Testing

### Interactive Test Client

Access the WebSocket test client at:
```
http://localhost:4000/websocket-test
```

**Test Steps:**
1. Login via REST API
2. Connect to WebSocket
3. Authenticate to campaign
4. Test token movement

### Manual Testing with Browser Console

```javascript
// 1. Login first via REST API
const loginResponse = await fetch('http://localhost:4000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    email: 'admin@cozyvtt.local',
    password: 'admin123!'
  })
});

// 2. Load Socket.io client
const script = document.createElement('script');
script.src = 'https://cdn.socket.io/4.7.2/socket.io.min.js';
document.head.appendChild(script);

// 3. Connect
const socket = io('http://localhost:4000', {
  withCredentials: true
});

// 4. Authenticate
socket.emit('authenticate', {
  campaignId: 'your-campaign-id'
});

// 5. Move token
socket.emit('token.move.start', {
  mapId: 'map-id',
  tokenId: 'token-id'
});

socket.emit('token.move', {
  mapId: 'map-id',
  tokenId: 'token-id',
  x: 100,
  y: 200
});

socket.emit('token.move.end', {
  mapId: 'map-id',
  tokenId: 'token-id',
  x: 100,
  y: 200
});

// Listen for events
socket.on('token.moved', (data) => console.log('Moved:', data));
socket.on('error', (data) => console.error('Error:', data));
```

### Multi-Tab Testing

1. Open two browser tabs
2. Tab 1: Login as DM
3. Tab 2: Login as Player
4. Both: Connect to WebSocket
5. Both: Authenticate to same campaign
6. Tab 1: Move token → Tab 2 should see update
7. Tab 2: Try to move DM's token → Should get error
8. Tab 2: Move own token → Tab 1 should see update

---

## Best Practices

### Client-Side

1. **Always check socket exists before emitting:**
```javascript
if (socket && socket.connected) {
  socket.emit('event', data);
}
```

2. **Handle reconnection:**
```javascript
socket.on('reconnect', () => {
  // Re-authenticate to campaign
  socket.emit('authenticate', { campaignId });

  // Re-sync game state
  fetchCurrentGameState();
});
```

3. **Debounce user input, let server throttle:**
```javascript
// Don't throttle client-side
// Server handles throttling automatically
function onMouseMove(event) {
  socket.emit('token.move', { x: event.x, y: event.y });
}
```

4. **Optimistic UI updates:**
```javascript
function moveToken(tokenId, x, y) {
  // Update UI immediately
  updateTokenPositionLocally(tokenId, x, y);

  // Send to server
  socket.emit('token.move', { tokenId, x, y });

  // Server will confirm via broadcast
}
```

5. **Clean up listeners:**
```javascript
useEffect(() => {
  socket.on('event', handler);

  return () => {
    socket.off('event', handler);
  };
}, []);
```

### Server-Side

1. **Always validate permissions:**
```typescript
if (socket.role !== 'DM' && token.controlledBy !== socket.userId) {
  socket.emit('error', { message: 'Permission denied' });
  return;
}
```

2. **Validate data:**
```typescript
if (typeof x !== 'number' || typeof y !== 'number') {
  socket.emit('error', { message: 'Invalid coordinates' });
  return;
}
```

3. **Use throttling for rapid events:**
```typescript
import { throttle } from 'lodash';

const handler = throttle((socket, data) => {
  // Process event
}, 16); // 60fps
```

4. **Broadcast patterns:**
```typescript
// Exclude sender
socket.to(campaignId).emit('event', data);

// Include sender
io.to(campaignId).emit('event', data);
```

---

## Event Inventory

Every event the server listens for or emits. **This table is generated** from
the handlers in `backend/src/websocket/` — do not edit it by hand:

```bash
python scripts/websocket-events.py --write     # refresh it
python scripts/websocket-events.py --check     # fail if it is behind
```

It exists because the hand-written catalogue this replaced fell about half a
protocol behind: fog, walls, lights and map pings had no entry at all, while
token movement had two hundred lines. The sections above cover the handshake
and one subsystem in depth; this covers everything, shallowly.

Payload shapes are not generated. For those, read the handler named in the
right-hand column.

<!-- BEGIN GENERATED EVENTS -->

### Client → server

| Event | Who may send it | What it does |
| --- | --- | --- |
| `atmosphere.audio.set` | DM only | DM queues or stops ambient audio for all players. |
| `atmosphere.effect.set` | DM only | DM sets a visual particle overlay on the map canvas. |
| `authenticate` | Any member | — |
| `character.hp.update` | Any member | — |
| `chat.message` | Any member | User sends chat message. |
| `dice.clearHistory` | DM only | DM clears dice roll history (DM-only). |
| `dice.roll` | Any member | User rolls dice Validates expression, calculates result, saves to database, and broadcasts. |
| `dm:editing` | DM only | — |
| `fog:operation` | DM only | DM applies a fog operation (reveal/hide cells). |
| `fog:request_state` | Any member | Any campaign member requests current fog state on (re)join. |
| `initiative.add` | DM only | DM adds a token to the combatant list. |
| `initiative.end` | DM only | DM ends combat and clears all state. |
| `initiative.next` | DM only | DM advances to the next combatant. |
| `initiative.remove` | DM only | DM removes a token from the combatant list. |
| `initiative.reorder` | DM only | DM drags combatants into a custom order. |
| `initiative.request_state` | Any member | Client requests current state on (re)connect. |
| `initiative.roll` | Any member | roll initiative for a token using a dice expression. |
| `initiative.set` | DM only | DM manually sets a token's initiative value. |
| `initiative.start` | DM only | DM begins combat (round 1, first combatant active). |
| `light:add` | DM only | DM places a single light source. |
| `light:remove` | DM only | DM removes a light source by id. |
| `light:update` | DM only | DM updates a light source (position, radius, color, enabled, etc.). |
| `lights:replace` | DM only | DM bulk-replaces all light sources. |
| `lights:request` | Any member | Any campaign member requests current light sources on (re)join. |
| `map.change` | DM only | DM switches to a different map. |
| `map.ping` | Any member | user points at a location. |
| `presence.request` | Any member | — |
| `spirit_layer.style_change` | DM only | DM changes the realm atmosphere style. |
| `spirit_layer.toggle` | DM only | DM toggles spirit layer visibility for the campaign. |
| `spirit_layer.token.toggle` | DM only | DM toggles visibility of a specific token. |
| `token.move` | Any member | — |
| `token.move.end` | Any member | User finishes dragging (final position) Updates database and broadcasts to campaign |
| `token.move.start` | Any member | User begins dragging a token Validates permission and broadcasts to campaign |
| `vibe.update` | DM only | DM changes the current vibe period. |
| `wall:add` | DM only | DM adds a single wall segment. |
| `wall:remove` | DM only | DM removes a wall segment by id. |
| `wall:update` | DM only | DM updates a wall segment (e.g., door open/close). |
| `walls:replace` | DM only | DM bulk-replaces all wall segments. |
| `walls:request` | Any member | Any campaign member requests current wall segments on (re)join. |

### Server → client

| Event | Emitted from |
| --- | --- |
| `atmosphere.audio.updated` | `atmosphere.ts` |
| `atmosphere.effect.updated` | `atmosphere.ts` |
| `authenticated` | `events.ts` |
| `character.hp.updated` | `characters.ts` |
| `chat.message` | `chat.ts` |
| `chat.system` | `utils.ts` |
| `connected` | `events.ts` |
| `dice.historyCleared` | `dice.ts` |
| `dice.rolled` | `dice.ts` |
| `dice.rolled.secret` | `dice.ts` |
| `dm:editing` | `walls.ts` |
| `fog:cells` | `fog.ts` |
| `fog:updated` | `fog.ts` |
| `initiative.state` | `initiative.ts` |
| `light:added` | `lights.ts` |
| `light:removed` | `lights.ts` |
| `light:updated` | `lights.ts` |
| `lights:replaced` | `lights.ts` |
| `map.changed` | `maps.ts` |
| `map.pinged` | `pings.ts` |
| `pong` | `events.ts` |
| `presence.state` | `events.ts` |
| `spirit_layer.style_changed` | `spirit.ts` |
| `spirit_layer.toggled` | `spirit.ts` |
| `spirit_layer.token.toggled` | `spirit.ts` |
| `token.move.start` | `tokens.ts` |
| `token.moved` | `tokens.ts` |
| `token:appeared` | `tokens.ts` |
| `token:disappeared` | `tokens.ts` |
| `user.joined` | `events.ts` |
| `user.left` | `events.ts` |
| `vibe.updated` | `vibe.ts` |
| `wall:added` | `walls.ts` |
| `wall:removed` | `walls.ts` |
| `wall:updated` | `walls.ts` |
| `walls:replaced` | `walls.ts` |

<!-- END GENERATED EVENTS -->

---


## Troubleshooting

### Connection Issues

**Problem:** "Unauthorized" error on connect
**Solution:** Login via REST API first to obtain session cookie

**Problem:** Socket connects but can't authenticate to campaign
**Solution:** Verify user is a member of the campaign

**Problem:** Events not received
**Solution:** Check that you've authenticated to the campaign first

### Performance Issues

**Problem:** Token movement is laggy
**Solution:** Server throttles to 60fps automatically. Check network latency.

**Problem:** Too many reconnection attempts
**Solution:** Check server logs for disconnection reason

### Permission Issues

**Problem:** "You do not have permission" errors
**Solution:** Check user's role in campaign and token's `controlledBy` field

---

## Reference Links

- [Socket.io Client API](https://socket.io/docs/v4/client-api/)
- [OpenAPI Spec](API_DOCUMENTATION.yaml) — Full REST API and WebSocket event comments
- [API Reference](../../docs/API_REFERENCE.md) — Human-readable API reference

---

**For bugs or issues:** Check server logs and browser console for error messages
