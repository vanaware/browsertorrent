# Arquitetura e Comparação: WebTorrent vs BrowserTorrent

> 🏆 **REGRA DE OURO (GOLDEN RULE): Interoperabilidade Estrita**
> Nosso código **DEVE ser 100% interoperável** com o ecossistema original do WebTorrent. Isso significa que:
> 1. **Cliente vs Tracker Original:** Nosso cliente (`BrowserTorrent`) funciona perfeitamente quando conectado aos trackers originais públicos (`wss://tracker.webtorrent.dev`, `wss://tracker.openwebtorrent.com`, etc.) ou a instâncias `bittorrent-tracker`.
> 2. **Tracker vs Cliente Original:** O nosso `WsTracker` em Deno é 100% compatível com o cliente original do WebTorrent (`webtorrent.min.js`), distribuindo ofertas/respostas de sinalização e estatísticas de swarm (`complete`, `incomplete`).
> 3. **Peer-to-Peer Misto:** Nossos clientes conectam-se, trocam metadados (`ut_metadata`) e transferem pedaços com **qualquer outro cliente da rede**, independentemente se a outra ponta usa o nosso código ou o cliente WebTorrent original.

---

## 1. Tabela Comparativa Geral

| Funcionalidade / Camada | Original WebTorrent (`webtorrent`) | BrowserTorrent (`@vanaware/browsertorrent`) | Compatibilidade |
|---|---|---|:---:|
| **Runtime Base** | Node.js + Browserify/Webpack polyfills (`buffer`, `events`, `stream`) | Pure Deno & Standard Web APIs (`Uint8Array`, `EventTarget`, W3C Streams) | 🟢 100% Interoperável |
| **Sinalização WebRTC** | `bittorrent-tracker` WebSocket JSON protocol | `WsTracker` (Client & Server) com payload nativo de offers/answers | 🟢 100% Compatível |
| **Trackers Públicos** | `wss://tracker.webtorrent.dev`, `wss://tracker.openwebtorrent.com` | Suporte nativo completo a trackers WebSocket públicos | 🟢 Verificado E2E |
| **Transporte P2P** | `simple-peer` sobre `RTCDataChannel` | `Peer` nativo com `RTCPeerConnection` e `RTCDataChannel` binário | 🟢 100% Compatível |
| **Wire Protocol** | BEP 3 (`bittorrent-protocol`), BEP 10 (`extension-host`) | BEP 3, BEP 6, BEP 10, BEP 52 (`Wire`, `ExtensionHost`) | 🟢 100% Compatível |
| **Troca de Metadados** | `ut_metadata` (BEP 9) | `UtMetadata` (BEP 9 / BEP 10) com decodificação bencode piecewise | 🟢 100% Compatível |
| **Persistência / Storage** | `chunk-store` em RAM ou IndexedDB | `OPFSChunkStore` (Origin Private File System) + `MemoryChunkStore` | 🟢 Modern Web Native |
| **Streaming de Mídia** | Servidor HTTP Node.js local no desktop | Service Worker nativo interceptando requisições de Range (HTTP 206) | 🟢 100% Browser Native |
| **Interface do Usuário** | N/A (biblioteca core) | Preact + `@preact/signals` + BeerCSS (Material Design 3) | 🟢 Pronto para PWA |

---

## 2. Detalhes de Arquitetura e Interoperabilidade

### 2.1 Protocolo de Rastreador WebSocket (BEP WebTorrent)
Trackers WebTorrent funcionam como servidores de sinalização WebRTC:
1. **Conexão Persistente:** O cliente mantém a conexão WebSocket aberta durante toda a vida útil do torrent na swarm.
2. **Pool de Ofertas (Offers):** No `announce` inicial, o cliente gera uma lista de ofertas SDP (`offers: [{ offer_id, offer }]`) e as envia junto com o `info_hash` e `peer_id` codificados em 20 bytes binários.
3. **Distribuição e Resposta:** O tracker emparelha peers entregando as ofertas aos peers existentes. O peer que recebe uma oferta gera uma `answer` correspondente e a envia de volta ao tracker (`to_peer_id`, `answer`, `offer_id`), que a encaminha ao peer originador.
4. **Estabelecimento do DataChannel:** Ambos os navegadores concluem o handshake ICE/DTLS e abrem o canal `webtorrent` com `binaryType = "arraybuffer"`.

### 2.2 Troca de Metadados (BEP 10 / BEP 9)
Quando um cliente adiciona um torrent via Magnet Link (sem o dicionário `info` completo):
1. Durante o extended handshake do BEP 10 (`msg_type = 0`), o Seeder anuncia `metadata_size`.
2. O Leecher calcula o número de peças de metadados (`Math.ceil(metadata_size / 16384)`) e emite requisições `ut_metadata` (`msg_type = 0, piece: n`).
3. O Seeder responde com `msg_type = 1, piece: n` e o payload binário do fragmento de metadados anexado como trailer.
4. O Leecher reúne todos os fragmentos, decodifica o bencode do dicionário `info`, calcula o SHA-1 para conferência do `info_hash`, e inicializa as peças e arquivos do torrent.

### 2.3 Validação E2E com Playwright
A suíte automatizada em `packages/e2e/test_trackers.js` executa múltiplos contextos Chromium isolados para testar:
- Conexão e anúncio em múltiplos trackers públicos oficiais.
- Inicialização do `WsTracker` Deno local e troca de sinais.
- Transferência de arquivos ponta a ponta (Seeder -> Tracker -> Leecher) com validação de hash e integridade de bytes.
