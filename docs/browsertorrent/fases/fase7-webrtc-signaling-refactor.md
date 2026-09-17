# Fase 7: Refatoração da Sinalização WebRTC e Conectividade Peer-to-Peer

> 🏆 **REGRA DE OURO (GOLDEN RULE): Interoperabilidade Estrita**
> Todas as tarefas abaixo devem ser guiadas por uma única restrição inegociável: **o código deve ser 100% interoperável com o WebTorrent original**. O nosso `WsTracker` deve suportar o cliente original de `docs/webtorrent`, o nosso cliente (core/network) deve conseguir se conectar ao tracker original em `docs/bittorrent-tracker`, e os peers devem conseguir se comunicar sem importar qual cliente está na outra ponta.

Esta fase detalha o plano de ação para corrigir a arquitetura de rede do `BrowserTorrent`, substituindo o modelo atual (que trata WebRTC como TCP estático) pelo modelo correto de sinalização contínua via WebSocket Trackers, de forma compatível com a rede WebTorrent pública.

## 1. Tarefas de Investigação
- [x] **Analisar o Protocolo WebTorrent Tracker**: Investigar as especificações exatas das mensagens JSON trocadas no WebSocket tracker do WebTorrent.
- [x] **Estudo de ICE Trickling vs Non-Trickling**: Analisar o comportamento do WebTorrent original quanto ao envio de candidatos ICE (não usa trickling).
- [x] **Mapeamento do Fluxo de Mensagens (Message Flow)**: Mapear como as mensagens de sinalização (SDPs) viajam.

## 2. Tarefas de Documentação
- [x] **Atualização da Arquitetura (WebRTC Signaling)**: Atualizar a documentação `09-webrtc-signaling-architecture.md` detalhando a arquitetura.
- [x] **Especificação de Interfaces (Payloads)**: Documentar as interfaces TypeScript (`TrackerAnnounceRequest`, `TrackerMessage`).
- [x] **Diagrama de Sequência de Conexão**: Descrever o fluxo de ponta a ponta.

## 3. Tarefas de Testes (TDD - Test Driven Development)
- [x] **Testes de Unidade - `WsTracker`**: 
  - Testar se a conexão WebSocket é mantida aberta.
  - Testar o envio de pacotes `announce` contendo ofertas WebRTC.
  - Testar a recepção e emissão de mensagens de `offer` e `answer`.
- [x] **Testes de Unidade - `Peer`**:
  - Testar emissão de sinais WebRTC SDP coletados.
  - Testar a recepção de sinais (SDP injection).
- [x] **Testes de Integração - `Swarm` + `Peer` + `Tracker`**:
  - Validar a negociação na Swarm (Orquestração).

## 4. Tarefas de Geração de Novo Código
- [x] **Refatorar `packages/core/src/network/peer.ts`**:
  - Remover trickling ICE, implementando gather timeout/complete.
- [x] **Refatorar `packages/core/src/network/tracker.ts` (`WsTracker`)**:
  - Transformar em EventEmitter para socket contínuo (não fecha no primeiro fetch).
- [x] **Refatorar `packages/core/src/network/swarm.ts`**:
  - Orquestrar a geração prévia de offers (SDP) antes do Tracker.announce.
  - Lidar dinamicamente com as answers recebidas.
