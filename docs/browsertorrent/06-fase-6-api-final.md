# Fase 6 — API Final @loco/webtorrent: Proposta de Implementação

> **Contexto:** Análise comparativa detalhada entre `@loco/webtorrent` e `webtorrent.min.js`, identificando lacunas browser-aplicáveis e melhorias do `deno-torrent` a incorporar.

---

## 1. Resumo Executivo

A implementação atual do `@loco/webtorrent` cobre **~75%** da API pública do `webtorrent.min.js`, com 568 testes passando. A análise identificou **22 lacunas browser-aplicáveis** no `webtorrent.min.js` e **15 melhorias** do `deno-torrent` ainda não portadas. Deste universo, a Fase 6 propõe implementar **13 capacidades de alta/média prioridade** que são viáveis no browser,afeitas de dependências Node/UDP, e que impactam diretamente a experiência do usuário do Loco PWA.

---

## 2. Capacidades Prioritárias para Implementação

### 🟥 Críticos (Alta Prioridade)

#### 2.1 `client.seed(input, opts?, cb?)` — **CAPACIDADE CENTRAL**

**Por que é crítico:** É a另一半 do BitTorrent — sem seed, só baixamos. O `webtorrent.min.js` implementa isso nativamente e é uma das APIs mais usadas. A boa notícia: **já temos 100% do código necessário** — o `torrent-generator/` (Fase 5.3) implementa `generateTorrent()` com OPFS.

**Implementação necessária:**
1. Criar `src/client-seed.ts` — método `seed()` no `WebTorrent`
2. Aceitar inputs: `FileSystemFileHandle[]`, `FileSystemDirectoryHandle`, `File[]`, `Uint8Array`, `Blob`
3. Usar `generateTorrent()` internamente
4. Chamar `client.add()` com o `.torrent` resultante
5. Retornar a `Torrent` (ou chamar `cb` se fornecido)

```typescript
// Proposta de API
interface SeedOptions extends AddTorrentOptions {
  name?: string;
  pieceSize?: PieceSizeEnum | number;
  trackers?: string[];
  webSeeds?: string[];
  private?: boolean;
  comment?: string;
  createdBy?: string;
}

async seed(
  input: FileSystemFileHandle | FileSystemFileHandle[] | FileSystemDirectoryHandle | File | Blob | Uint8Array | { files: File[] },
  opts?: SeedOptions,
  cb?: (torrent: Torrent) => void
): Promise<Torrent>
```

**Estimativa:** 150–200 linhas de código (o generator já existe).

---

#### 2.2 Fix do Tracker HTTP — Encoding byte-a-byte + IPv6 + Deduplicação

**Por que é crítico:** O tracker HTTP é a porta de entrada de peers. Se o announce falhar por encoding errado, o torrent nunca encontra peers.

**Melhorias do deno-torrent a incorporar:**
1. **Encoding byte-a-byte:** `%XX` encoding correto para TODO byte não-ASCII — não usar `encodeURIComponent()` que codifica mais do que o necessário (espaços como `%20` em vez de `+`, parênteses, colchetes opcionais etc.)
2. **`parseCompactIpv6Peers`:** Suporte a peers IPv6 no response compact (BEP 7)
3. **`deduplicatePeers`:** Evitar peers duplicados no response
4. **`validateAnnounceRequest`:** Validar tamanhos de strings, bounds de integers

**Estimativa:** 100–150 linhas. Impacto: alta confiabilidade.

---

### 🟨 Alta Prioridade

#### 2.3 `WebTorrent.WEBRTC_SUPPORT` — Static boolean

**Implementação:** Deteção do ambiente:
```typescript
static readonly WEBRTC_SUPPORT: boolean =
  typeof RTCPeerConnection !== "undefined" &&
  typeof globalThis.RTCPeerConnection !== "undefined";
```

#### 2.4 Getters Agregados no Client

```typescript
// client.ts — adicionados em WebTorrent
get downloadSpeed(): number   // bytes/s soma de todos os torrents
get uploadSpeed(): number     // bytes/s soma de todos os torrents
get progress(): number        // 0..1 ponderado por tamanho
get ratio(): number           // uploaded/downloaded agregado
```

#### 2.5 `client.throttleDownload(rate)` / `client.throttleUpload(rate)`

```typescript
throttleDownload(rate: number): void  // rate em bytes/s, 0 = sem limite
throttleUpload(rate: number): void
```

Propaga para todos os `Wire` ativos via throttle nos writes.

#### 2.6 `torrent.torrentFile` (Uint8Array) + `torrent.torrentFileBlob` (Blob)

```typescript
get torrentFile(): Uint8Array   // .torrent bencoded bytes
get torrentFileBlob(): Blob     // new Blob([torrentFile])
```

**Implementação:** `encodeTorrent(parsed)` usando o generator internamente (sem OPFS, só o `Writer` em memória).

---

### 🟩 Média Prioridade

#### 2.7 Metadados de Torrent

```typescript
get created(): Date | undefined   // "creation date" do .torrent
get createdBy(): string | undefined
get comment(): string | undefined
get done(): boolean               // alias semântico de ready
get received(): number            // alias de downloaded
```

#### 2.8 `torrent.pieces[]` — Array de Piece objects

```typescript
get pieces(): Piece[]  // Em vez de só bitfield, expõe Piece[]
```

#### 2.9 `torrent.announce[]` + `torrent.maxWebConns`

```typescript
get announce(): string[]   // lista de todos os trackers
get maxWebConns(): number  // configurable, default 10
```

#### 2.10 `torrent.select(start, end, priority?, notify?)` — Assinatura completa

Adicionar `priority` (0–7) e `notify` (boolean) ao `select()` existente.

#### 2.11 `torrent.rescanFiles(cb?)`

Re-verifica todas as peças no store, úteis após manipulação externa do store.

#### 2.12 `file.type` (MIME detection)

```typescript
get type(): string  // ex: "video/mp4", "application/pdf"
```

Implementação: mapa de extensão → MIME type (extensão kecil → lookup table).

#### 2.13 `file.downloaded` + `file.progress` (por arquivo)

```typescript
get downloaded(): number   // bytes baixados deste arquivo específico
get progress(): number    // 0..1
```

#### 2.14 `file.on('download', bytes)` + `file.on('upload', bytes)` Eventos

Forward dos eventos do Torrent para cada File.

#### 2.15 `wire.uploadSpeed` / `wire.downloadSpeed` / `wire.remoteAddress` / `wire.remotePort`

```typescript
get uploadSpeed(): number    // bytes/s
get downloadSpeed(): number  // bytes/s
get remoteAddress(): string
get remotePort(): number
```

---

### 🟦 Melhorias do deno-torrent (importantes, não-críticas)

| # | Módulo deno-torrent | O que aporta | Dificuldade |
|---|---|---|---|
| 1 | `metainfo/identity.ts` | Preserva bytes exatos do `info` dict (sem re-encode), `calculateInfoHashV2` | Média |
| 2 | `metainfo/parser.ts` | `TorrentParseError` + validação rigorosa BEP 3/12/19/47/52 | Média |
| 3 | `metainfo/path.ts` | `isSafePathComponent` (rejeita `..`, NUL, path separators) | Trivial |
| 4 | `metainfo/types.ts` | `TorrentV2Info`, `TorrentFileTree` types | Baixa |
| 5 | `metainfo/v2.ts` | `flattenV2Files`, validação de piece layers v2 | Média |
| 6 | `peerwire/peer_wire.ts` | Correlação request/response Promise-based | Média |
| 7 | `peerwire/ut_metadata.ts` | Pipelining + per-block timeout nos metadata requests | Média |
| 8 | `peerid/peerid.ts` | `encodeAzStyle()`, `encodeShadowStyle()` | Trivial |
| 9 | `torrent-tracker/request.ts` | `validateAnnounceRequest` + limites | Baixa |
| 10 | `utp/` | uTP protocol (UDP) | **Não portar** (UDP indisponível no browser) |
| 11 | `torrent-dht/` | Kademlia DHT | **Postergar** (futuro relay WebRTC) |

---

## 3. O que NÃO Implementar

| Capacidade | Motivo |
|---|---|
| `DHT`, `utP`, `LSD`, `NAT-PMP`, `UPnP` | UDP/mDNS/TCP sockets indisponíveis no browser |
| `blocklist` (IP set) | Sem range `net` module |
| `path` (torrent save location) | Sem filesystem paths no browser |
| `client.get(torrentId)` | Trivial; `client.torrents.get(infoHash)` já existe |
| File advanced `stream` event com `req` callback | Sobrecarga desnecessária para o caso de uso do Loco |

---

## 4. Estimativa de Esforço

| Fase | Escopo | Linhas estimadas | Testes estimados |
|---|---|---|---|
| **6.1** seed() | 1 novo arquivo + integração | ~200 | ~30 |
| **6.2** tracker HTTP fix | 1 arquivo | ~150 | ~20 |
| **6.3** WebRTC_SUPPORT + agregados + throttle | `mod.ts` | ~80 | ~10 |
| **6.4** torrentFile + metadados | `torrent.ts` | ~100 | ~15 |
| **6.5** file.type + downloaded + progress | `file.ts` | ~60 | ~10 |
| **6.6** wire speed + remote address | `wire.ts` | ~40 | ~5 |
| **6.7** metainfo improvements | `parse-torrent.ts` | ~120 | ~20 |
| **Total** | | **~750** | **~110** |

---

## 5. Ordem de Implementação Recomendada

```
6.1 → 6.2 → 6.3 → 6.4 → 6.5 → 6.6 → 6.7
```

**Justificativa:**
1. `seed()` primeiro — máxima visibilidade/impacto, o generator já existe
2. `tracker HTTP fix` segundo — sem peers, seed/download não funcionam
3. Aggregated getters + throttle terceiro — APIs pequenas e independentes
4. `torrentFile` + metadados quarto — extensiones do torrent já existente
5. `file.type` + per-file stats quinto — extensões do file já existente
6. `wire` speed/address sexto — extensões menores do wire
7. `metainfo` por último — robusta mas não bloqueia funcionalidades principais
