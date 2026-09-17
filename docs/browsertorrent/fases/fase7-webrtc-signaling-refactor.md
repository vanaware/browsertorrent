# Fase 7: Refatoração da Sinalização WebRTC e Conectividade Peer-to-Peer

> 🏆 **REGRA DE OURO (GOLDEN RULE): Interoperabilidade Estrita**
> Todas as tarefas abaixo devem ser guiadas por uma única restrição inegociável: **o código deve ser 100% interoperável com o WebTorrent original**. O nosso `WsTracker` deve suportar o cliente original de `docs/webtorrent`, o nosso cliente (core/network) deve conseguir se conectar ao tracker original em `docs/bittorrent-tracker`, e os peers devem conseguir se comunicar sem importar qual cliente está na outra ponta.

Esta fase detalha o plano de ação para corrigir a arquitetura de rede do `BrowserTorrent`, substituindo o modelo atual (que trata WebRTC como TCP estático) pelo modelo correto de sinalização contínua via WebSocket Trackers, de forma compatível com a rede WebTorrent pública.

## 1. Tarefas de Investigação
- [x] **Analisar o Protocolo WebTorrent Tracker**: Investigar as especificações exatas das mensagens JSON trocadas no WebSocket tracker do WebTorrent (campos `action: "announce"`, `offers`, `answer`, `candidate`, `peer_id`, `info_hash`).
- [x] **Estudo de ICE Trickling vs Non-Trickling**: Analisar o comportamento do WebTorrent original quanto ao envio de candidatos ICE (se envia as ofertas WebRTC com candidatos já embutidos aguardando o fim do gathering ou se utiliza trickle ICE e envia candidatos avulsos).
- [x] **Mapeamento do Fluxo de Mensagens (Message Flow)**: Mapear como as mensagens de sinalização (SDPs) viajam da classe `Peer`, passam pelo `Swarm`, são enviadas ao `WsTracker` e chegam ao peer remoto (e vice-versa).

## 2. Tarefas de Documentação
- [x] **Atualização da Arquitetura (WebRTC Signaling)**: Criar ou atualizar a documentação na pasta `docs/browsertorrent` (ex: `09-webrtc-signaling-architecture.md`) detalhando a nova arquitetura orientada a eventos para o WebRTC.
- [x] **Especificação de Interfaces (Payloads)**: Documentar as interfaces TypeScript (ex: `TrackerSignalMessage`, `WebRTCOffer`, `WebRTCAnswer`) que serão utilizadas para tipar a comunicação entre `Peer`, `Swarm` e `Tracker`.
- [x] **Diagrama de Sequência de Conexão**: Descrever textualmente o diagrama de sequência desde o `announce` inicial até a abertura do `RTCDataChannel`.

## 3. Tarefas de Testes (TDD - Test Driven Development)
- [ ] **Testes de Unidade - `WsTracker`**: 
  - Testar se a conexão WebSocket é mantida aberta.
  - Testar o envio de pacotes `announce` contendo ofertas WebRTC.
  - Testar a recepção e emissão (eventos) de mensagens contendo `offer`, `answer` e `candidate`.
- [ ] **Testes de Unidade - `Peer`**:
  - Testar a emissão do evento `signal` quando a API nativa `RTCPeerConnection` gera uma oferta ou candidato ICE.
  - Testar a injeção de sinais remotos através de um método `peer.signal(data)`.
  - Testar os manipuladores de eventos assíncronos de estabelecimento do `RTCDataChannel`.
- [ ] **Testes de Integração - `Swarm` + `Peer` + `Tracker`**:
  - Criar um mock completo de Tracker em memória.
  - Instanciar dois swarms locais simulando dois peers.
  - Validar se a negociação WebRTC ocorre com sucesso de ponta a ponta, culminando na abertura do DataChannel (estado `connected`).

## 4. Tarefas de Geração de Novo Código
- [ ] **Refatorar `packages/core/src/network/peer.ts`**:
  - Implementar o método `signal(data: any)` para receber ofertas, respostas e candidatos externos.
  - Configurar event listeners apropriados no `RTCPeerConnection` (`onicecandidate`, `onnegotiationneeded`) para emitir o evento de sinalização para fora da classe.
- [ ] **Refatorar `packages/core/src/network/tracker.ts` (`WsTracker`)**:
  - Remover o `this.ws?.close()` imediato após a primeira resposta.
  - Implementar lógica de reconexão e heartbeat (ping/pong) se aplicável.
  - Implementar o parsing contínuo de mensagens recebidas, repassando ofertas, respostas e listas de peers para o `Swarm`.
- [ ] **Refatorar `packages/core/src/network/swarm.ts`**:
  - Escutar os eventos de `signal` de cada instância de `Peer`.
  - Repassar esses sinais (ofertas) ao `WsTracker` no momento do `announce` e de atualizações.
  - Ao receber sinais (ofertas ou respostas) do `WsTracker`, roteá-los para a instância correta de `Peer` usando o `peerId` de destino.
