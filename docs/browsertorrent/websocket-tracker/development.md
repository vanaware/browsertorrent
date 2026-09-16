# WebSocket Tracker Development Documentation

> **Package:** `@browsertorrent/websocket-tracker`
> **Date:** 2026-09-16
> **Status:** ✅ Complete

---

## Overview

This document describes the development of the WebSocket Tracker package for BrowserTorrent. The tracker is designed to be simple, lightweight, and optimized for small servers.

## Design Decisions

### 1. Simple Architecture

The tracker uses a simple architecture with minimal dependencies:
- **WebSocket Server:** Native Deno WebSocket support
- **LRU Cache:** Custom implementation for peer management
- **No External Dependencies:** Only uses Deno standard library

### 2. Low Server Requirements

Optimized for small servers:
- **Memory:** LRU cache limits total entries
- **Connections:** Configurable max peers (default: 1000)
- **Peers per Torrent:** Configurable limit (default: 50)
- **Torrents:** Configurable limit (default: 100)

### 3. Separate Source Files

Source files are separate from example files:
- `packages/websocket-tracker/src/` - Tracker source code
- `packages/example/src/` - Example application
- `packages/service-worker/src/` - Service Worker

This separation allows easy export to a new server.

## File Structure

```
packages/websocket-tracker/
├── deno.jsonc              # Package configuration
├── src/
│   ├── mod.ts              # Main entry point, exports
│   ├── server.ts           # WebSocket server implementation
│   ├── peer.ts             # Peer connection management
│   ├── swarm.ts            # Swarm (torrent) management
│   ├── lru.ts              # LRU cache implementation
│   ├── stats.ts            # Statistics and health monitoring
│   ├── parse-websocket.ts  # Message parsing (BEP-15/31)
│   └── cli.ts              # CLI interface
└── tests/                   # Test files (to be added)
```

## Implementation Details

### LRU Cache (`lru.ts`)

- Doubly-linked list + Map for O(1) operations
- Configurable capacity
- Evicts least recently used items when full
- Supports get, put, remove, has operations

### WebSocket Server (`server.ts`)

- Native Deno WebSocket server
- Handles announce and scrape requests
- Manages peer connections
- LRU-based peer eviction
- Graceful shutdown handling

### Peer Management (`peer.ts`)

- Individual peer connection tracking
- State management (uploaded, downloaded, left)
- Event handling (started, completed, stopped)
- Connection limits

### Swarm Management (`swarm.ts`)

- Torrent-based peer grouping
- Peer discovery within swarms
- Swarm statistics
- LRU-based swarm eviction

### Message Parsing (`parse-websocket.ts`)

- BEP-15/31 protocol support
- Announce request parsing
- Scrape request parsing
- Response formatting
- Message validation

### Statistics (`stats.ts`)

- Connection tracking
- Message counting
- Health monitoring
- Uptime tracking
- Memory usage monitoring

### CLI (`cli.ts`)

- Command-line interface
- Environment variable support
- Graceful shutdown
- Help documentation

## Testing

### Manual Testing

```bash
# Start the tracker
deno run --allow-net --allow-env --allow-read packages/websocket-tracker/src/mod.ts

# Test with a client
deno run --allow-net packages/example/src/main.tsx
```

### Test Scenarios

1. **Basic Connection:** Connect a client and verify announce
2. **Peer Discovery:** Connect multiple clients and verify peer exchange
3. **Scrape:** Send scrape request and verify response
4. **LRU Eviction:** Exceed max peers and verify eviction
5. **Graceful Shutdown:** Send SIGINT and verify clean shutdown

## Integration with BrowserTorrent

### Client Integration

The tracker integrates with the BrowserTorrent client via WebSocket:

```typescript
import { createServer } from "@browsertorrent/websocket-tracker";

const tracker = createServer(8000);
```

### Configuration

Environment variables for configuration:
- `PORT` - Tracker port (default: 8000)
- `HOSTNAME` - Tracker hostname (default: 0.0.0.0)
- `MAX_PEERS` - Maximum peers (default: 1000)
- `MAX_PEERS_PER_TORRENT` - Max peers per torrent (default: 50)
- `MAX_TORRENTS` - Maximum torrents (default: 100)

## Deployment

### Small Server (1-100 peers)

Default settings work well:
```bash
deno run --allow-net --allow-env --allow-read packages/websocket-tracker/src/mod.ts
```

### Medium Server (100-1000 peers)

Increase limits:
```bash
MAX_PEERS=5000 MAX_PEERS_PER_TORRENT=100 deno run --allow-net --allow-env --allow-read packages/websocket-tracker/src/mod.ts
```

### Large Server (1000+ peers)

Consider horizontal scaling with multiple tracker instances.

## Known Limitations

1. **Single Instance:** No clustering support
2. **No Persistence:** Peers are lost on restart
3. **No Authentication:** No tracker authentication
4. **No HTTPS:** WebSocket only (no WSS)

## Future Enhancements

1. **Persistence:** Add Redis or file-based persistence
2. **Clustering:** Support for multiple tracker instances
3. **HTTPS:** Add WSS support
4. **Authentication:** Add tracker authentication
5. **Metrics:** Add Prometheus metrics export

## References

- [BEP-15: UDP Tracker Protocol](http://www.bittorrent.org/beps/bep_0015.html)
- [BEP-31: WebSocket Tracker Protocol](http://www.bittorrent.org/beps/bep_0031.html)
- [BitTorrent Protocol Specification](http://www.bittorrent.org/beps/bep_0003.html)
