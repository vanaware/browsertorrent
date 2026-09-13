Entendido! Vou ajustar a Fase 2 para focar na **revisão e correção** dos arquivos existentes, não na criação de novos arquivos.

---

# Fase 2 — Revisão e Correção dos Arquivos Existentes

## 🎯 Objetivo da Fase

Revisar todos os arquivos existentes em `packages/example/src/` e `packages/service-worker/src/`, verificar se estão usando a API correta do `@browsertorrent/core`, identificar e corrigir problemas de integração, e garantir que o exemplo funcione end-to-end.

---

## 📋 Checklist de Revisão

### 2.1 Revisão dos Componentes do Exemplo (`packages/example/src/`)

#### 2.1.1 `main.tsx` — Entry Point
- [ ] Verificar se registra o Service Worker corretamente
- [ ] Verificar se importa `@browsertorrent/core` corretamente
- [ ] Verificar se monta o app Preact no DOM
- [ ] Verificar se passa o `ServiceWorkerRegistration` para o `App`

#### 2.1.2 `app.tsx` — Componente Raiz
- [ ] Verificar se inicializa o `WebTorrent` client
- [ ] Verificar se usa `client.createServer({ controller })` para habilitar streaming
- [ ] Verificar se passa os signals (client, torrent, peers) para os painéis
- [ ] Verificar se escuta eventos do torrent (`ready`, `download`, `done`, `error`)

#### 2.1.3 `torrent-context.tsx` — Contexto Global
- [ ] Verificar se define os signals globais (client, torrent, peers, stats)
- [ ] Verificar se atualiza os stats (downloadSpeed, uploadSpeed, progress)
- [ ] Verificar se escuta eventos do client e do torrent

#### 2.1.4 `components/seeder-panel.tsx`
- [ ] Verificar se usa `client.seed(input, opts)` corretamente
- [ ] Verificar se aceita `File[]` ou `FileSystemDirectoryHandle`
- [ ] Verificar se exibe o `magnetURI` após o seed
- [ ] Verificar se atualiza o estado global (torrent)

#### 2.1.5 `components/viewer-panel.tsx`
- [ ] Verificar se aceita magnet URI
- [ ] Verificar se usa `client.add(magnetURI)` corretamente
- [ ] Verificar se usa `file.streamURL()` ou `file.streamTo(video)` para streaming
- [ ] Verificar se o `<video>` element recebe a URL correta
- [ ] Verificar se escuta eventos do torrent (`download`, `done`)

#### 2.1.6 `components/peer-panel.tsx`
- [ ] Verificar se exibe a lista de peers conectados
- [ ] Verificar se exibe as stats (downloadSpeed, uploadSpeed, progress)
- [ ] Verificar se atualiza em tempo real (via signals)

#### 2.1.7 `components/debug-panel.tsx`
- [ ] Verificar se exibe logs de eventos
- [ ] Verificar se escuta eventos do client e do torrent

### 2.2 Revisão do Service Worker (`packages/service-worker/src/`)

#### 2.2.1 `sw.ts` — Service Worker Principal
- [ ] Verificar se intercepta requisições `/webtorrent/*`
- [ ] Verificar se abre `MessageChannel` para comunicação com o main thread
- [ ] Verificar se envia `{ type: "webtorrent", url, method, headers, scope, destination }`
- [ ] Verificar se recebe `{ body: "STREAM" }` e inicia o pull loop
- [ ] Verificar se recebe chunks via `port.postMessage(chunk)`
- [ ] Verificar se encapsula os chunks em `ReadableStream`
- [ ] Verificar se retorna `Response` com headers corretos (`Content-Type`, `Content-Length`, `Accept-Ranges`)
- [ ] Verificar se suporta Range requests (206 Partial Content)

#### 2.2.2 `sw/webtorrent.ts` — Bridge com Main Thread
- [ ] Verificar se escuta mensagens do main thread
- [ ] Verificar se faz lookup no `streamManager`
- [ ] Verificar se lê chunks do `File` via `Symbol.asyncIterator`
- [ ] Verificar se envia chunks via `port.postMessage(chunk)`
- [ ] Verificar se suporta pull-based backpressure (aguarda `true` antes de enviar próximo chunk)

### 2.3 Revisão da Integração Core ↔ Example ↔ SW

#### 2.3.1 Integração Core ↔ Example
- [ ] Verificar se `example` importa `@browsertorrent/core` corretamente
- [ ] Verificar se `example` usa a API pública (`client.add`, `client.seed`, `file.streamURL`)
- [ ] Verificar se `example` escuta eventos do torrent

#### 2.3.2 Integração Core ↔ SW
- [ ] Verificar se `client.createServer({ controller })` é chamado após registrar o SW
- [ ] Verificar se `file.streamURL()` retorna a URL correta (`/webtorrent/<infoHash>/<idx>/<name>`)
- [ ] Verificar se `file.streamTo(video)` atribui a URL ao `<video>` element

#### 2.3.3 Integração Example ↔ SW
- [ ] Verificar se o SW intercepta requisições para `/webtorrent/*`
- [ ] Verificar se o SW comunica com o main thread via `MessageChannel`
- [ ] Verificar se o main thread responde com chunks do `File`

---

## 🔍 Problemas Potenciais a Verificar

### 2.4 Problemas de API
- [ ] Verificar se `file.streamURL()` exige que `client.createServer()` tenha sido chamado
- [ ] Verificar se `file.streamTo(video)` exige que `client.createServer()` tenha sido chamado
- [ ] Verificar se `client.seed()` retorna uma `Promise<Torrent>`
- [ ] Verificar se `client.add()` retorna uma `Promise<Torrent>`

### 2.5 Problemas de Integração
- [ ] Verificar se o SW é registrado com o scope correto (`/` ou `/app/`)
- [ ] Verificar se o SW é ativado antes de `client.createServer()` ser chamado
- [ ] Verificar se o main thread responde às mensagens do SW
- [ ] Verificar se o SW encapsula os chunks em `ReadableStream` corretamente

### 2.6 Problemas de Streaming
- [ ] Verificar se o `<video>` element recebe a URL correta
- [ ] Verificar se o `<video>` element suporta streaming (MSE ou native)
- [ ] Verificar se o SW suporta Range requests (206 Partial Content)
- [ ] Verificar se o SW suporta pull-based backpressure

---

## 🛠️ Plano de Correção

### 2.7 Correções Necessárias (se houver)
- [ ] Corrigir imports incorretos
- [ ] Corrigir uso incorreto da API
- [ ] Corrigir problemas de integração
- [ ] Corrigir problemas de streaming
- [ ] Adicionar logs de debug para troubleshooting

### 2.8 Testes Manuais
- [ ] Testar o exemplo em 3 navegadores (Chrome, Firefox, Safari)
- [ ] Testar o fluxo completo: Seeder → Viewer → Peer
- [ ] Testar o streaming de vídeo (seek, pause, resume)
- [ ] Testar a resiliência (fechar seeder, viewer continua via peer)

---

## 📊 Status da Revisão

| Componente | Status | Problemas Encontrados |
|---|---|---|
| `main.tsx` | 🔍 A revisar | — |
| `app.tsx` | 🔍 A revisar | — |
| `torrent-context.tsx` | 🔍 A revisar | — |
| `seeder-panel.tsx` | 🔍 A revisar | — |
| `viewer-panel.tsx` | 🔍 A revisar | — |
| `peer-panel.tsx` | 🔍 A revisar | — |
| `debug-panel.tsx` | 🔍 A revisar | — |
| `sw.ts` | 🔍 A revisar | — |
| `sw/webtorrent.ts` | 🔍 A revisar | — |
| Integração Core ↔ Example | 🔍 A revisar | — |
| Integração Core ↔ SW | 🔍 A revisar | — |
| Integração Example ↔ SW | 🔍 A revisar | — |

---

## 🚀 Próximos Passos

1. **Revisar cada arquivo** da lista acima
2. **Identificar problemas** e documentá-los
3. **Corrigir os problemas** encontrados
4. **Testar o exemplo** em 3 navegadores
5. **Documentar as correções** realizadas

---

Quer que eu comece a revisar os arquivos um por um? Posso começar com `main.tsx` e seguir a lista.