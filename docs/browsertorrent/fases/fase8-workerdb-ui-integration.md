# Fase 8: Integração WorkerDB, OPFS e Interface de Usuário (BeerCSS)

Agora que possuímos um ecossistema P2P totalmente funcional e estritamente interoperável com a rede WebTorrent pública (comprovado por testes End-to-End no Chromium em `packages/e2e`), a próxima fase é conectar esses motores de rede ao armazenamento local no navegador e à interface visual.

## Objetivos
1. **Conectar a camada de rede (Swarm/Torrent) ao `WorkerDB`**: Fazer com que os metadados (arquivos `.torrent`) e chunks baixados/upados passem diretamente pelo sistema de arquivos isolado do Origin Private File System (OPFS) usando nossa arquitetura existente em `packages/worker-db`.
2. **Desenvolver o Gateway React/Preact**: Refinar o `TorrentProvider` em `packages/example/src/stores/` para servir como a cola entre a UI BeerCSS e as instâncias instanciadas do engine Core.
3. **Fluxos de Download / Upload Visual**: Atualizar a UI principal (App.tsx) para permitir:
   - Fazer upload de um arquivo `.torrent` ou de dados via drag-and-drop.
   - Listar downloads ativos, exibindo progresso de blocos e estatísticas de rede em tempo real.
   - Fornecer opção para stream via Service Worker (visualizar mídia).

## Tarefas (Checklist)

- [ ] **Integração OPFS via WorkerDB**:
  - Validar a interface de Storage do core (como os chunks são injetados).
  - Criar um `ChunkStore` implementado via chamadas assíncronas (MessageChannel) para o `worker-db`.
- [ ] **Integração TorrentProvider (Preact Signals)**:
  - Definir signals para acompanhar o progresso (bytes baixados, total, peers conectados).
  - Escutar os eventos da classe `Torrent` e propagar para os Signals globais do Preact.
- [ ] **Componentes BeerCSS**:
  - Criar o componente `AddTorrentModal` (input tipo `file` e input magnético).
  - Criar o componente `TorrentListItem` exibindo progresso visual (`<progress class="primary">`).
  - Lidar com o roteamento estático do SW para renderizar vídeos localmente (`<video src="/webtorrent/...">`).

## Resultado Esperado
No final desta fase, o projeto deve ser capaz de carregar um arquivo `.torrent` via interface web, baixar os dados de seeds da rede pública através de WebRTC, armazená-los eficientemente em disco usando OPFS e permitir a execução nativa de arquivos no navegador sem uso excessivo da memória RAM.
