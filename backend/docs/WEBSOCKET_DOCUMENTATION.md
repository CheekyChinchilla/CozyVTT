# CozyVTT WebSocket Documentation

**Last Updated:** 2026-09-27

> **This is not a public API.** These events are the ones CozyVTT's own web
> client sends and receives. They are not versioned, carry no compatibility
> promise, and may change shape or disappear in a point release. A program
> *can* use them: signing in with `POST /api/auth/login` returns a session
> cookie that authenticates the Socket.io connection as that user, with that
> user's permissions and no stability promise.

## Table of Contents

1. [Overview](#overview)
2. [Connection Setup](#connection-setup)
3. [Authentication](#authentication)
4. [Event Reference](#event-reference)
5. [Token Movement — a worked example](#token-movement--a-worked-example)
6. [Fog, lighting and explored memory](#fog-lighting-and-explored-memory)
7. [Error Handling](#error-handling)
8. [Client Examples](#client-examples)
9. [Testing](#testing)
10. [Event Inventory](#event-inventory)

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
- One campaign per connection: authenticating a connection into another
  campaign leaves every other campaign room first, and each of those gets
  `user.left` and a fresh `presence.state`. `authenticate` events on one
  connection are handled one at a time, so two sent together end with the
  connection in the last campaign only
- Every broadcast that reads a connection's role skips a connection whose
  campaign is not the room being broadcast to
- Deleting a campaign empties its room: every connection in it gets `error`
  ("This campaign was deleted") and forgets the campaign
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

A handshake a browser marks as made from another site (`Sec-Fetch-Site` of
`same-site` or `cross-site`) is refused unless its `Origin` is exactly
`CORS_ORIGIN`, as the HTTP API refuses such a request. A program that is not
a browser sends no such header and connects as above.

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
   - The sign-in the connection was opened under still exists (checked on
     every `authenticate`, not only when the connection opened); if it has
     ended, the server answers `error` "Unauthorized" and closes the connection
   - User is member of campaign
3. The socket leaves every other campaign room it is in; each of those
   campaigns gets 'user.left' and a fresh 'presence.state'
4. Server joins socket to campaign room
5. Server attaches campaignId and role to socket
6. Server emits 'authenticated' to client
7. Server broadcasts 'user.joined' to other campaign members, then 'presence.state'
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
- Spectator can send chat messages but cannot roll dice, roll initiative or move tokens

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
**Response:** `authenticated` or `error`. `error` "Unauthorized", followed by the server closing the connection, means the sign-in this connection was opened under has ended (signed out, expired, or ended by a password change); sign in again.

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
**When:** User disconnects, or authenticates the same connection into another campaign
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

`error` only goes from the server to the client. Socket.io does not reserve the name, so a client can emit an event called `error`; the server ignores it, answers nothing, and writes none of its payload to the log.

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
   Server sends the final position: to everyone on an unlit map; on a lit
   map to each player as token:appeared or token:disappeared, by their sight;
   a hidden token's position reaches DMs only
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
- Spectator cannot move tokens, including one still named in a token's
  `controlledBy` from before they were demoted
- Nobody but the DM while the session is paused or has ended (campaign
  status `PAUSED` or `INACTIVE`): a player's `token.move.start` and
  `token.move.end` answer `error`, and their `token.move` frames are dropped.
  A refused `token.move.end` is also answered with a `token.moved` carrying
  the token's stored position and `movedBy: null`, to the sender and to
  everyone the drag's frames went to, since a pause can land mid-drag after
  those screens have drawn the frames and the drop. So is a drop refused
  because control of the token, or the sender's plane, changed after the
  drag began; a drop of a token the sender never dragged gets only the
  `error`. The correction goes only to those the map fetch would send the
  token to now, sight on a lit map included, so a token hidden or moved to
  the other plane since the drag began is not placed on anyone's screen

**Broadcast:** `token.move.start` to the members the map fetch would send this token to (every DM; a player only if the token is visible and on a plane they can see), the sender excluded; on a lit map, only to those who could see the token where the drag began. Who that is gets decided on this event or the first frame, and the drag's frames reuse it; it is decided again when the token is hidden, shown or moved to the other plane mid-drag, and at least once a second, so a player who changes plane or leaves the map the table is on stops receiving the frames within a second. `movedBy` names the mover; while the token is obscured it is null for anyone but the DM and the mover, since its controller is part of what obscuring hides.
**Broadcast Payload:**
```typescript
{
  tokenId: string;
  mapId: string;
  movedBy: string | null;
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

**Permission:** the same as `token.move.start`, and checked again here on every
event. Nothing server-side ties a start event to the moves that follow it, so
the check on the start cannot stand in for this one.
- DM can move any token
- Player can move tokens where `controlledBy === userId`
- Spectator cannot move tokens

A move the sender is not allowed to make is dropped without an `error`, because
this fires up to 60 times a second and one error per frame would be its own
problem. `token.move.end` answers properly.

**Validation:**
- Coordinates must be numbers
- X must be >= 0 and < map.width
- Y must be >= 0 and < map.height
- Invalid data silently ignored during rapid updates

**Broadcast:** `token.moved` to the members the map fetch would send this token to (every DM; a player only if the token is visible and on a plane they can see), the sender excluded; on a lit map, only to the DM and the players who could see the token when the drag began. The recipients are those decided for the drag's `token.move.start`, not worked out again per frame
**Broadcast Payload:**
```typescript
{
  tokenId: string;
  mapId: string;
  x: number;
  y: number;
  dragging: true;          // always set on a frame; absent on the drop
  movedBy: string | null;
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

> A frame is marked `dragging: true`, and the drop's `token.moved` is not. Treat a frame as where the token is being carried: draw it there, but keep the token's position, and so the sight, lighting and explored memory that follow from it, where it was until the drop arrives. A frame that returns the token to its own position ends the hold.
>
> A cancelled drag must send one more `token.move` back to the square the token was picked up from. The server writes nothing for a cancel, and without that frame every other client keeps showing the last position it received.

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

// Receive updates. The sender is left out of drag frames, so apply every
// token.moved: one naming yourself confirms your drop, and one after a refused
// drop puts the token back.
socket.on('token.moved', (data) => {
  updateTokenPosition(data.tokenId, data.x, data.y);
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
- Coordinates must be whole numbers of grid squares (`error` "Invalid token move data" otherwise)
- Position must be within map bounds
- Token must exist
- User must have permission
- A drop whose footprint (the token's `size`) would hang off the far edge is moved back until it fits, as the client does before sending; the stored position and every `token.moved` carry the corrected `x` and `y`

**Database Update:**
- Updates `Map.tokens` JSON array
- Persists final position

**Broadcast:** `token.moved` to the members the map fetch would send this token to (every DM; a player only if the token is visible and on a plane they can see), the sender included. On a lit map each player instead gets `token:appeared` (with the token as that player is sent it: never notes or a stat block, hit points only when its bar is on or the token is theirs, darkvision only for their own, and an obscured token as a shape with no identity) or `token:disappeared` as their sight decides; a hidden token's final position reaches DMs only. `movedBy` is null for anyone but the DM and the mover while the token is obscured.
**Broadcast Payload:**
```typescript
{
  tokenId: string;
  mapId: string;
  x: number;
  y: number;
  movedBy: string | null;
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
socket.on('token.moved', (data) => {
  // Remove "Saving..." indicator
  hideSavingIndicator();

  // Update UI with final position
  setTokenPosition(data.tokenId, data.x, data.y);

  console.log('Token saved:', data);
});
```

---

## Fog, lighting and explored memory

Three things decide what a player's map shows, and each has one source of truth.

**Flood ceilings.** The events below have a per-user ceiling, counted across all of that user's sockets, so opening more connections does not multiply it. Dice rolls: 30 a minute, `error` when exceeded; every `initiative.roll` but the DM's counts against the same budget, and a spectator's is refused before anything is read. Chat: one message per short window. `token.move.start`, `token.move` and `token.move.end`: 150 a second between them, dropped silently. Wall and light edits (`wall:add`, `wall:remove`, `wall:update`, `walls:replace`, `light:add`, `light:remove`, `light:update`, `lights:replace`): 40 a second between them, dropped silently. `fog:operation`: 10 a second, dropped silently. `exploration:reveal`: 10 a second, dropped silently. `map.ping`: 10 every ten seconds, dropped silently. The requests a client makes when it opens a map or reconnects (`walls:request`, `lights:request`, `fog:request_state`, `exploration:request`, `presence.request`, `initiative.request_state`) are each answered at most five times a second per user and otherwise dropped silently; a client sends each once per load. An `initiative.request_state` while nothing is in the order is answered from memory without any database work. Any other event has no ceiling of its own; apart from `authenticate`, `ping`, `character.hp.update` and `character.hitdice.spend`, those are the DM's alone, and `dm:editing` is passed on at most twice a second per socket.

**A map a player may read is the campaign's current one.** `walls:request`, `lights:request`, `fog:request_state` and `exploration:request` answer a player or spectator only for the map the campaign is showing (`currentMapId`); for any other map of the campaign they answer nothing, exactly as for a map outside it. The DM is answered for any map of the campaign. Token moves follow the same rule: a drag or drop on any other map reaches the DM's sockets only. Writes do too: a player's `token.move.start`, `token.move.end`, `wall:update` door toggle and `initiative.roll` on a map other than the current one answer `error` ("Map not found"), and their `token.move` frames and `exploration:reveal` reports there are dropped without an answer, even for a token they control. So do a map's live edits: `wall:added`, `wall:removed`, `wall:updated`, `walls:replaced`, `light:added`, `light:removed`, `light:updated`, `lights:replaced`, `fog:cells`, `map:settings:updated`, `map.pinged`, `exploration:state` from a reset, and `dm:editing` reach every member for the current map and only the DM's sockets for any other. Some of them also come from the REST map routes, under the same rule: the wall routes send the `wall:*` events and `walls:replaced`, the light routes the `light:*` events and `lights:replaced`, the map update and lighting routes `map:settings:updated`, and the fog operation the fog events. Every path follows the rule, so a map the DM has prepared but not switched to is the DM's alone. `map.change` from the DM is likewise refused (with `error`) for any map but the current one, because `map.changed` puts every client onto the map it carries; moving tokens between maps (`POST .../tokens/move`) sends `map.changed` for whichever of the two maps is current, so no client has to ask.

**Manual fog of war** is per map, switched by `Map.fogEnabled`. While it is on, `fog:request_state` answers a DM with `fog:updated` (the full grid) and everyone else with `fog:cells` (their revealed cell indices plus the grid dimensions). A `fog:cells` payload with an empty `revealedCells` means fog is on and nothing is revealed. While fog is off the handlers answer nothing and refuse `fog:operation`; a client that gets no reply draws no fog. A request from a socket that has not yet authenticated is dropped the same silent way, so a client sends `fog:request_state` only after `authenticated`, and again after a reconnect; the web client waits for that. Switching fog on for a map (`PUT /api/campaigns/:campaignId/maps/:id` with `fogEnabled: true`) pushes the map's fog to every member at once, `fog:updated` or `fog:cells` by role, so no client has to ask. The REST fog operation broadcasts through the same code as the socket one, so a reveal reaches the table the same way whichever path made it. Fog is one cell per grid square, and a map with more than 250,000 squares (500 by 500, the largest a map can now be made) is too large for it; only a map stored before that limit can be. For such a map `fog:request_state` and `fog:operation` answer `error` with a message saying to make the map smaller, and nothing is sent or stored.

**Dynamic lighting** decides which tokens a player is *sent*. The rule lives in `utils/visibilityRule.ts`, shared byte for byte with the client: walls first (nothing outside a controlled token's line of sight is sent, lit or not), then the map's `globalIllumination` flag, then darkvision, the token's own square and light. Token moves apply the same plane and hidden-token rules as the map fetch before line of sight, so a player never receives on a move what opening the map would not have given them. The frames of a drag (`token.moved` from `token.move`) go to the recipients decided once per drag: on a lit map, the DM's sockets and the players whose tokens could see the token where the drag began; `token.move.end` then decides, per player, who is sent where it stopped. Any per-map flag change is broadcast as one `map:settings:updated` event carrying every flag. A change to `lightingEnabled` or `globalIllumination` also re-sends `map.changed` to every member with the map as they can now see it, the same event a map switch or a spirit-realm crossing sends, since those two flags decide which tokens a player is sent. So does a light, wall or door change on a lit map the campaign is showing, over the socket or the REST routes, to players only (the DM is sent every token already): one `map.changed` per map, 150 ms after the last change of a burst. Revealing or hiding one token with `spirit_layer.token.toggle` works the same way: `spirit_layer.token.toggled`, which carries the token, goes to the DM's own sockets only, and every member then receives `map.changed` with the map as they may see it.

**Walls and lights stay near their map.** `wall:add`, the DM's `wall:update`, `walls:replace`, `light:add`, `light:update` and `lights:replace` answer `error` and store nothing for a wall end or light more than 250,000 pixels from the map's corner either way, or more than 500 of the map's grid squares outside its edges. A wall or light already stored outside the second bound, before it existed, is kept when sent back unchanged, so a list holding one still saves. The REST wall and light routes apply the same bounds. Ids are unique within a map's list: `wall:add` and `light:add` answer `error` for an id already on the map, and `walls:replace` and `lights:replace` for a list that repeats one.

**Initiative** is kept in memory per campaign and sent as `initiative.state` to each member as they may see it. The DM gets every combatant with its token as it is now; a player gets only the combatants the role filter keeps for them (a hidden token, one on the other plane, or one on a map the campaign is not showing, is absent, and the turn pointer with it; the lighting rule is not applied, so a combatant out of their sight on a lit or fogged map is still listed), with the name, portrait and hit points exactly as that token is sent to them, so a creature's hit points appear only once its bar is on or they control the token. The order is sent again whenever a token in it changes, over REST or a spirit-plane toggle, so the tracker follows the token, and whenever a member's view of it can change: a map switch, a plane crossing through any token of theirs, a role change, or a bound character's new picture; a deleted token or map leaves the order. A send that a later send to the campaign overtakes is dropped, whether the later one was started by a change to the order or by a change to a combatant's token (its hit points, or hiding it), so the newest state always arrives last. The `dice.rolled` entry an `initiative.roll` makes goes to the same people who are sent the token (every DM, and a player when the token is visible, on their plane and on the map the campaign is showing), named by the server: an obscured token as "Unknown creature", and the `characterName` a client sends along is not used. A token bound to a character rolls from that character's sheet only when the character belongs to the campaign the roll is made in.

**Explored memory** is per user, per map, switched by `Map.explorationEnabled`. A client reports the cells its vision has covered with `exploration:reveal`; the server unions them with what it holds, stores them in the fog grid's shape, and sends the user's whole memory as `exploration:state` to that user's sockets in the campaign and to the DM sockets previewing that user, so a DM's Player Preview follows a player's memory as it grows. A DM socket is previewing the user its last `exploration:request` named; one that has named nobody is sent no one else's memory, and the web client asks once more naming nobody when a preview closes. A DM may name another member in `exploration:reveal` and write that player's memory on their behalf, which is what Player Preview does as the previewed token moves; anyone else may only write their own. A report for a map the sender may not write to, or one whose memory is off, is dropped without an `error`: the client sends reports on its own, and one can cross a map switch or the DM turning memory off. `exploration:request` returns a user's own memory (a DM may name another user, for Player Preview, and from then on follows that user's), and `exploration:reset` lets the DM forget everyone's memory of a map. On a map too large for fog (see above), `exploration:request` answers `error` with the same message and `exploration:reveal` is dropped without one. **The server never reads explored memory when deciding which tokens to send.** It only greys in map artwork every client already holds, so a forged reveal can show a player nothing they were not already given.

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
      alert('Spectators cannot move tokens');
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

    socket.on('token.moved', (data) => {
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

_Who may send it is read from the shared permission predicates each handler calls; the handler itself is authoritative._

### Client → server

| Event | Who may send it | What it does |
| --- | --- | --- |
| `atmosphere.audio.set` | DM only | DM queues or stops ambient audio for all players. |
| `atmosphere.effect.set` | DM only | DM sets a visual particle overlay on the map canvas. |
| `authenticate` | Any member | — |
| `character.hitdice.spend` | DM, or the character's owner, never a spectator | spend one D&D 5e hit die. |
| `character.hp.update` | DM, or the character's owner, never a spectator | — |
| `chat.message` | Any member | User sends chat message. |
| `dice.clearHistory` | DM only | DM clears dice roll history (DM-only). |
| `dice.roll` | DM and players | User rolls dice Validates expression, calculates result, saves to database, and broadcasts. |
| `dm:editing` | DM only | — |
| `exploration:request` | Any member | what this user has explored on a map. |
| `exploration:reset` | DM only | DM forgets every player's explored areas on a map. |
| `exploration:reveal` | Any member | a player's vision covered these cells; remember them (a DM may name another member with userId to record theirs). |
| `fog:operation` | DM only | DM applies a fog operation (reveal/hide cells). |
| `fog:request_state` | Any member | Any campaign member requests current fog state on (re)join. |
| `initiative.add` | DM only | DM adds a token to the combatant list. |
| `initiative.end` | DM only | DM ends combat and clears all state. |
| `initiative.next` | DM only | DM advances to the next combatant. |
| `initiative.remove` | DM only | DM removes a token from the combatant list. |
| `initiative.reorder` | DM only | DM drags combatants into a custom order. |
| `initiative.request_state` | Any member | Client requests current state on (re)connect. |
| `initiative.roll` | DM, or the token's player | roll initiative for a token using a dice expression. |
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
| `token.move` | DM, or the token's player while the session is live | — |
| `token.move.end` | DM, or the token's player while the session is live | User finishes dragging (final position) Updates database and broadcasts to campaign |
| `token.move.start` | DM, or the token's player while the session is live | User begins dragging a token Validates permission and broadcasts to campaign |
| `vibe.update` | DM only | DM changes the current vibe period and its audio follows. |
| `wall:add` | DM only | DM adds a single wall segment. |
| `wall:remove` | DM only | DM removes a wall segment by id. |
| `wall:update` | DM; a player may toggle an unlocked door | Update a wall segment; a player may only open or close an unlocked door, and cannot move it. |
| `walls:replace` | DM only | DM bulk-replaces all wall segments. |
| `walls:request` | Any member | Any campaign member requests current wall segments on (re)join. |

### Server → client

| Event | Emitted from |
| --- | --- |
| `atmosphere.audio.updated` | `atmosphereAudio.ts` |
| `atmosphere.effect.updated` | `atmosphere.ts` |
| `authenticated` | `events.ts` |
| `campaign.dm.transferred` | `campaigns.ts` |
| `campaign.role.changed` | `campaigns.ts` |
| `character.hp.updated` | `characters.ts` |
| `character.updated` | `characters.ts` |
| `chat.message` | `chat.ts` |
| `chat.system` | `utils.ts` |
| `connected` | `events.ts` |
| `dice.historyCleared` | `dice.ts` |
| `dice.rolled` | `dice.ts` |
| `dice.rolled.secret` | `dice.ts` |
| `dm:editing` | `walls.ts` |
| `exploration:state` | `exploration.ts` |
| `fog:cells` | `fog.ts` |
| `fog:updated` | `fog.ts` |
| `initiative.state` | `initiative.ts` |
| `invitation.received` | `campaigns.ts` |
| `light:added` | `lights.ts` |
| `light:removed` | `lights.ts` |
| `light:updated` | `lights.ts` |
| `lights:replaced` | `lights.ts` |
| `map.changed` | `shared.ts` |
| `map.pinged` | `pings.ts` |
| `map:settings:updated` | `maps.ts` |
| `pong` | `events.ts` |
| `presence.state` | `events.ts` |
| `roster.updated` | `utils.ts` |
| `session.ended` | `campaigns.ts` |
| `session.paused` | `campaigns.ts` |
| `session.resumed` | `campaigns.ts` |
| `session.started` | `campaigns.ts` |
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
