### Fase 2: Revisão de Integração (Crítico para Funcionalidade Browser)

#### Fase 2.1 Revisão da Integração Core ↔ Example ↔ SW

**Arquivos a Revisar**:
- `packages/example/src/main.tsx` - Registro do Service Worker e inicialização do app
- `packages/example/src/app.tsx` - Inicialização do Client e tratamento de eventos
- `packages/example/src/torrent-context.tsx` - Gerenciamento de contexto global
- `packages/example/src/components/seeder-panel.tsx` - Workflow de seed
- `packages/example/src/components/viewer-panel.tsx` - Streaming de vídeo via `file.streamURL()`
- `packages/example/src/components/peer-panel.tsx` - Estatísticas e visualização de peers
- `packages/example/src/components/debug-panel.tsx` - Debug de eventos
- `packages/service-worker/src/sw.ts` - Service worker core com roteamento `/webtorrent/*`
- `packages/service-worker/src/sw/webtorrent.ts` - Bridge WebSocket para main thread

**Questões de Integração a Verificar**:
1. `file.streamURL()` requer que `client.createServer({ controller })` tenha sido chamado
2. Service Worker scope corresponde a `serviceWorkerScope` config
3. Main thread responde adequadamente às mensagens do SW via `port.postMessage`
4. Video streaming funciona via `<video>` element + `file.streamTo(video)` + `streamURL()`
5. Todos os métodos do client (`add`, `seed`, `throttleDownload`, etc.) são chamados corretamente
6. Propagação de eventos de Client → Torrent → File para UI components

#### Fase 2.2 Documentação de Testes de Integração

**Tarefa**: Documentar requisitos de testes de integração:
- 1 browser (Chrome)
- Workflow completo seeder → viewer → peer
- Funcionalidade de streaming de vídeo (seek, pause, resume)
- Testes de resiliência (cenários de falha do client)

#### Fase 2.3 Lint/Type Checking

**Tarefa**: Garantir qualidade do código:
- `deno check packages/**/src/**/*.ts`
- `deno lint packages/**/src/`
- `deno fmt --check packages/**/src/`