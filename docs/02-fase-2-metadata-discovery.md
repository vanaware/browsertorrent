# Fase 2: Metadata & Discovery (Magnet v2, Metainfo Rigoroso, Tracker)

## 🎯 Objetivo da Fase
Na Fase 2, substituímos os parsers minimalistas de magnet e metainfo por implementações robustas baseadas na referência do `deno-torrent/`. O foco foi:
- Suporte completo a BitTorrent v1 e v2 (BEP 52) em links magnéticos.
- Preservação fiel dos bytes do dicionário `info` para hashes corretos (BEP 9).
- Validação rigorosa de `.torrent` files (BEP 3/12/19/47/52).
- Tracker HTTP com percent-encoding byte-a-byte e peers compactos IPv4/IPv6.

---

## 🧲 1. Magnet Link (`src/utils/magnet.ts`)

Adaptado de `deno-torrent/magnet/magnet.ts`. Substituímos `@std/encoding/base32` e `@std/encoding/hex` por utilitários locais de `encoding.ts`. O parser usa um analisador de query-string customizado com limites de recursos (evita DoS via URI excessivamente longa).

### Decisões de Implementação
1. **Suporte v1 + v2**: decodifica `urn:btih:` (v1/SHA-1), `urn:btmh:1220...` (v2/SHA-256), e híbridos (ambos os `xt`).
2. **`handshakeHash`**: sempre 20 bytes — v1 usa o SHA-1 completo; v2 usa os primeiros 20 bytes do hash de 32 bytes.
3. **`infoHash`**: sempre 40 chars hex do handshakeHash — compatível com wire/tracker.
4. **Validação de recursos**: `maxLength` (1 MiB), `maxQueryParameters` (1024), `maxQueryParameterLength` (64 KiB).
5. **`buildMagnetV2`**: reconstrói URI magnética v2 com opções (nome, trackers, web seeds, peers, URL do torrent).
6. **`isValidMagnet`**: validação formal sem parsing completo.

### API Pública
- `parseMagnet(uri, opts?)`: `ParsedMagnet`
- `encodeMagnet(parsed)`: string
- `buildMagnetV2(hash, opts?)`: string
- `isValidMagnet(uri)`: boolean
- `isSha1Hex(str)`: boolean
- `isSha1Base32(str)`: boolean

---

## 📦 2. Metainfo Parser (`src/utils/metainfo-parser.ts`)

Adaptado de `deno-torrent/metainfo/parser.ts`. Parser rigoroso de buffers `.torrent` bencodeados. Valida BEP 3, 12, 19, 47 e 52 com erros tipados (`TorrentParseError`).

### Decisões de Implementação
1. **Uint8Array apenas**: browser-first, sem `Reader`/`IoUtil` do Deno.
2. **Map→Record**: decodifica com `useMap` para preservar chaves binárias de `piece layers`, depois normaliza para `Record`.
3. **Validação de campos**: `piece length`, `pieces`, `name`, caminhos (`isSafePathComponent` rejeita `..`/`.`/NUL).
4. **Limites**: `maxBytes` (16 MiB default), `maxPathLength`, `maxFileCount`.
5. **Rejeita BEP-3 com piece layers**: incompatibilidade de layout.

### API Pública
- `parseMetainfo(buffer, opts?)`: `ParsedTorrent`

---

## 🔗 3. Metainfo Identity (`src/utils/metainfo-identity.ts`)

Preserva os bytes exatos do dicionário `info` para cálculo fiel do infoHash (BEP 9). Resolve divergência da versão anterior que fazia `sha1(encode(info))`.

### Decisões de Implementação
1. **`infoBytes`**: bytes bencodeados exatos do `info` dict — base para hash fiel.
2. **`calculateInfoHashV2`**: SHA-256 do `info` dict para v2/hybrid.
3. **`wrapInfoBytes`**: encapsula bytes com contexto v2.
4. **`parseTorrentWithIdentity`**: integra identity ao parser.

---

## 📋 4. Tipos V2 (`src/utils/torrent-types.ts`)

Tipos TypeScript para metadados v2/hybrid, portados de `deno-torrent/metainfo/types.ts`.

### Tipos
- `TorrentV2Info`: `name`, `piece length`, `file tree`, `pieces root`
- `TorrentFileTree`: hierarquia de diretórios
- `PieceSizeEnum`: tamanhos de peça válidos
- `ParseTorrentOptions`: `maxBytes`, `allowMissingPieceLayers`

---

## 🔍 5. Parse-Torrent Unificado (`src/utils/parse-torrent.ts`)

Interface unificada que aceita: Magnet URI, infoHash hex/base32, ou buffer `.torrent`. Delega para `magnet.ts` (strings) ou `metainfo-parser.ts` + `metainfo-identity.ts` (buffers).

### Decisões de Implementação
1. **String**: se 40 hex chars ou 32 base32 → magnet URI; se startsWith `magnet:?` → parseMagnet.
2. **Uint8Array**: `parseTorrentWithIdentity` (rigoroso + faithful hash).
3. **ParsedTorrent**: retorna o objeto direto (idempotência).
4. **Campos novos opcionais**: `infoHashV2`, `infoBytes`, `torrentFileBytes`, `version`.
5. **Backward compatible**: `ParsedTorrentFile` (dados simples) preservado.

---

## 🌐 6. Tracker HTTP (`src/network/tracker.ts`)

Cliente HTTP tracker com percent-encoding byte-a-byte e peers compactos IPv4/IPv6. Substitui a versão anterior que usava `String.fromCharCode` (incorreto para bytes >0x7F).

### Decisões de Implementação
1. **`percentEncodeBytes`**: encode byte-a-byte (não UTF-8). Bytes >0x7F viram `%XX` literal.
2. **`buildAnnounceUrl`**: URLSearchParams com percent-encoding correto de hashes binários.
3. **`parseHttpTrackerResponse`**: decodifica compact IPv4 (6 bytes), IPv6 (18 bytes), dicionário peers.
4. **Deduplicação**: peers compactos deduped; porta 0 descartada.
5. **Validação**: `validateTrackerOptions` com limites (`MAX_NUM_WANT=2000`, `MAX_TRACKER_URL_LENGTH=8192`).
6. **Timeout**: `AbortController` com `DEFAULT_TIMEOUT_MS=15_000`.

### API Pública
- `createTracker(announceUrl, opts): Tracker`
- `HttpTracker.announce(opts?)`: `TrackerResponse`
- `buildAnnounceUrl(url, opts, extra?, trackerId?)`: `URL`
- `parseHttpTrackerResponse(buffer): TrackerResponse`
- `percentEncodeBytes(bytes): string`
- `validateTrackerOptions(url, opts, extra?): void`
- `integerInRange(value, name, min, max): number`

---

## ✅ Status dos Testes (Fase 2)

| Arquivo | Testes | Status |
|---|---|---|
| `tests/magnet_test.ts` | 38 testes | ✅ todos passando |
| `tests/metainfo-parser_test.ts` | 11 testes | ✅ todos passando |
| `tests/tracker_test.ts` | 28 testes | ✅ todos passando |
| `tests/parse-torrent_test.ts` | 6 testes | ✅ todos passando |
| **Total** | **83 testes** | ✅ 0 falhas |

---

## 📊 Paridade com deno-torrent (Fase 2)

| Módulo deno-torrent | src/utils | Estado |
|---|---|---|
| `magnet/magnet.ts` | `magnet.ts` | ✅ completo (v1+v2+build+validate) |
| `metainfo/parser.ts` | `metainfo-parser.ts` | ✅ completo (BEP 3/12/19/47/52) |
| `metainfo/identity.ts` | `metainfo-identity.ts` | ✅ completo (infoBytes, v2 hash) |
| `metainfo/types.ts` | `torrent-types.ts` | ✅ completo (TorrentV2Info, etc.) |
| `torrent-tracker/http.ts` | `tracker.ts` (HttpTracker) | ✅ completo (byte-exact encoding) |
| `torrent-tracker/compact.ts` | `tracker.ts` (parseCompactPeers) | ✅ completo (IPv4+IPv6 dedup) |
| `torrent-tracker/types.ts` | `tracker.ts` (types) | ✅ completo (formal types) |
| `torrent-tracker/request.ts` | `tracker.ts` (constants) | ✅ completo (MAX_NUM_WANT, etc.) |

---

## 🚀 Próximos Passos (Fase 3)
A Fase 3 focará em:
1. **Bitfield** com spare-bit validation (BEP 6)
2. **Peer ID** melhorado (encode genérico, validators, version converters)
3. **Wire** enhancements (BEP 6 Fast, BEP 52 v2 hashes)
4. **ExtensionHost** BEP 10 completo
5. **ut_metadata** melhorado (hash verify, pipelining)