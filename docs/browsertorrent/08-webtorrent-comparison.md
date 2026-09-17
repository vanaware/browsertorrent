# Comparação de Arquitetura: Original WebTorrent vs BrowserTorrent (Ours)

> 🏆 **REGRA DE OURO (GOLDEN RULE): Interoperabilidade Estrita**
> Nosso código **DEVE ser 100% interoperável** com o ecossistema original do WebTorrent. Isso significa que:
> 1. **Cliente vs Tracker Original:** Nosso cliente (`BrowserTorrent`) deve funcionar perfeitamente quando conectado aos trackers originais públicos (ou ao código de referência em `docs/bittorrent-tracker`).
> 2. **Tracker vs Cliente Original:** Se hospedarmos o nosso `WsTracker`, o cliente original do WebTorrent (ex: `docs/webtorrent/webtorrent.min.js`) deve ser capaz de usá-lo sem notar diferença.
> 3. **Peer-to-Peer Misto:** Nossos clientes devem conseguir se conectar, trocar metadados e transferir pedaços com **qualquer outro cliente da rede**, independentemente se a outra ponta usa o nosso código ou o cliente WebTorrent original.

Nesta auditoria, analisamos as diferenças entre a implementação original do WebTorrent (focando no pacote `bittorrent-tracker` e na negociação de peers via WebRTC) e a implementação atual do `BrowserTorrent` (nos pacotes `core/src/network/tracker.ts`, `swarm.ts` e `peer.ts`). O objetivo desta auditoria é identificar por que os clientes não conseguem se conectar entre si utilizando web trackers públicos.

## 1. Tracker Connectivity (RESOLVIDO) e Sinalização WebRTC

### WebTorrent Original (bittorrent-tracker)
O WebTorrent original utiliza os Trackers WebSocket primariamente como **Servidores de Sinalização WebRTC**. 
O fluxo de conexão para um WebSocket Tracker é:
1. Mantém uma conexão persistente (pool de websockets) com o tracker.
2. **Gera ofertas (offers) WebRTC** *antes* de enviar a mensagem de `announce`. (Utilizando `simple-peer` com `initiator: true`).
3. Empacota essas ofertas em um array e as envia como parte do payload JSON do request de `announce`.
4. O tracker distribui essas ofertas para outros peers na swarm.
5. A resposta do tracker (ou mensagens subsequentes enviadas pelo tracker no socket aberto) contém `answers` de volta para as ofertas geradas, ou novas `offers` de peers recém-chegados.
6. Essas respostas são roteadas para as instâncias de `simple-peer` através do método `peer.signal()`.

### BrowserTorrent (Nossa Implementação)
A nossa implementação do `WsTracker` (em `tracker.ts`) trata Trackers WebSocket de forma quase idêntica a Trackers HTTP:
1. Abre um WebSocket, envia um JSON genérico de `announce` (sem nenhuma oferta WebRTC embutida).
2. Ouve a primeira resposta. Se a resposta for válida, converte os nós compactos ou strings em uma lista de `{ ip, port }`.
3. **Imediatamente fecha o WebSocket** (`this.ws?.close()`).
4. Repassa os IPs e portas para o `Swarm`.

**Problema Crítico:** Trackers web públicos funcionam encaminhando SDPs (ofertas e respostas WebRTC). Como nossa implementação não envia as ofertas no announce e fecha a conexão, ela é completamente incapaz de realizar a sinalização WebRTC necessária para conectar navegadores. Navegadores não podem conectar-se diretamente a um IP/Porta TCP sem sinalização WebRTC.

## 2. Peer Connectivity (Swarm e Peer.ts)

### WebTorrent Original
- Utiliza a biblioteca `simple-peer`, que abstrai as complexidades do `RTCPeerConnection` e ICE trickling.
- Peers são criados sob demanda: quando a sinalização dita que um novo peer deve ser conectado (ao receber uma `offer` ou para preparar uma `offer` para o tracker).
- Os endereços IP retornados via HTTP/UDP trackes são roteados para sockets TCP (no Node.js), mas no Browser, as conexões são feitas puramente via mensagens de sinalização recebidas dos WebSocket trackers. IPs recebidos em formato binário não são tentados de forma direta.

### BrowserTorrent (Nossa Implementação)
- O `Swarm` itera sobre os objetos `{ ip, port }` recebidos do nosso `WsTracker` e tenta instanciar um `Peer` para cada um, invocando `this._connectPeer(addr)`.
- No construtor de `Peer`, chamamos `createOffer()` e emitimos um evento `signal`.
- **Problema Crítico:** Nada no `Swarm` escuta o evento `peer.on("signal", ...)`! As ofertas geradas pela nossa API nativa de `RTCPeerConnection` são simplesmente perdidas no vácuo, não sendo enviadas ao Tracker (que, aliás, já teve seu socket fechado).
- Como consequência, as duas instâncias de `RTCPeerConnection` nunca trocam `offer`/`answer` e os timeouts de conexão de 25 segundos (em `Peer`) expiram invariavelmente.

## 3. Wire Protocol e Extensões
- O protocolo de fio (Wire) no BrowserTorrent implementa as mensagens básicas e até lida com a extensão `ut_metadata`, assim como o WebTorrent original (via `bittorrent-protocol`).
- O DataChannel é configurado corretamente em `Peer.ts` usando `arraybuffer`.
- Mas o transporte (Wire) nunca é ativado de forma real porque a conexão RTCPeerConnection falha na camada de estabelecimento.

## Conclusão e Próximos Passos
O motivo pelo qual o preview funciona visualmente, mas falha em conectar aos peers, é uma quebra fundamental de conceito: **Tratamos WebRTC como sockets TCP.** 

Para corrigir essa incompatibilidade com a rede pública WebTorrent, a arquitetura do Tracker WebSocket precisa ser reescrita para:
1. Manter o WebSocket aberto e gerenciar reconexões.
2. Integrar o `Swarm` e o `WsTracker`, onde o tracker solicita ao swarm a criação de *offers* e envia de volta as *answers/offers*.
3. O `Swarm` deve responder a eventos de sinalização, passando os pacotes ICE/SDP (events `signal` emitidos por `Peer.ts`) pela conexão WebSocket do Tracker até o peer remoto.
