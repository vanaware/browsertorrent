# WebSocket Tracker API

> **Package:** `@browsertorrent/websocket-tracker`
> **Version:** 1.0.0
> **Description:** Simple WebSocket tracker for BrowserTorrent - optimized for small servers

---

## Overview

The WebSocket Tracker is a lightweight, high-performance WebSocket server that implements the BitTorrent tracker protocol (BEP-15, BEP-31). It is designed to run on small servers with minimal resource usage.

## Features

- **Lightweight:** Minimal dependencies, optimized for small servers
- **LRU Caching:** Efficient peer management with LRU eviction
- **WebSocket Protocol:** Real-time peer communication via WebSocket
- **BEP-15/31 Compatible:** Standard BitTorrent tracker protocol support
- **Low Memory Footprint:** Configurable limits to control resource usage
- **Graceful Shutdown:** Clean shutdown handling with signal listeners

## Installation

```bash
deno install --allow-net --allow-env --allow-read packages/websocket-tracker/src/mod.ts
```

## Quick Start

```typescript
import { createServer } from "@browsertorrent/websocket-tracker";

const tracker = createServer(8000);

console.log("Tracker running on port 8000");
```

## CLI Usage

```bash
deno run --allow-net --allow-env --allow-read packages/websocket-tracker/src/cli.ts

# With options
deno run --allow-net --allow-env --allow-read packages/websocket-tracker/src/cli.ts \
  --port 8000 \
  --host 0.0.0.0 \
  --max-peers 1000 \
  --max-peers-per-torrent 50
```

## Configuration

| Option | Environment Variable | Default | Description |
|--------|---------------------|---------|-------------|
| Port | `PORT` | 8000 | Port to listen on |
| Hostname | `HOSTNAME` | 0.0.0.0 | Hostname to bind |
| Max Peers | `MAX_PEERS` | 1000 | Maximum total peers |
| Max Peers Per Torrent | `MAX_PEERS_PER_TORRENT` | 50 | Maximum peers per torrent |
| Max Torrents | `MAX_TORRENTS` | 100 | Maximum torrents |
| Idle Timeout | - | 300000ms | WebSocket idle timeout |

## API Reference

### `createServer(port, options)`

Create a new WebSocket tracker instance.

**Parameters:**
- `port` (number): Port to listen on (default: 8000)
- `options` (WebSocketTrackerOptions): Configuration options

**Returns:** `WebSocketTracker` instance

### `WebSocketTracker`

Main tracker class that handles WebSocket connections and peer management.

**Methods:**
- `getStats()`: Get tracker statistics
- `close()`: Close the tracker and all connections

**Events:**
- `connection`: New WebSocket connection
- `error`: Server error
- `listening`: Server started listening

### `PeerConnectionManager`

Manages individual peer connections with state tracking.

**Methods:**
- `addConnection(ws, peerId, infoHash, port)`: Add a new peer connection
- `getConnection(peerId)`: Get peer connection by ID
- `updateStats(peerId, uploaded, downloaded, left)`: Update peer stats
- `removeConnection(peerId)`: Remove peer connection
- `getPeersByInfoHash(infoHash)`: Get peers for a torrent
- `getConnectionCount()`: Get total connections

### `SwarmManager`

Manages swarms (torrents) and their peers.

**Methods:**
- `addPeer(announce)`: Add peer to a swarm
- `removePeer(infoHash, peerId)`: Remove peer from a swarm
- `getPeers(infoHash, numwant)`: Get peers for a torrent
- `getSwarmInfo(infoHash)`: Get swarm info
- `getAllSwarmInfo()`: Get all swarm info

### `LRUCache`

Generic LRU cache implementation for efficient peer management.

**Methods:**
- `get(key)`: Get value by key
- `put(key, value)`: Put value into cache
- `remove(key)`: Remove value by key
- `has(key)`: Check if key exists
- `getSize()`: Get current size
- `clear()`: Clear all items
- `keys()`: Get all keys (MRU to LRU)
- `values()`: Get all values (MRU to LRU)
- `entries()`: Get all entries (MRU to LRU)

### `StatsManager`

Tracks server statistics and health metrics.

**Methods:**
- `incrementConnections()`: Increment connection count
- `decrementConnections()`: Decrement connection count
- `incrementMessages()`: Increment message count
- `incrementCompleted()`: Increment completed downloads
- `getStats()`: Get current statistics
- `getHealth(totalPeers, totalTorrents)`: Get server health status
- `getUptimeSeconds()`: Get uptime in seconds
- `reset()`: Reset all statistics

### `parseWebSocketMessage(data)`

Parse an incoming WebSocket message.

**Parameters:**
- `data` (string): Raw message data

**Returns:** `TrackerMessage | null`

### `formatAnnounceResponse(infoHash, peerId, peers)`

Format an announce response.

**Parameters:**
- `infoHash` (string): Info hash
- `peerId` (string): Peer ID
- `peers` (string[]): Array of "ip:port" strings

**Returns:** `TrackerAnnounceResponse`

### `formatScrapeResponse(infoHash, complete, incomplete, downloaded)`

Format a scrape response.

**Parameters:**
- `infoHash` (string): Info hash
- `complete` (number): Complete peers
- `incomplete` (number): Incomplete peers
- `downloaded` (number): Total downloaded

**Returns:** `TrackerScrapeResponse`

## Message Protocol

### Announce Request

```json
{
  "action": "announce",
  "info_hash": "20-byte-hex-string",
  "peer_id": "20-byte-string",
  "port": 6881,
  "uploaded": 0,
  "downloaded": 0,
  "left": 0,
  "event": "started|completed|stopped|",
  "numwant": 50,
  "compact": 0,
  "no_peer_id": 0
}
```

### Announce Response

```json
{
  "action": "announce",
  "info_hash": "20-byte-hex-string",
  "peer_id": "20-byte-string",
  "peers": ["ip:port", "ip:port", ...]
}
```

### Scrape Request

```json
{
  "action": "scrape",
  "info_hash": "20-byte-hex-string",
  "peer_id": "20-byte-string"
}
```

### Scrape Response

```json
{
  "action": "scrape",
  "info_hash": "20-byte-hex-string",
  "complete": 10,
  "incomplete": 5,
  "downloaded": 1000
}
```

### Error Response

```json
{
  "action": "error",
  "code": "invalid_message",
  "message": "Error description"
}
```

## Performance Considerations

### Memory Usage

The tracker is optimized for low memory usage:
- LRU cache limits total entries
- Configurable max peers per torrent
- Automatic eviction of least active peers

### Connection Handling

- WebSocket idle timeout: 5 minutes (configurable)
- Max connections: 1000 (configurable)
- Graceful shutdown on SIGINT/SIGTERM

### Scalability

For small servers (up to 1000 peers):
- Default settings work well
- No additional configuration needed

For medium servers (1000-5000 peers):
- Increase `maxPeers` and `maxPeersPerTorrent`
- Monitor memory usage

## Examples

### Basic Server

```typescript
import { createServer } from "@browsertorrent/websocket-tracker";

const tracker = createServer(8000);
```

### Custom Configuration

```typescript
import { createServer } from "@browsertorrent/websocket-tracker";

const tracker = createServer(8000, {
  hostname: "0.0.0.0",
  maxPeers: 500,
  maxPeersPerTorrent: 25,
  maxTorrents: 50,
});
```

### Monitoring Stats

```typescript
import { createServer } from "@browsertorrent/websocket-tracker";

const tracker = createServer(8000);

// Periodically log stats
setInterval(() => {
  const stats = tracker.getStats();
  console.log("Peers:", stats.totalPeers);
  console.log("Torrents:", stats.totalTorrents);
  console.log("Connections:", stats.connections);
}, 60000);
```

## License

MIT
