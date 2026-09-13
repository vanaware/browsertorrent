# Roadmap — Tracker WebSocket em Deno para `@loco/webtorrent`

> Documento de planejamento para a Fase 8 do `@loco/webtorrent`:
> construção de um **servidor tracker BitTorrent WebSocket** (BEP-15 / BEP-31),
> escrito em Deno, que o cliente PWA pode usar para descoberta de peers
> quando os trackers públicos (`tracker.fastcast.nz`, etc.) falham
> ou não estão acessíveis em contexto HTTPS-only.

---

## 1. Contexto e motivação

### 1.1 O problema atual

- O cliente `@loco/webtorrent` (`src/network/tracker.ts`) implementa
  `WsTracker`, que fala o protocolo BEP-15 sobre WebSocket.
- Em ambiente HTTPS, o navegador **bloqueia** conexões `ws://` (mixed content),
  e os trackers públicos via `wss://` (`wss://tracker.fastcast.nz/`,
  `wss://tracker.openbittorrent.com`) sofrem com:
  - certificado expirado/autoassinado,
  - CORS/Origin policies agressivas,
  - indisponibilidade intermitente (browsers imprimem `WebSocket connection to 'wss://...' failed`).
- O resultado é que um leech aberto em uma segunda aba/navegador **nunca
  recebe peers** → `torrent.files.length: 0` → sem metadados → sem stream.

### 1.2 A solução

Construir um **servidor tracker dedicado** em Deno, exposto via `wss://`,
que:

1. Implemente o subconjunto WebSocket do protocolo tracker BitTorrent
   (BEP-15: `announce`/`scrape`; BEP-31: `offer`/`answer` para WebRTC
   signaling).
2. Reuse a referência de protocolo colocada em
   `monorepo/webtorrent/bittorrent-tracker/` (sub-pasta criada em 2026-09-04
   contendo o upstream `webtorrent/bittorrent-tracker` para consulta).
3. Seja executável localmente (`deno task server:tracker`) e deployável
   em qualquer host que aceite Deno (Deno Deploy, VPS, container).
4. **Não quebre as regras de ouro** do `QWEN.md` raiz: as implementações
   no `src/` continuam browser-first. O tracker é um **binário/servidor
   separado**, fora de `src/`.

### 1.3 Por que Deno (e não Node)?

- O resto do monorepo Loco já é Deno (`deno.jsonc`, `deno.lock`).
- `Deno.upgradeWebSocket()` é uma API de primeira classe para WebSockets
  com hijack de socket TCP — não há dependência de `ws` ou de polyfills.
- TS nativo, sem etapa de build para o servidor.
- Deploy trivial no Deno Deploy (que tem suporte a WebSocket nativo e
  gratuito para projetos pequenos).

---

## 2. Escopo

### 2.1 Dentro do escopo (v1)

- **Servidor WebSocket tracker** aceitando conexões `ws://` e `wss://`.
- Mensagens suportadas: `announce` (com `offer`/`answer`), `scrape`.
- Eventos do ciclo de vida do peer: `started`, `stopped`, `completed`,
  `update` (sintético).
- `Swarm` por `info_hash` com LRU de peers e contadores `complete`/
  `incomplete`.
- Estatísticas básicas: `/stats` (HTML) e `/stats.json`.
- Logging via `Deno.stdout` (sem dependência de `debug`/`pino`).
- Dockerfile mínimo + `Dockerfile` para deploy.
- Teste de integração: cliente Deno → tracker → assertiva sobre peers
  retornados.
- CLI com `deno task` (`server:tracker`, `server:tracker:dev` com watch).

### 2.2 Fora do escopo (v1)

- Tracker HTTP/UDP (BEP-3, BEP-15 parte HTTP/UDP) — pode entrar em v2.
- Persistência entre reinícios (swarms são in-memory).
- Autenticação, listas de allow/deny, filtragem de torrents
  (existe hook `filter` no upstream, mas é nice-to-have).
- `clientTracking` (já desativado no upstream para WebSocket).
- Rate limiting — adicionar em v1.1 com token bucket por IP.

### 2.3 Limites de recursos (v1)

| Recurso | Limite | Justificativa |
|---|---|---|
| Peers por swarm (LRU) | 1000 | Igual ao upstream |
| TTL do peer no LRU | 20 min | Igual ao upstream |
| `MAX_NUMWANT` aceito | 82 | Igual ao `MAX_ANNOUNCE_PEERS` upstream |
| `interval` (anúncio) | 120 s | `intervalMs / 5`, igual ao upstream |
| `intervalMs` default | 10 min | Igual ao upstream |
| Tamanho máx. de mensagem WS | 64 KiB | Generoso p/ offer SDP pequeno |
| Conexões simultâneas | 10 000 | Limite default do Deno Deploy |
| Body de scrape | 100 infoHashes | Defesa contra abuso |

---

## 3. Arquitetura

### 3.1 Estrutura de diretórios

```
monorepo/webtorrent/
├── bittorrent-tracker/            # upstream reference (read-only, não editar)
│   ├── server.js
│   ├── swarm.js
│   ├── parse-websocket.js
│   ├── common.js
│   ├── common-node.js
│   ├── client.js
│   └── websocket-tracker.js
├── tracker-server/                # NOVO: nossa implementação Deno
│   ├── deno.json                  # tasks + imports
│   ├── README.md
│   ├── Dockerfile
│   ├── src/
│   │   ├── mod.ts                 # barrel + createServer factory
│   │   ├── server.ts              # TrackerServer: aceita conexões WS
│   │   ├── swarm.ts               # Swarm: LRU de peers por infoHash
│   │   ├── peer.ts                # Peer: estado de um cliente conectado
│   │   ├── parse-websocket.ts     # parse de mensagem BEP-15 JSON
│   │   ├── constants.ts           # ACTIONS/EVENTS/limites (de common-node.js)
│   │   ├── errors.ts              # TrackerServerError tipado
│   │   ├── stats.ts               # agregação de /stats + /stats.json
│   │   └── log.ts                 # wrapper de console.* com prefixo
│   └── tests/
│       ├── swarm_test.ts
│       ├── parse-websocket_test.ts
│       └── integration_test.ts    # Deno.connect WebSocket → assert
└── qwen.md                        # ESTE ARQUIVO
```

### 3.2 Diagrama de componentes

```
                       ┌────────────────────────────────────┐
                       │       @loco/webtorrent (browser)   │
                       │  src/network/tracker.ts            │
                       │  WsTracker ── wss://tracker.../ann │
                       └─────────────────┬──────────────────┘
                                         │ WebSocket (JSON BEP-15)
                                         ▼
            ┌────────────────────────────────────────────┐
            │  Deno HTTP server (Deno.serve)             │
            │  + Deno.upgradeWebSocket()                 │
            └─────────────────┬──────────────────────────┘
                              │
                              ▼
            ┌────────────────────────────────────────────┐
            │  TrackerServer (src/server.ts)             │
            │  - gerencia conexões                       │
            │  - roteia mensagens para Swarm             │
            │  - emite eventos de lifecycle              │
            │  - expõe /stats + /stats.json             │
            └─────────────────┬──────────────────────────┘
                              │
                              ▼
            ┌────────────────────────────────────────────┐
            │  Swarm (src/swarm.ts)                      │
            │  Map<infoHash, Swarm>                      │
            │  - LRU de peers (max 1000)                 │
            │  - contadores complete/incomplete          │
            │  - _getPeers(numwant, ownPeerId, isWebRTC) │
            └─────────────────┬──────────────────────────┘
                              │
                              ▼
            ┌────────────────────────────────────────────┐
            │  Peer (src/peer.ts)                        │
            │  { peerId, ip, port, type, socket,        │
            │    complete, infoHashes, onSend, onMsg,    │
            │    onClose, onError }                     │
            └────────────────────────────────────────────┘
```

### 3.3 Fluxo de mensagem (BEP-15 + BEP-31)

**Cliente → Servidor (announce com offers):**

```jsonc
{
  "action": "announce",
  "info_hash": "<20 bytes binários como string latin-1>",
  "peer_id":   "<20 bytes binários como string latin-1>",
  "port": 6881,
  "uploaded": 0,
  "downloaded": 0,
  "left": 1234,
  "compact": 1,
  "numwant": 5,
  "event": "started",
  "offers": [
    { "offer": { "type":"offer","sdp":"v=0\r\n..." }, "offer_id": "<20 bytes>" }
  ]
}
```

**Servidor → Cliente (resposta com peers):**

```jsonc
{
  "action": "announce",
  "info_hash": "<20 bytes>",
  "interval": 120,
  "complete": 1,
  "incomplete": 1,
  "peers": [
    { "peer id": "<20 bytes>", "ip": "1.2.3.4", "port": 6881 }
  ]
}
```

**Servidor → Outros peers (forward de offer):**

```jsonc
{
  "action": "announce",
  "offer": { ... },
  "offer_id": "<20 bytes>",
  "peer_id": "<20 bytes>",
  "info_hash": "<20 bytes>"
}
```

---

## 4. Mapeamento de arquivos `bittorrent-tracker/` → `tracker-server/src/`

| Upstream (Node) | Deno (nosso) | Adaptações |
|---|---|---|
| `server.js` (Server class) | `server.ts` (TrackerServer) | Substitui `http.createServer`+`WebSocketServer` por `Deno.serve({ port })` + `Deno.upgradeWebSocket()`. Remove UDP. Mantém `/stats` e `/stats.json`. `EventEmitter` → `TypedEventTarget` (`src/utils/`). |
| `swarm.js` (Swarm class) | `swarm.ts` (Swarm) | Substitui `lru` por implementação caseira de LRU (≤ 80 linhas) ou importa `lru@npm:` via `npm:` specifier. Mantém `randomIterate` do upstream (≤ 30 linhas) ou usa `crypto.getRandomValues` para sampling. |
| `parse-websocket.js` | `parse-websocket.ts` | **Quase 1:1** — só converte `if (socket.upgradeReq)` para Deno (não há `upgradeReq`; obtém `ip`/`port` de `Deno.ServerWebSocket.remoteAddr`). Validações idênticas. |
| `common.js` + `common-node.js` | `constants.ts` | Copia constantes puras (`IPV4_RE`, `IPV6_RE`, `MAX_ANNOUNCE_PEERS`, `EVENT_NAMES`, etc.). Remove `querystring` helpers (não usado em WS). |
| `client.js` | — | Não portar — é o cliente, já temos `WsTracker` em `src/network/tracker.ts`. |
| `websocket-tracker.js` | — | Não portar — é o cliente. Servidor não usa. |

### 4.1 Decisões de adaptação críticas

1. **`Deno.upgradeWebSocket()`** — recebe `Request`, retorna
   `{ socket, response }`. O `socket` é um `Deno.WebSocket` com API
   parecida com `WebSocket` mas com método `.send()` e eventos via
   listener (`.onmessage`, `.onclose`, `.onerror`). Armazena ip/port
   via `socket.remoteAddr` (`Deno.NetAddr`).

2. **Sem `peerid` library** — `bittorrent-peerid` é dependência node-only.
   Para `/stats` groupByClient, **v1 retorna só contagens sem nome de
   client**; v2 pode reusar nossa `src/utils/peerid.ts` se ela for
   portável (verificar).

3. **LRU próprio** — `lru@npm:` funciona em Deno via `npm:` specifier,
   mas é +10kB. Para 1000 peers máx., um Map + timestamp é suficiente
   e remove dependência:

   ```ts
   class PeerLRU {
     private map = new Map<string, { value: Peer; ts: number }>();
     constructor(private max: number, private ttl: number) {}
     get(id: string): Peer | undefined { ... }
     set(id: string, value: Peer) { ... }
     peek(id: string): Peer | undefined { ... } // sem bump
     remove(id: string) { ... }
     keys(): IterableIterator<string> { ... }
   }
   ```

4. **`randomIterate` próprio** — Fisher-Yates sobre `Array.from(this.map.keys())`
   no momento do `_getPeers()`. Lista máx. 1000 elementos, custo desprezível.

5. **`hex2bin` / `bin2hex` / `arr2text` / `arr2hex`** — já temos
   equivalentes em `src/utils/encode-util.ts`. **Reutilizar** ou
   duplicar no `tracker-server/`? Resposta: duplicar (tracker-server
   é independente, sem `src/`). Implementar `bin2hex` (16 linhas)
   e `arr2text` (5 linhas) inline em `constants.ts` ou `peer.ts`.

6. **`ws` library** — não usar. `Deno.upgradeWebSocket()` cobre
   o `WebSocketServer` do upstream.

7. **`bencode`** — **não usar** no servidor WS. Mensagens são JSON,
   conforme `parse-websocket.js`. BEP-15 sobre WS é JSON puro.

8. **Sem UDP** — `_onUdpRequest` removido. O `monorepo/webtorrent/`
   já descartou suporte a UDP no cliente; o tracker também fica sem
   UDP por enquanto.

---

## 5. Plano de execução por tarefas

### Fase 8.0 — Esqueleto e constantes (≈ 1–2 h)

| # | Tarefa | Arquivo | Saída |
|---|---|---|---|
| 8.0.1 | Criar `tracker-server/deno.json` com tasks (`start`, `dev`, `test`) | `deno.json` | `deno task -l tracker-server` |
| 8.0.2 | Portar constantes puras de `common.js`+`common-node.js` | `src/constants.ts` | `ACTIONS`, `EVENTS`, `EVENT_NAMES`, `EVENT_IDS`, `IPV4_RE`, `IPV6_RE`, `MAX_ANNOUNCE_PEERS`, limites |
| 8.0.3 | Helpers `bin2hex`/`arr2text`/`text2arr` | `src/encode.ts` | Funções puras |
| 8.0.4 | Logger simples com prefixo `[tracker]` | `src/log.ts` | `log.debug/info/warn` |
| 8.0.5 | `errors.ts` com `TrackerServerError` tipado | `src/errors.ts` | Erro com `code: "INVALID_INFO_HASH"\|...` |

### Fase 8.1 — Parse de mensagem (≈ 2 h)

| # | Tarefa | Arquivo | Notas |
|---|---|---|---|
| 8.1.1 | Portar `parse-websocket.js` para TS | `src/parse-websocket.ts` | Tipar `ParsedWsAnnounce`, `ParsedWsScrape` |
| 8.1.2 | Substituir `socket.upgradeReq` por `Deno.ServerWebSocket.remoteAddr` | `src/parse-websocket.ts` | IPv4 mapped IPv6 stripping via `REMOVE_IPV4_MAPPED_IPV6_RE` |
| 8.1.3 | Testes de borda (info_hash errado, offer inválido, etc.) | `tests/parse-websocket_test.ts` | 15+ casos |

### Fase 8.2 — Swarm + Peer + LRU (≈ 3 h)

| # | Tarefa | Arquivo | Notas |
|---|---|---|---|
| 8.2.1 | Implementar `PeerLRU` próprio (Map + timestamp) | `src/lru.ts` | Máx. 80 linhas |
| 8.2.2 | Implementar `Swarm` (1:1 com upstream, TS tipado) | `src/swarm.ts` | Preservar `announce`/`scrape`/`_getPeers` com `randomIterate` próprio |
| 8.2.3 | Implementar `Peer` (estado de uma conexão) | `src/peer.ts` | `infoHashes[]`, `peerId` (hex), `socket`, `onSend`, `onMessageBound`, `onCloseBound`, `onErrorBound` |
| 8.2.4 | `Swarm.announce` com eventos `started`/`stopped`/`completed`/`update`/`paused` | `src/swarm.ts` | Ajustar contadores `complete`/`incomplete` |
| 8.2.5 | Testes unitários Swarm (anúncios, LRU eviction, _getPeers random) | `tests/swarm_test.ts` | 20+ casos |

### Fase 8.3 — TrackerServer (≈ 4 h)

| # | Tarefa | Arquivo | Notas |
|---|---|---|---|
| 8.3.1 | `TrackerServer` com `Deno.serve({ port })` + `Deno.upgradeWebSocket()` | `src/server.ts` | Aceita `http://` e `https://` (TLS opcional via certs) |
| 8.3.2 | `onWebSocketConnection` (estado por socket, listeners) | `src/server.ts` | `peerId`/`infoHashes` anexados ao socket (mesmo padrão upstream) |
| 8.3.3 | `_onWebSocketRequest` (parse + dispatch para Swarm) | `src/server.ts` | Suporte a `answer` (forward para `to_peer_id`) |
| 8.3.4 | Forward de `offer` para `numwant` peers do swarm | `src/server.ts` | Mesmo padrão upstream, com `peers[i].socket.send(...)` |
| 8.3.5 | `_onWebSocketClose` (sintético `stopped` para cada infoHash) | `src/server.ts` | Idêntico ao upstream |
| 8.3.6 | `/stats` HTML + `/stats.json` (sem groupByClient em v1) | `src/stats.ts` | `torrents`, `activeTorrents`, `peersAll`, `peersSeederOnly`, etc. |
| 8.3.7 | EventEmitter → `TypedEventTarget` (`listening`, `warning`, `error`, `start`, `complete`, `stop`) | `src/server.ts` | Tipos dos eventos em `src/types.ts` |
| 8.3.8 | `listen()` + `close()` + `createSwarm()` + `getSwarm()` | `src/server.ts` | `AddressInfo` retornado em `listen()` |

### Fase 8.4 — Endurecimento (≈ 2 h)

| # | Tarefa | Arquivo | Notas |
|---|---|---|---|
| 8.4.1 | `filter` hook (allow/deny por infoHash) | `src/server.ts` | Igual ao upstream, opcional |
| 8.4.2 | Limite de tamanho de mensagem (64 KiB) | `src/server.ts` | `socket.addEventListener("message", ...)` checa `data.length` |
| 8.4.3 | Limite de numwant aceito (capping em `MAX_ANNOUNCE_PEERS`) | `src/parse-websocket.ts` | Idêntico ao upstream |
| 8.4.4 | Graceful shutdown (`SIGINT`/`SIGTERM` → `close()`) | `src/cli.ts` | Deno tem `Deno.addSignalListener` |
| 8.4.5 | Limite de infoHashes por socket (ex: 100) | `src/server.ts` | Defesa contra abuso |

### Fase 8.5 — CLI + Docker (≈ 1 h)

| # | Tarefa | Arquivo | Notas |
|---|---|---|---|
| 8.5.1 | `src/cli.ts` com `parseArgs` para `--port`, `--host`, `--interval` | `src/cli.ts` | Exemplo: `deno task start -- --port=8001` |
| 8.5.2 | `deno task start` no `deno.json` | `deno.json` | `deno run -A --unstable-net src/cli.ts` |
| 8.5.3 | `deno task dev` com `--watch` | `deno.json` | Reload em mudanças |
| 8.5.4 | `deno task test` rodando `tests/` | `deno.json` | `deno test -A --unstable-net` |
| 8.5.5 | `Dockerfile` mínimo (multi-stage) | `Dockerfile` | `denoland/deno:distroless` + `EXPOSE 8001` |
| 8.5.6 | `README.md` com instruções de uso local + Deno Deploy | `README.md` | Inclui `wss://` exemplo para o client |

### Fase 8.6 — Teste de integração (≈ 2 h)

| # | Tarefa | Arquivo | Notas |
|---|---|---|---|
| 8.6.1 | Subir `TrackerServer` em porta aleatória (`port: 0`) | `tests/integration_test.ts` | `Deno.serve({ port: 0, ... })`, lê `addr.port` |
| 8.6.2 | Conectar 2 WebSocket clients (`new WebSocket(...)`) | `tests/integration_test.ts` | Cliente A anuncia, Cliente B anuncia, A recebe B como peer |
| 8.6.3 | Validar forward de `offer` (A envia offer, B recebe offer do swarm) | `tests/integration_test.ts` | Assertiva sobre `data.action === "announce" && data.offer` |
| 8.6.4 | Validar `scrape` (A scrape, recebe `files[infoHash]`) | `tests/integration_test.ts` | Hash binário (20 bytes) |
| 8.6.5 | Validar `/stats.json` com `torrents >= 1` | `tests/integration_test.ts` | `fetch` ao server |

### Fase 8.7 — Smoke test com cliente real (≈ 1 h)

| # | Tarefa | Arquivo | Notas |
|---|---|---|---|
| 8.7.1 | Subir o tracker em `ws://localhost:8001` | manual | `deno task start` |
| 8.7.2 | Configurar `torrent-context.tsx` para usar `ws://localhost:8001/announce` | `example/torrent-context.tsx` | Substituir `wss://tracker.openbittorrent.com/announce` |
| 8.7.3 | Rodar `deno task --config ~/github/loco/deno.jsonc build webtorrent` | manual | Confirmar 0 type errors |
| 8.7.4 | Rodar `deno task --config ~/github/loco/monorepo/webtorrent/deno.jsonc server` | manual | Confirmar SW registra |
| 8.7.5 | Abrir 2 abas com o mesmo magnet → verificar `peers.length > 0` | manual | Logs do tracker devem mostrar 2 announces + 1 offer forward |
| 8.7.6 | Verificar download de peça (Piece → wire → storage) | manual | `torrent.progress > 0` na aba leech |

### Fase 8.8 — Documentação e changelog (≈ 30 min)

| # | Tarefa | Arquivo | Notas |
|---|---|---|---|
| 8.8.1 | Adicionar Fase 8 ao plano de ação em `QWEN.md` raiz | `../QWEN.md` | Tabela de fases com link para este arquivo |
| 8.8.2 | Atualizar matriz de paridade (adicionar `tracker-server`) | `../QWEN.md` §5 | 🟢 quando v1 concluído |
| 8.8.3 | Adicionar entrada de changelog | `../QWEN.md` §7 | "Fase 8: tracker WebSocket em Deno" |

---

## 6. Critérios de aceite (v1)

A Fase 8 está completa quando **todos** os itens abaixo forem verdade:

### Funcionais
- [ ] `deno task start` sobe o tracker em `ws://localhost:8001` sem erros
- [ ] `deno task test` passa **todos** os testes (unitários + integração)
- [ ] Cliente PWA consegue conectar a `ws://localhost:8001/announce` em 2 abas
- [ ] Cliente A anuncia → Cliente B anuncia → A recebe B como peer (offer/answer)
- [ ] Cliente A scrape → recebe `{ files: { "<infoHash>": { complete, incomplete }}}`
- [ ] `GET http://localhost:8001/stats.json` retorna JSON com contagens
- [ ] Fechar a aba de A dispara `stopped` no tracker (verificável via `complete`/`incomplete` decrescer)

### Não-funcionais
- [ ] 0 type errors (`deno check **/*.ts`)
- [ ] 0 warnings de `deno lint`
- [ ] Sem dependência `npm:` (apenas Deno std + tracker-server próprio)
- [ ] Build não inclui código do tracker (verificar bundle: `webtorrent.min.js` continua ≈150kB)
- [ ] `src/` permanece browser-first: nenhum `Deno.*` em `src/`
- [ ] Tempo de startup < 100 ms
- [ ] Memória em swarm vazio < 50 MB
- [ ] 1000 peers simultâneos em 1 swarm sem degradação perceptível

### Documentação
- [ ] `tracker-server/README.md` cobre instalação, uso, deploy
- [ ] `tracker-server/Dockerfile` builda e roda
- [ ] `QWEN.md` raiz atualizado com Fase 8
- [ ] Diagrama de sequência de announce + offer/answer no `tracker-server/README.md`

---

## 7. Riscos e mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| `Deno.upgradeWebSocket()` muda em versões instáveis | Média | Baixo | Fixar `deno --version` no `Dockerfile` e na doc |
| LRU próprio tem bug de O(n) em eviction | Baixa | Médio | Testes de stress com 10k peers em `tests/swarm_test.ts` |
| Browser bloqueia `ws://` (não `wss://`) em HTTPS | Alta (se o PWA rodar em HTTPS) | Alto | v1 aceita `ws://` e `wss://`. Em produção, sempre usar `wss://` com proxy reverso (Caddy, nginx) ou Deno Deploy |
| Forward de offer excede o limite de `Deno.WebSocket.send` (rate limit interno) | Baixa | Médio | Limitar `numwant` ao receber (não ao enviar) — já feito pelo upstream |
| LRU TTL longo → peers mortos poluem swarm | Média | Médio | `Deno.upgradeWebSocket` expõe `socket.isClosed`; onClose dispara `stopped` sintético |
| Cliente A e B no mesmo IP/NAT → não conseguem conectar via WebRTC | Alta em localhost | Médio | Já existe STUN em `torrent-context.tsx`. Adicionar TURN em v2 se necessário |
| `WebSocket.send()` lança quando buffer cheio | Baixa | Médio | Capturar com `try/catch` no `onSend` e fechar socket (igual upstream) |

---

## 8. Pós-v1 — Roadmap futuro (v2+)

### Fase 9 — Tracker HTTP/UDP (BEP-3 completo)
- `onHttpRequest` com `bencode` (reusar `src/utils/bencode.ts`)
- `onUdpRequest` com `Deno.listenDatagram` (`--unstable-net` ou `Deno.DatagramConn` em APIs estáveis)
- Compatibilidade com clientes BitTorrent clássicos (qBittorrent, Transmission)

### Fase 10 — Persistência opcional
- Deno KV (`Deno.openKv()`) para stats e `info_hash`s recentes
- Snapshot/restore em reinício

### Fase 11 — Autenticação e rate limiting
- Token por info_hash (HMAC do peer_id)
- Rate limit por IP (token bucket in-memory)

### Fase 12 — Federation
- Múltiplas instâncias trocando swarms via gossip
- Útil para deploy distribuído em múltiplas regiões

### Fase 13 — `client.scrape` no `@loco/webtorrent` (BEP-48)
- Expor método em `src/mod.ts` para consultar `ws://tracker/announce` via WS
- Já existe `scrapeTracker` em `src/network/tracker.ts` mas só para HTTP

---

## 9. Referências

- **BEP-3** — The BitTorrent Protocol Specification (peer messages)
- **BEP-15** — UDP Tracker Protocol (a parte WS é "tracker over websocket", não BEP oficial, mas especificada em `webtorrent/bittorrent-tracker`)
- **BEP-23** — Tracker Returns Compact Peer Lists
- **BEP-31** — WebSocket Tracker Protocol (offer/answer signaling)
- **BEP-48** — Tracker Protocol Extension: Scrape
- **WebSocket API no Deno** — https://docs.deno.com/runtime/manual/runtime/web_platform_apis#websocket
- **Deno Deploy WebSockets** — https://docs.deno.com/deploy/manual/runtime-broadcasts#websockets
- **Upstream `webtorrent/bittorrent-tracker`** — referência de protocolo (em `monorepo/webtorrent/bittorrent-tracker/`)
- **QWEN.md raiz** — regras de ouro do `@loco/webtorrent`

---

## 10. Anexo — Mensagens JSON (BEP-15 + BEP-31)

### 10.1 Cliente → Tracker: `announce` (started)
```json
{
  "action": "announce",
  "info_hash": "ÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿ",  // 20 bytes latin-1
  "peer_id":   "ÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿ",  // 20 bytes latin-1
  "port": 6881,
  "uploaded": 0,
  "downloaded": 0,
  "left": 1234,
  "compact": 1,
  "numwant": 5,
  "event": "started"
}
```

### 10.2 Cliente → Tracker: `announce` (com offer)
```json
{
  "action": "announce",
  "info_hash": "...",
  "peer_id":   "...",
  "port": 6881,
  "uploaded": 0,
  "downloaded": 0,
  "left": 0,
  "event": "",
  "numwant": 5,
  "offers": [
    {
      "offer": { "type": "offer", "sdp": "v=0\r\n..." },
      "offer_id": "ÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿ"  // 20 bytes
    }
  ]
}
```

### 10.3 Tracker → Cliente: `announce` (resposta)
```json
{
  "action": "announce",
  "info_hash": "...",
  "interval": 120,
  "complete": 1,
  "incomplete": 1,
  "peers": [
    { "peer id": "...", "ip": "1.2.3.4", "port": 6881 }
  ]
}
```

### 10.4 Tracker → Cliente: `announce` (forward de offer)
```json
{
  "action": "announce",
  "offer": { "type": "offer", "sdp": "..." },
  "offer_id": "...",
  "peer_id": "...",
  "info_hash": "..."
}
```

### 10.5 Cliente → Tracker: `answer`
```json
{
  "action": "announce",
  "info_hash": "...",
  "peer_id":   "...",
  "to_peer_id": "...",
  "answer": { "type": "answer", "sdp": "..." },
  "offer_id": "..."
}
```

### 10.6 Cliente → Tracker: `scrape`
```json
{
  "action": "scrape",
  "info_hash": "..."
}
```

### 10.7 Tracker → Cliente: `scrape` (resposta)
```json
{
  "action": "scrape",
  "files": {
    "ÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿ": {
      "complete": 1,
      "incomplete": 1,
      "downloaded": 5
    }
  },
  "flags": { "min_request_interval": 600 }
}
```

### 10.8 Tracker → Cliente: erro
```json
{
  "action": "announce",
  "info_hash": "...",
  "failure reason": "invalid info_hash"
}
```
