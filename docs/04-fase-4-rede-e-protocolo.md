# /loco/monorepo/webtorrent/docs/04-fase-4-rede-e-protocolo.md

# Fase 4: Rede e Protocolo (Tracker, Wire, Service Worker Bridge)

## 🎯 Objetivo da Fase
Nesta fase, construímos os módulos responsáveis pela **descoberta de peers**, pela **comunicação P2P** e pelo **streaming de arquivos via Service Worker**. Como o navegador impõe restrições severas de segurança (sem acesso a sockets TCP/UDP brutos), adaptamos o protocolo BitTorrent para funcionar exclusivamente sobre **WebRTC** (para dados), **WebSocket/HTTP** (para trackers) e **MessageChannel + Service Worker fetch** (para servir bytes ao `<video>`/`<audio>` do DOM), mantendo a compatibilidade com a especificação oficial (BEPs) e com a API do `webtorrent.min.js` original.

---

## 🧠 Decisões Arquiteturais Críticas

1. **Zero Sockets TCP/UDP**: O browser não permite conexões diretas a IPs e portas de peers tradicionais. A descoberta depende 100% de Trackers (HTTP/WS) e de Peer Exchange (ut_pex) via WebRTC.
2. **Abstração de Transporte (`Transport`)**: O `Wire` (protocolo) e o `WebTorrentServer` (streaming) não devem saber se estão rodando sobre um `RTCDataChannel`, um mock de teste ou um `ServiceWorker` real. Eles recebem uma interface simples (`send`, `onMessage`, `close` / `postMessage`, `requestStream`), garantindo testabilidade unitária sem levantar servidores reais.
3. **Parser de Stream (Acumulador de Buffer)**: Dados chegam em pedaços arbitrários (chunks) pela rede, especialmente no WebRTC, que pode fragmentar mensagens. O `Wire` mantém um `buffer` interno (`Uint8Array`) e acumula os chunks até ter o tamanho completo de uma mensagem.
4. **Uso de `DataView` e Helpers Nativos**: Substituímos completamente o `Buffer` do Node.js. Usamos nossos helpers `readUInt32BE` e `writeUInt32BE` (baseados em `Uint8Array` e operações bitwise) para ler e escrever os cabeçalhos das mensagens de forma performática e nativa.
5. **Streaming via Service Worker com backpressure**: A ponte com o `<video>` do DOM passa por um Service Worker que intercepta requisições `GET` para URLs virtuais do tipo `/webtorrent/<infoHash>/<idx>/<name>`. O main thread responde com `MessageChannel` em modo *pull* (cada `true` enviado pelo SW puxa o próximo bloco), garantindo backpressure real sem sobrecarregar a rede.

---

## 📡 1. Tracker Client (`src/network/tracker.ts`)

O Tracker é o serviço que diz "quem mais está baixando este torrent?". Implementamos suporte nativo a **HTTP/HTTPS** e **WebSocket**, ignorando UDP (inviável no browser).

### Decisões de Implementação
- **HTTP Tracker (Fetch API)**:
  - Utiliza `fetch()` nativo com `AbortController` para timeout (15s).
  - **Codificação Binária na URL**: O protocolo BitTorrent exige que `info_hash` e `peer_id` sejam enviados como bytes brutos na URL, não como strings UTF-8 codificadas. Implementamos um helper `encodeBinary` que converte `Uint8Array` para caracteres de byte único, satisfazendo a especificação sem depender de bibliotecas externas.
  - Decodifica a resposta Bencode e extrai a lista de peers no formato **compact** (6 bytes por peer: 4 de IP + 2 de porta), que é o padrão mais eficiente.
- **WebSocket Tracker**:
  - Essencial para o WebTorrent no browser, pois permite a troca de ofertas SDP (Session Description Protocol) para estabelecer conexões WebRTC diretamente através do tracker.
  - Utiliza a API nativa `WebSocket` e JSON para comunicação (diferente do HTTP, que usa Bencode).
  - Mantém um mapa de `pendingRequests` para correlacionar respostas assíncronas com as promises de `announce()`.
- **Factory Pattern**: A função `createTracker(url, opts)` retorna a instância correta (`HttpTracker` ou `WsTracker`) baseada no protocolo da URL, isolando a lógica de conexão e facilitando testes.

---

## 🔌 2. Wire Protocol (`src/core/wire.ts`)

O Wire Protocol é a "língua" que os peers falam entre si, definida na BEP 3. Ele gerencia o handshake, controle de fluxo e transferência de peças.

### Decisões de Implementação
- **Extensão de `TypedEventTarget`**: Substituímos o `EventEmitter` do Node.js por um wrapper nativo do browser (`EventTarget`) com tipagem estrita para os payloads dos eventos, garantindo segurança de tipos em todo o fluxo de dados.
- **Mensagens Suportadas (BEP 3)**:
  - **Handshake**: Troca de `infoHash` (20 bytes), `peerId` (20 bytes) e extensões (8 bytes).
  - **Controle de Fluxo**: `choke`, `unchoke`, `interested`, `not-interested`.
  - **Gerenciamento de Peças**: `have` (notificação de peça recebida), `bitfield` (mapa de todas as peças), `request` (pedido de bloco), `piece` (dados do bloco), `cancel`.
  - **Extensões (BEP 10)**: `extended` (preparado para `ut_metadata`, `ut_pex`, etc.).
- **Parser de Buffer Acumulador**:
  - O método `_onData(chunk)` acumula os dados recebidos em `this.buffer`.
  - O método `_processBuffer()` verifica continuamente se há mensagens completas no buffer.
  - Lê os 4 primeiros bytes para obter o `length` da mensagem.
  - Se `length === 0`, é um Keep-Alive.
  - Caso contrário, aguarda até que `this.buffer.length >= 4 + length`, extrai o `msgId` e o `payload`, processa a mensagem e remove os bytes processados do buffer (usando `subarray` para evitar cópias desnecessárias de memória).

---

## 🌐 3. Service Worker Bridge — Streaming de arquivos (`src/server/`)

Esta é a parte do Loco que substitui (e estende) o `createServer` do `webtorrent.min.js` original.  O objetivo é entregar bytes do `ChunkStore` para elementos `<video>`/`<audio>`/`<img>` do DOM **enquanto o download ainda está em andamento**, sem nunca precisar de um servidor Node.js ou de uma URL `http://` pré-conhecida.

### 3.1. Anatomia do problema

O `webtorrent.min.js` original tem um método `client.createServer({ controller })` que, ao receber um `ServiceWorker` controller, instala uma "ponte" entre o main thread e o SW:

1. O main thread posta `WEBTORRENT_READY` no SW.  O SW flipa uma flag `isWebTorrentReady = true`.
2. Quando o `<video>` faz `GET /webtorrent/<infoHash>/<idx>/<name>`, o SW intercepta no `fetch` event e, em vez de buscar da rede, abre uma `MessageChannel` e envia `{ type: "webtorrent", url, method, headers, scope, destination }` para o main thread.
3. O main thread responde com `{ body: "STREAM" }` e passa a emitir bytes sob demanda no `port1` da `MessageChannel`.
4. O SW encapsula esses bytes em um `ReadableStream` e devolve um `Response` ao `<video>`.  O `<video>` consome os bytes via MSE/`<source>` como se fosse um servidor HTTP normal.

O Loco reproduz esse mesmo protocolo, mas com um diferencial: o transporte é **abstraído** numa interface `Transport`, o que permite testar todo o ciclo (incluindo backpressure, cancelamento e timeout) **sem subir um Service Worker real**.

### 3.2. Módulos

#### `src/server/stream-manager.ts`
- **`StreamManager`**: registro em memória que mapeia `(infoHash, fileIndex)` para `File`.  Usado pelo main thread para responder a requisições do SW.
- **`streamManager` (singleton)**: instância global partilhada por `WebTorrent` e `WebTorrentServer`.
- **`buildStreamURL(scope, infoHash, fileIndex, name)`**: monta a URL virtual `/<scope>webtorrent/<infoHash>/<idx>/<encodedName>`.
- **`parseStreamURL(url, scope)`**: parsing reverso com validação rigorosa (infoHash de 40 hex chars, `fileIndex` non-negative safe integer, nome URL-decodificado).

#### `src/server/server.ts`
- **`Transport` (interface)**: contrato com `postMessage` e `requestStream`.  Implementado por:
  - `createServiceWorkerTransport(controller, scope)` — produção, fala com `navigator.serviceWorker`.
  - `InProcessTransport` — usado pelos testes, registra mensagens e permite simular `WEBTORRENT_ACK` e chunks.
- **`WebTorrentServer`**: classe principal.  Mantém `scope`, `isReady`, `isDestroyed` e implementa:
  - `sendReadyAck()` — posta `{ type: "WEBTORRENT_ACK" }` no SW.
  - `handleRequest(message, port)` — devolve um `Response` com `ReadableStream` para a URL requisitada, ou `404`/`503` conforme o caso.
  - `destroy()` — fecha o transporte e libera os ports.
- **`buildFileStream(entry, port, transport)`**: cria o `ReadableStream<Uint8Array>` que materializa o arquivo em blocos de 16 KiB (configurável via `STREAM_BLOCK_SIZE`), aguardando `true` no `port` antes de emitir o próximo bloco (backpressure real).
- **`readNextChunk(file, offset, length)`**: helper que será substituído pelo `createReadStream()` real quando a Fase 4.1 entregar o I/O direto do `ChunkStore`; por enquanto, varre o `Symbol.asyncIterator` do `File`.
- **`guessContentType(name)`**: mapeia extensões comuns (mp4, webm, mp3, jpg, pdf, srt, vtt…) para MIME types apropriados; cai em `application/octet-stream` quando não reconhece.
- **`createServer({ controller, scope, transport })`**: factory pública compatível com `webtorrent.min.js`.  Se `controller` é passado, usa o `createServiceWorkerTransport`; se `transport` é passado, usa o fornecido (testes); caso contrário, cai num `InProcessTransport` (modo self-test).
- **`registerTorrentFiles(torrent, files)` / `unregisterTorrentFiles(infoHash)`**: helpers de manutenção do `streamManager`.  Chamados automaticamente por `WebTorrent.add` e `WebTorrent.remove` quando há um servidor ativo.

### 3.3. Integração com `WebTorrent` (`src/mod.ts`)

A classe `WebTorrent` agora expõe:

- `client.server`: a instância de `WebTorrentServer` (ou `null` se ainda não foi criado).
- `client.createServer({ controller, scope })`: cria o servidor e re-registra os torrents existentes.  Idempotente — chamar duas vezes devolve o mesmo objeto.
- `client.initServiceWorker()`: se `serviceWorkerUrl` foi fornecido em `WebTorrentOptions`, registra o SW, espera `navigator.serviceWorker.ready` e cria o servidor com o controller ativo.  Retorna `null` em ambientes sem SW (SSR, testes).
- `_makeFileObjects(torrent, scope)`: constrói instâncias de `File` já com `infoHash`, `fileIndex`, `name` e `scope` populados, de modo que `file.streamURL()` retorne a URL correta.
- Em `add()`: se `this.server` já existe, registra os arquivos novos.
- Em `remove()`: chama `unregisterTorrentFiles(infoHash)` para limpar o registro.
- Em `destroy()`: chama `server.destroy()` se existir.

### 3.4. URL virtual e `File.streamURL()`

`File.streamURL()` agora retorna a URL do SW, e `File.streamTo(video)` faz `video.src = streamURL()`.  Internamente, `File` carrega `infoHash`, `fileIndex`, `name` e `scope` — injetados pelo `WebTorrent` ao construir o objeto.  Se algum desses campos estiver ausente (caso o `File` seja construído manualmente, ex. em testes), o método lança um erro descritivo em vez de montar uma URL inválida.

### 3.5. Vantagens sobre o `webtorrent.min.js` original

| Aspecto | webtorrent.min.js | Loco (`@loco/webtorrent`) |
| --- | --- | --- |
| Acoplamento ao SW | Hard-coded em `webtorrent.min.js` | `Transport` injetável; testável sem SW |
| Cancelamento | Sends `false` on port | Idem + `controller.cancel()` no `ReadableStream` |
| Timeout | Hard-coded 5s | Configurável por transporte |
| MIME type | Apenas `Content-Type` básico | `guessContentType(name)` com 20+ extensões |
| Limpeza de registro | Manual | Automática em `add`/`remove`/`destroy` |
| Backpressure | Pull via `port.onmessage` | Idem + `pendingResolve`/`pendingSignal` abstrato |
| Testes | Poucos e dependentes de browser | `InProcessTransport` permite suite completa em Deno |

### 3.6. Testes (`tests/stream-manager_test.ts`, `tests/server_test.ts`)

- **`stream-manager_test.ts`** (13 testes): CRUD no registro, `unregisterTorrent`, `buildStreamURL` com encoding de caracteres especiais, `parseStreamURL` com validação de infoHash/fileIndex.
- **`server_test.ts`** (18 testes): `createServer` factory, `WebTorrentServer.destroy` idempotente, `handleRequest` retornando `404`/`503`/200 conforme o caso, `InProcessTransport` com fila de mensagens, `guessContentType` para 20+ formatos.

---

## 🌐 APIs Nativas do Browser Utilizadas

| API Nativa | Substitui (Node.js) | Uso no Projeto | Status |
| :--- | :--- | :--- | :--- |
| `fetch()` + `AbortController` | `http`, `https`, `simple-get` | HTTP trackers, web seeds, download de .torrent | ✅ **Implementado** |
| `WebSocket` | `ws` | Conexão com trackers WebSocket (`wss://`) | ✅ **Implementado** |
| `RTCPeerConnection` | `net`, `utp` | Transporte P2P de dados (WebTorrent no browser só suporta WebRTC) | ✅ **Implementado** |
| `RTCSessionDescription` | N/A | Handshake WebRTC (oferta/resposta SDP) | ✅ **Implementado** |
| `RTCIceCandidate` | N/A | Troca de candidatos ICE para NAT traversal | ✅ **Implementado** |
| `RTCDataChannel` | N/A | Canal de dados confiável sobre WebRTC (onde o Wire roda) | ✅ **Implementado** |
| `MessageChannel` | N/A | Backpressure pull-based entre SW e main thread para streaming | ✅ **Implementado** |
| `ServiceWorker` + `fetch` event | N/A | Interceptação de `/webtorrent/*` e entrega de bytes sob demanda | ✅ **Implementado** |
| `Uint8Array` / `DataView` | `Buffer` do Node.js | Manipulação de todos os dados binários do protocolo | ✅ **Implementado** |
| `navigator.storage.getDirectory` | `fs` do Node.js | OPFS para persistência de chunks entre sessões | ✅ **Implementado** |
| `crypto.subtle` | `crypto` do Node.js | SHA-1 / SHA-256 para verificação de peças | ✅ **Implementado** |
| `crypto.randomUUID` | `uuid` | IDs de correlação de request/response entre SW e main thread | ✅ **Implementado** |

---

## 🧪 Testes Implementados

### `tests/tracker_test.ts`
- Valida a factory `createTracker()` para HTTP e WebSocket.
- Testa o lançamento de erro para protocolos não suportados (ex: `udp://`).

### `tests/wire_test.ts`
- **MockTransport**: Cria um par de `Wire`s conectados em memória (loopback) para testar o protocolo sem rede real. O que um envia, o outro recebe instantaneamente via `queueMicrotask`.
- **Handshake**: Valida a troca correta de `peerId` e `infoHash`.
- **Mensagens**: Testa a emissão e recepção de `choke`, `unchoke`, `request` e `piece`.
- **Fragmentação**: Simula dados chegando em pedaços minúsculos (byte a byte) para validar a robustez do parser de stream acumulador.

### `tests/stream-manager_test.ts` (novo)
- CRUD no `streamManager` (registrar, remover, listar, limpar).
- `unregisterTorrent` remove apenas os arquivos do torrent alvo.
- `buildStreamURL` / `parseStreamURL` com edge cases (extensões com espaço, infoHash em maiúsculas, fileIndex inválido, scope divergente).

### `tests/server_test.ts` (novo)
- `createServer` factory em todos os modos (controller, transport, self-test).
- `WebTorrentServer.destroy` é idempotente.
- `handleRequest` retorna `404` para URL fora do padrão, `404` para arquivo não registrado, `503` quando destruído, `200` com headers corretos (`Content-Type` via `guessContentType`, `Content-Length`, `Accept-Ranges`) para arquivo registrado.
- `InProcessTransport` enfileira mensagens, suporta `deliverResponse` e `sendPull` para simular o SW.
- `guessContentType` cobre vídeo, áudio, imagem, documento e legendas.

---

## 🚀 Próximos Passos (Fase 5: Extensões e BEPs avançados)

Com a fundação do Tracker, Wire, Service Worker Bridge e Storage prontos e testados, os próximos passos cobrem:

1. **WebRTC Peer Manager completo** — suporte a ICE restart, trickle ICE, SDP munging para trackers.
2. **Extensão `ut_metadata` refinada** — handshake de metadata com fallback para BEP 9.
3. **Extensão `ut_pex` refinada** — sincronização incremental de listas de peers com filtro de `lastSeen`.
4. **Web Seeds (BEP 19)** — suporte a URLs HTTP/HTTPS como fonte adicional de peças.
5. **Piece class** — expor `length` e `missing` para a UI exibir progresso por peça.
6. **API de throttling** — `client.throttleDownload(bytesPerSec)` e `throttleUpload` para limitar banda agregada.
7. **Seed** — permitir que o Loco compartilhe arquivos locais via `client.seed(file)`.

---

## 📚 Referências (BEPs)
- [BEP 3: The BitTorrent Protocol Specification](http://www.bittorrent.org/beps/bep_0003.html)
- [BEP 10: Extension Protocol](http://www.bittorrent.org/beps/bep_0010.html)
- [BEP 9: Extension for Peers to Send Metadata Files](http://www.bittorrent.org/beps/bep_0009.html) (`ut_metadata`)
- [BEP 11: Peer Exchange (PEX)](http://www.bittorrent.org/beps/bep_0011.html) (`ut_pex`)
- [BEP 19: WebSeed](http://www.bittorrent.org/beps/bep_0019.html)
- [MDN — Service Worker MessageChannel](https://developer.mozilla.org/en-US/docs/Web/API/Channel_Messaging_API)
- [WebTorrent Browser API](https://github.com/webtorrent/webtorrent/blob/master/docs/api.md#browser-usage)
