> **INSTRUÇÃO PARA A IA:** 
> O texto abaixo contém experimentos e código da área de @vanaware/worker-db
> O projeto é o **BrowserTorrent ** estruturado em bbrowsertorrents. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: `## Arquivo: src/main.ts`).
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo.

---

# Contexto Exportado do Projeto BrowserTorrent - Modo: WORKERDB

Gerado automaticamente em: 9/12/2026, 8:09:19 PM

---

## Arquivo: `packages/worker-db/README.md`

````md
# 🗄️ BrowserTorrent PWA - Worker-DB

O **Worker-DB** é o coração da arquitetura _Offline-First_ do BrowserTorrent PWA. Ele provê uma interface unificada, tipada e de altíssima performance para interagir com as APIs de persistência nativas dos navegadores modernos (`IndexedDB`, `LocalStorage` e `Origin Private File System - OPFS`).

Para garantir que a interface de usuário (UI) nunca congele, mesmo durante operações massivas de criptografia E2EE ou I/O de arquivos pesados, **todo o processamento de banco de dados e arquivos ocorre em uma thread separada (Web Worker)**.

---

## ✨ Principais Funcionalidades

- 🧵 **Non-Blocking UI:** Proxy transparente via `postMessage`. A Thread Principal apenas despacha comandos; o Worker faz o trabalho pesado.
- 🛡️ **Isolamento por Escopos:** Bancos e _Stores_ são isolados. Além disso, suportamos `prefixos` dinâmicos para isolar chaves no mesmo store (ex: `MSG_`, `CONFIG_`).
- 🔑 **Gestão Automática de IDs:** Suporte para inserção usando `_id: "auto"`, convertendo automaticamente para UUIDs curtos e limpando prefixos nos retornos.
- 🚀 **High Performance OPFS:** Manipulação nativa de arquivos no disco do dispositivo com recuperação estrita sob demanda (evitando vazamentos de memória).
- 🗜️ **Compressão Nativa (ZIP):** Empacotamento e descompactação de pastas e arquivos no OPFS utilizando a engine `fflate` em background.

---

## 📦 1. Módulo: `db()` (IndexedDB)

O `db()` é a fábrica principal para salvar objetos e metadados persistentes de forma assíncrona. Ideal para Fila de Mensagens, Contatos, e Logs E2EE.

```ts
import { db, } from './mod.ts';

// Inicializa o Worker Global
db.init();

// Cria uma instância focada (Database, Store, Prefixo)
const msgStore = db('BROWSERTORRENT_DATA', 'messages', 'MSG_',);

// CRUD Básico
const id = await msgStore.set('auto', { text: 'Olá', status: 'pending', },); // Retorna MSG_xxx
const msg = await msgStore.get(id,);
await msgStore.patch(id, { status: 'sent', },);
await msgStore.delete(id,);

// Operações em Lote e Consultas Remotas no Worker
await msgStore.setSome(
  (items,) => items.filter((i,) => i.status === 'pending'),
  (item,) => ({ ...item, status: 'sent', }),
);

const pendingCount = await msgStore.query((items,) =>
  items.filter((i,) => i.status === 'pending').length
);
```

---

## 📦 2. Módulo: `ls()` (LocalStorage)

O `ls()` segue exatamente os mesmos padrões e assinaturas do `db()`, mas de forma **síncrona** interagindo com o `localStorage`. Ideal para preferências de tema, estado de autenticação ou configurações rápidas de boot.

```ts
import { ls, } from './mod.ts';

const prefStore = ls('BROWSERTORRENT_PREF_',);

// Uso imediato (Síncrono)
prefStore.set('config', { theme: 'dark', },);
const prefs = prefStore.get('config',);

// Backups delegados ao Worker-DB (OPFS)
await prefStore.backupToOpfs('backups_prefs', 'ui_config.json',);
```

---

## 📦 3. Módulo: `opfs()` (Sistema de Arquivos Nativo)

A joia da coroa. O `opfs()` **herda tudo do `db()**`, mas estende a API para manipular arquivos físicos no disco. Ele adota o padrão de **Record-Key Isolation**: cada registro do banco de dados ganha a sua própria pasta isolada no FileSystem.

### Inicialização

```ts
import { opfs, } from './mod.ts';

// Parâmetros: DB, Store, Prefixo de ID, Sub-pasta OPFS base
const drive = opfs('BROWSERTORRENT_FILES', 'attachments', 'ATT_', 'chats',);
```

### Upload e Listagem Leve

Para não sobrecarregar a RAM (caso uma pasta tenha dezenas de arquivos gigantes), o `listFiles` retorna apenas **metadados leves**.

```ts
const pastaMsgId = 'msg_12345';

// Salvando o arquivo no Worker
await drive.addFile(pastaMsgId, fileInput.files[0], 'foto.png',);

// Listagem super rápida (apenas name, size, type, lastModified)
const files = await drive.listFiles(pastaMsgId,);
files.forEach((f,) => console.log(`${f.name} - ${f.size} bytes`,));
```

### Download / Leitura Sob Demanda

O arquivo em si (o `Blob`/`File`) só cruza a ponte do Worker para a Main Thread no momento exato em que for ser exibido ou baixado pelo usuário.

```ts
const rawFile = await drive.getFile(pastaMsgId, 'foto.png',);
const objectUrl = URL.createObjectURL(rawFile,);
```

### Gestão e Manipulação

```ts
await drive.renFile(pastaMsgId, 'foto.png', 'avatar.png',);
await drive.delFile(pastaMsgId, 'avatar.png',);
await drive.mvFile(pastaMsgId, 'arquivo.txt', 'outra_pasta_destino',);
```

---

## 🗜️ 4. API de Compressão ZIP Integrada

Ferramentas nativas do `opfs()` para compactação pesada rodando fora da UI, essencial para rotinas de exportação massiva ou agrupamento de mídias criptografadas E2EE.

```ts
// 1. Zipar todos (ou alguns) arquivos de um registro (apagando os originais)
await drive.zip(pastaMsgId, 'album.zip', ['foto1.png', 'foto2.png',], true,);

// 2. Extrair um ZIP já existente na pasta do registro
await drive.unzip(pastaMsgId, 'album.zip',);

// 3. Adicionar ou Excluir arquivos de dentro de um ZIP (Mutações sem extração total visível)
await drive.addZip(pastaMsgId, 'album.zip', novoBlob, 'foto3.png',);
await drive.delZip(pastaMsgId, 'album.zip', 'foto1.png',);
```

---

## 🔄 5. Backups Automáticos e Recuperação

O sistema possui uma engine unificada para fazer _dump_ de stores inteiros (tanto do IndexedDB quanto do LocalStorage) e arquivá-los em segurança no OPFS, em uma pasta global chamada `/backup`.

```ts
// Gera um snapshot e joga no disco nativo (OPFS) na subpasta /backup/minha_conta
await msgStore.backupToOpfs('minha_conta', 'bkp_v1.json',);

// Lê do disco nativo, trunca o banco atual, e insere os dados restaurados
await msgStore.restoreFromOpfs('minha_conta', 'bkp_v1.json', true,);
```

---

## 🚧 Roadmap da Camada de Banco

- [x] Abstração de IDB em Web Worker
- [x] Sincronia de IDs (Prefixo dinâmico, interceptação "auto")
- [x] Query, SetSome, DelSome (Cálculos de Array isolados no Worker)
- [x] OPFS Integration (Manipulação de Blobs direto para o FileSystem Nativo)
- [x] OPFS Zip Compression (Integração com `fflate`)
- [x] Otimização de Performance OPFS (`listFiles` Metadata-only vs `getFile` sob demanda)

````

---

## Arquivo: `packages/worker-db/build.ts`

```ts
// build.ts
import { ensureDir, } from '@std/fs';

const clean = async () => {
  try {
    await Promise.all([
      Deno.remove('../server/build/dist/worker-db.js',),
      Deno.remove('../server/build/dist/worker-db.js.map',),
    ],);
    console.log('📁 Arquivo anterior excluído',);
  } catch {
    // diretório não existe, ok
  }
  await ensureDir('../server/build/dist',);
};

const build = async () => {
  console.log('🚀 Iniciando build do Worker DB ...',);
  const startTime = performance.now();

  try {
    await clean();

    console.log('⚙️ Gerando bundle do Worker...',);
    // @ts-ignore: Deno.bundle API interna operacional no runtime
    const result = await Deno.bundle({
      entrypoints: ['./src/worker.ts',],
      outputPath: '../server/build/dist/worker-db.js',
      platform: 'browser',
      format: 'esm',
      packages: 'bundle',
      keepnames: true,
      inlineImports: true,
      codeSplitting: false,
      minify: false,
      sourcemap: 'linked',
      write: true,
    },);

    if (!result.success) {
      console.error(result.errors,);
      throw new Error('Falha ao gerar bundle pelo compilador interno.',);
    }

    for (const warning of result.warnings || []) {
      console.warn(warning,);
    }

    const endTime = performance.now();
    console.log(`✅ Build concluído com sucesso em ${(endTime - startTime).toFixed(2,)}ms!`,);
    console.log('📁 Saída gerada no diretório: ../server/build/dist/',);
  } catch (error) {
    console.error('❌ Erro fatal durante o processo de build:',);
    console.error(error,);
    Deno.exit(1,);
  }
};

await build();

```

---

## Arquivo: `packages/worker-db/deno.jsonc`

```json
{
  "name": "@vanaware/worker-db",
  // ----------------------------------------------------------------------
  // 🔧 Compiler Options específicos do pacote
  // ----------------------------------------------------------------------
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "dom.asynciterable", "esnext", "deno.ns", "deno.worker"],
    "strict": true,
    "noImplicitAny": true,
    "noUncheckedIndexedAccess": true
  },
  "imports": {
    "idb-keyval": "https://esm.sh/idb-keyval@6.2.1",
    // 🔥 CORREÇÃO: Removido ?dev e adicionado ?bundle para resolver
    // circular dependency do fake-indexeddb no Deno 2.x (denonext target).
    // O ?bundle força o esm.sh a empacotar tudo em um único arquivo,
    // eliminando o erro "Class extends value undefined".
    "fake-indexeddb": "https://esm.sh/fake-indexeddb@6.2.5?bundle",
    "fake-indexeddb/auto": "https://esm.sh/fake-indexeddb@6.2.5/auto?bundle",
    "fflate": "https://esm.sh/fflate@0.8.2?target=es2022",
    "@std/assert": "jsr:@std/assert",
    "@std/fs": "jsr:@std/fs",
    "@std/http": "jsr:@std/http",
    "@std/path": "jsr:@std/path"
  },
  "tasks": {
    "build": "deno run -A --unstable-bundle build.ts",
    // 🔥 CORREÇÃO: Adicionado --allow-write para permitir testes que
    // criam arquivos temporários (padrão consistente com @browsertorrent/utils)
    "test": "deno test --allow-env --allow-net --allow-read --allow-write tests/",
    "check": "deno check build.ts src/**/*.ts src/**/*.tsx example/**/*.ts tests/**/*.ts",
    "tests": "deno task check && deno task test",
    "demo": "deno run --allow-env --allow-read --allow-net ./example/demo.ts",
    "example": "deno run -A --unstable-bundle ./example/server.ts"
  },
  // ----------------------------------------------------------------------
  // 🎯 Exports via subpaths (Deno não suporta conditional exports)
  //
  // Uso no código fonte:
  //   - Main Thread:  import { db, opfs, ls } from "@vanaware/worker-db";
  //   - Service Worker: import { dbsw, opfssw } from "@vanaware/worker-db/sw";
  //   - Web Worker:   import { dbsw, opfssw } from "@vanaware/worker-db/sw";
  // ----------------------------------------------------------------------
  "exports": {
    // Entry point padrão — Main Thread (browser)
    // Retorna db(), opfs(), ls() com Web Worker interno para otimização
    ".": "./src/mod-main.ts",
    // Subpath para Service Worker e Web Worker
    // Retorna db(), opfs() com acesso direto (sem Web Worker interno)
    "./sw": "./src/mod-sw.ts",
    "./fake": "./src/fake-mod.ts",
    "./swfake": "./src/fake-db.ts"
  }
}

```

---

## Arquivo: `packages/worker-db/example/demo.ts`

```ts
import { db, ls, } from '../src/fake/fake-mod.ts';

interface BrowserTorrentMessage {
  _id?: string;
  senderId: string;
  recipientId: string;
  content: string;
  status: 'pending' | 'sent' | 'delivered';
  timestamp: number;
}

interface UserPreferences {
  _id?: string; // Corrigindo a tipagem aqui também
  theme: 'dark' | 'light';
  notificationsEnabled: boolean;
  activeChatId: string | null;
}

async function runBrowserTorrentDbDemo() {
  console.log('🚀 [BrowserTorrent PWA] Iniciando demonstração do WORKER-DB...\n',);
  ls().clear();

  console.log("📦 1. LocalStorage - Criando itens com _id 'auto'...",);
  const prefStore = ls('BROWSERTORRENT_PREF_',);

  const autoKey1 = prefStore.set<UserPreferences>({
    _id: 'auto',
    theme: 'dark',
    notificationsEnabled: true,
    activeChatId: 'chat_1',
  },);
  const autoKey2 = prefStore.set<UserPreferences>({
    _id: 'auto',
    theme: 'light',
    notificationsEnabled: false,
    activeChatId: null,
  },);

  console.log(`   --> Item 1 gerado: Chave = ${autoKey1}`,);
  console.log(
    `   --> Recuperando Item 1 (notem que '_id' volta limpo):`,
    prefStore.get(autoKey1,),
  );
  console.log(`   --> Recuperando Item 2:`, prefStore.get(autoKey2,),);

  console.log('\n🔒 2. LocalStorage - Testando Isolamento de Prefixos...',);
  const authStore = ls('BROWSERTORRENT_AUTH_',);
  authStore.set('session_token', { token: 'abc-123', active: true, },);
  console.log(
    `   --> Total de itens em BROWSERTORRENT_PREF_ (Preferências): ${prefStore.keys().length}`,
  );
  console.log(
    `   --> Total de itens em BROWSERTORRENT_AUTH_ (Autenticação): ${authStore.keys().length}`,
  );

  console.log('\n🌍 3. LocalStorage - Visão Global (Sem prefixo)...',);
  const globalStore = ls();
  const allKeys = globalStore.keys();
  console.log(`   --> Total de itens armazenados em TODA a aplicação: ${allKeys.length}`,);
  console.log(
    `   --> Realizando leitura global do token:`,
    globalStore.get('BROWSERTORRENT_AUTH_session_token',),
  );

  console.log('\n💬 4. IndexedDB Worker - Enfileirando Mensagens Offline...',);
  const msgStore = db('BROWSERTORRENT_DATA', 'messages', 'MSG_',);
  await msgStore.clear();

  const msgId1 = await msgStore.set<BrowserTorrentMessage>({
    _id: 'auto',
    senderId: 'user_alice',
    recipientId: 'user_bob',
    content: 'Olá! Esta mensagem foi enfileirada offline.',
    status: 'pending',
    timestamp: Date.now(),
  },);

  console.log(`   --> Mensagens injetadas no IndexedDB. Keys geradas: ${msgId1}`,);

  console.log('\n⚙️ 5. IndexedDB Worker - Mutações Assíncronas...',);
  const pendingCount = await msgStore.query<BrowserTorrentMessage, number>((items,) => {
    return items.filter((m,) => m.status === 'pending').length;
  },);
  console.log(`   --> Total pendente (calculado remotamente): ${pendingCount}`,);

  await msgStore.setSome<BrowserTorrentMessage>(
    (items,) => items.filter((m,) => m.status === 'pending'),
    (item,) => ({ ...item, status: 'sent', }),
  );

  const updatedMessages = await msgStore.values<BrowserTorrentMessage>();
  console.log('   --> Estado das mensagens após envio simulado:', updatedMessages,);

  db.terminate();
  console.log('\n✅ Demonstração finalizada. Worker encerrado.',);
}

runBrowserTorrentDbDemo();

```

---

## Arquivo: `packages/worker-db/example/index.html`

```html
<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport"
      content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>BrowserTorrent PWA - WorkerDB Demo</title>

    <!-- Favicon gerado nativamente via SVG in-line (zero requisições ao servidor) -->
    <link rel="icon" type="image/svg+xml"
      href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%239edeb6'/><text x='50' y='68' font-size='50' font-family='system-ui, sans-serif' font-weight='bold' text-anchor='middle' fill='%231a1c19'>L</text></svg>">

    <style>
    :root {
      --md-sys-color-background: #1a1c19;
      --md-sys-color-on-background: #e2e3dd;
      --md-sys-color-primary: #9edeb6;
      --md-sys-color-surface: #2d312d;
    }

    body {
      font-family: system-ui, -apple-system, sans-serif;
      background-color: var(--md-sys-color-background);
      color: var(--md-sys-color-on-background);
      margin: 0;
      padding: 24px;
      line-height: 1.6;
    }

    h1 {
      color: var(--md-sys-color-primary);
    }

    #app {
      max-width: 800px;
      margin: 0 auto;
    }

    .console-card {
      background-color: var(--md-sys-color-surface);
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
      overflow-x: auto;
    }

    pre {
      font-family: 'Courier New', Courier, monospace;
      font-size: 14px;
      color: #b5e8b0;
      margin: 0;
      white-space: pre-wrap;
    }
    </style>
  </head>
  <body class="dark">
    <div id="app">
      <h1>BrowserTorrent PWA - Testes Reais (IndexedDB)</h1>
      <p>Os testes abaixo comprovam a integração <strong>Offline-First</strong> executada assincronamente através de um Web Worker. Sem bloquear a UI!</p>

      <div class="console-card">
        <pre id="log-output">Aguardando execução do main.ts...</pre>
      </div>
    </div>

    <!-- Arquivo gerado pelo deno bundle no nosso server.ts -->
    <script type="module" src="./main.js"></script>
  </body>
</html>

```

---

## Arquivo: `packages/worker-db/example/main.ts`

```ts
// ## Arquivo: monorepo/worker-db/example/main.ts
import { db, ls, opfs, } from '../src/mod-main.ts';

interface BrowserTorrentMessage {
  _id?: string;
  senderId: string;
  recipientId: string;
  content: string;
  status: 'pending' | 'sent' | 'delivered' | 'read';
  priority: number;
  timestamp: number;
}

interface UserPreferences {
  _id?: string;
  theme: 'dark' | 'light';
  notificationsEnabled: boolean;
  activeChatId: string | null;
}

const appElement = document.getElementById('app',);
const logElement = document.getElementById('log-output',);

function log(msg: string, data?: unknown,) {
  const dataStr = data ? `\n  ↳ ${JSON.stringify(data, null, 2,)}` : '';
  const fullText = `${msg}${dataStr}\n`;

  if (logElement) {
    if (logElement.innerText.includes('Aguardando execução',)) {
      logElement.innerText = '';
    }
    logElement.innerText += fullText;
  }
  console.log(msg, data || '',);
}

async function runRealWorldTests() {
  log('🚀 INICIANDO DEMONSTRAÇÃO AVANÇADA DO BROWSERTORRENT PWA (AMBIENTE REAL)\n',);

  ls().clear();
  db.init();

  log('📦 1. LocalStorage - Escopos e Prefixos...',);
  const prefStore = ls('BROWSERTORRENT_PREF_',);
  prefStore.set<UserPreferences>({
    _id: 'auto',
    theme: 'dark',
    notificationsEnabled: true,
    activeChatId: 'chat_1',
  },);
  log(`   --> Total de chaves isoladas de Preferências: ${prefStore.keys().length}`,);

  log('\n💬 2. IndexedDB Worker - Populando Fila de Mensagens...',);
  const msgStore = db('BROWSERTORRENT_DATA', 'messages', 'MSG_',);
  await msgStore.clear();

  const now = Date.now();
  await msgStore.setMany([
    ['auto', {
      senderId: 'alice',
      recipientId: 'bob',
      content: 'Oi!',
      status: 'delivered',
      priority: 1,
      timestamp: now - 5000,
    },],
    ['auto', {
      senderId: 'alice',
      recipientId: 'bob',
      content: 'Tudo bem?',
      status: 'pending',
      priority: 1,
      timestamp: now - 4000,
    },],
  ],);
  log(
    `   --> Total de mensagens injetadas com UUIDs gerados com sucesso: ${
      (await msgStore.keys()).length
    }`,
  );

  log('\n📊 3. IndexedDB Worker - Análises e Agregações Remotas (query)...',);
  const stats = await msgStore.query<BrowserTorrentMessage, unknown>((items) => ({
    totalPending: items.filter((i,) => i.status === 'pending').length,
  }));
  log(`   --> Estatísticas processadas no Worker:`, stats,);

  log("\n💾 4. Origin Private File System (OPFS) - Backup via opfs() com basePath 'backup'...",);

  // Instância OPFS dedicada exclusivamente a gerenciar a pasta física global '/backup'
  const backupDrive = opfs('BROWSERTORRENT_DATA', 'messages', 'MSG_', 'backup',);
  const RECORD_BACKUP_KEY = 'mensagens_app';

  // Limpa arquivos antigos da record-key de backup usando a API unificada do OPFS
  const oldBackupFiles = await backupDrive.listFiles(RECORD_BACKUP_KEY,);
  for (const f of oldBackupFiles) {
    await backupDrive.delFile(RECORD_BACKUP_KEY, f.name,);
  }

  // Realiza o backup utilizando a record-key isolada
  await backupDrive.backupToOpfs(RECORD_BACKUP_KEY, 'mensagens_v1.json',);
  const storedFiles = await backupDrive.listFiles(RECORD_BACKUP_KEY,);
  log(
    `   --> Backups gerados com sucesso. Arquivos na record-key '${RECORD_BACKUP_KEY}':`,
    storedFiles.map((f,) => f.name),
  );

  log('\n🤖 5. Service Worker - Interação em Background (db-sw.ts)...',);

  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/sw.js', { type: 'module', },);

      if (!navigator.serviceWorker.controller) {
        log(
          `   --> ⚠️ O Service Worker foi instalado. Pressione F5 (recarregar) para que ele assuma o controle da página.`,
        );
      } else {
        log(`   --> Service Worker ativo e controlando a página! Solicitando operação remota...`,);

        const runSwTask = () =>
          new Promise((resolve, reject,) => {
            const channel = new MessageChannel();
            channel.port1.onmessage = (e,) => {
              if (e.data.success) resolve(e.data.payload,);
              else reject(new Error(e.data.error,),);
            };
            navigator.serviceWorker.controller!.postMessage({ type: 'RUN_SW_DEMO', }, [
              channel.port2,
            ],);
          },);

        const swResult = await runSwTask();
        log(`   --> ✅ Resultado retornado pelo Service Worker:`, swResult,);
      }
    } catch (err) {
      log(`   ❌ Falha ao registrar o Service Worker:`, err,);
    }
  }

  // Renderiza a listagem de backups utilizando o opfs() em vez de funções soltas
  const finalStoredFiles = await backupDrive.listFiles(RECORD_BACKUP_KEY,);
  if (appElement && finalStoredFiles.length > 0) {
    const downloadContainer = document.createElement('div',);
    downloadContainer.style.marginTop = '24px';
    downloadContainer.style.padding = '16px';
    downloadContainer.style.backgroundColor = 'var(--md-sys-color-surface)';
    downloadContainer.style.borderRadius = '12px';

    let linksHTML =
      `<h3 style="margin-top: 0; color: var(--md-sys-color-primary);">🗂️ Backups OPFS Gerados via opfs()</h3>`;
    linksHTML += `<div style="display: flex; flex-direction: column; gap: 12px;">`;

    for (const f of finalStoredFiles) {
      linksHTML += `
      <div style="display: flex; justify-content: space-between; align-items: center; background: #1a1c19; padding: 12px 16px; border-radius: 8px;">
        <span>📁 ${f.name} - ${(f.size / 1024).toFixed(1,)} KB</span>
        <button id="dl_${
        f.name.replace(/\./g, '_',)
      }" style="cursor: pointer; background: var(--md-sys-color-primary); color: #1a1c19; border: none; font-weight: bold; border-radius: 4px; padding: 6px 12px;">
          Baixar Backup
        </button>
      </div>`;
    }

    downloadContainer.innerHTML = linksHTML + `</div>`;
    appElement.appendChild(downloadContainer,);

    setTimeout(() => {
      for (const f of finalStoredFiles) {
        const btn = document.getElementById(`dl_${f.name.replace(/\./g, '_',)}`,);
        if (btn) {
          btn.onclick = async () => {
            const fileBlob = await backupDrive.getFile(RECORD_BACKUP_KEY, f.name,);
            const objectUrl = URL.createObjectURL(fileBlob,);
            const a = document.createElement('a',);
            a.href = objectUrl;
            a.download = f.name;
            a.click();
            URL.revokeObjectURL(objectUrl,);
          };
        }
      }
    }, 100,);
  }

  db.terminate();
  log('\n✅ Demonstração Completa Finalizada!',);
}

// ==========================================
// SEÇÃO INTERATIVA: GERENCIADOR OPFS UI
// ==========================================
function setupInteractiveOpfsUI() {
  if (!appElement) return;

  const container = document.createElement('div',);
  container.style.marginTop = '32px';
  container.style.padding = '24px';
  container.style.backgroundColor = 'var(--md-sys-color-surface)';
  container.style.borderRadius = '12px';
  container.style.border = '1px solid var(--md-sys-color-primary)';

  const title = document.createElement('h2',);
  title.style.color = 'var(--md-sys-color-primary)';
  title.style.marginTop = '0';
  title.innerText = '📁 Gerenciador Interativo OPFS (Isolado)';

  const desc = document.createElement('p',);
  desc.innerText =
    "Envie múltiplos arquivos para a pasta 'ui_uploads' utilizando o wrapper unificado opfs().";

  const inputWrapper = document.createElement('div',);
  inputWrapper.style.marginBottom = '24px';

  const input = document.createElement('input',);
  input.type = 'file';
  input.multiple = true;
  input.style.display = 'block';
  input.style.padding = '8px 0';
  input.style.color = 'var(--md-sys-color-on-background)';

  const fileListContainer = document.createElement('div',);
  fileListContainer.style.display = 'flex';
  fileListContainer.style.flexDirection = 'column';
  fileListContainer.style.gap = '8px';

  inputWrapper.appendChild(input,);
  container.appendChild(title,);
  container.appendChild(desc,);
  container.appendChild(inputWrapper,);
  container.appendChild(fileListContainer,);
  appElement.appendChild(container,);

  const userDrive = opfs('INTERACTIVE_DB', 'files', 'INT_', 'ui_uploads',);
  const FOLDER_KEY = 'pasta_do_usuario';

  userDrive.set(FOLDER_KEY, { created: Date.now(), type: 'interactive_test', },).catch(
    console.error,
  );

  const renderFiles = async () => {
    fileListContainer.innerHTML = '<p>Carregando arquivos...</p>';
    try {
      const files = await userDrive.listFiles(FOLDER_KEY,);
      fileListContainer.innerHTML = '';

      if (files.length === 0) {
        fileListContainer.innerHTML =
          "<p style='color: #888;'>Nenhum arquivo nesta pasta. Faça um upload acima!</p>";
        return;
      }

      for (const f of files) {
        const item = document.createElement('div',);
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        item.style.background = '#1a1c19';
        item.style.padding = '12px 16px';
        item.style.borderRadius = '8px';

        const name = document.createElement('span',);
        name.innerText = `${f.name} - ${(f.size / 1024).toFixed(1,)} KB`;

        const actions = document.createElement('div',);
        actions.style.display = 'flex';
        actions.style.gap = '8px';

        const btnDownload = document.createElement('button',);
        btnDownload.innerText = 'Baixar';
        btnDownload.style.cursor = 'pointer';
        btnDownload.style.background = 'var(--md-sys-color-primary)';
        btnDownload.style.color = '#1a1c19';
        btnDownload.style.border = 'none';
        btnDownload.style.fontWeight = 'bold';
        btnDownload.style.borderRadius = '4px';
        btnDownload.style.padding = '6px 12px';

        btnDownload.onclick = async () => {
          try {
            const btnOriginalText = btnDownload.innerText;
            btnDownload.innerText = 'Baixando...';
            btnDownload.disabled = true;

            const fileBlob = await userDrive.getFile(FOLDER_KEY, f.name,);

            const url = URL.createObjectURL(fileBlob,);
            const a = document.createElement('a',);
            a.href = url;
            a.download = f.name;
            a.click();
            URL.revokeObjectURL(url,);

            btnDownload.innerText = btnOriginalText;
            btnDownload.disabled = false;
          } catch (err) {
            console.error('Erro no download:', err,);
            btnDownload.innerText = 'Erro!';
          }
        };

        const btnDelete = document.createElement('button',);
        btnDelete.innerText = 'Excluir';
        btnDelete.style.cursor = 'pointer';
        btnDelete.style.background = '#ff5252';
        btnDelete.style.color = 'white';
        btnDelete.style.border = 'none';
        btnDelete.style.fontWeight = 'bold';
        btnDelete.style.borderRadius = '4px';
        btnDelete.style.padding = '6px 12px';

        btnDelete.onclick = async () => {
          btnDelete.disabled = true;
          btnDelete.innerText = 'Excluindo...';
          await userDrive.delFile(FOLDER_KEY, f.name,);
          await renderFiles();
        };

        actions.appendChild(btnDownload,);
        actions.appendChild(btnDelete,);

        item.appendChild(name,);
        item.appendChild(actions,);
        fileListContainer.appendChild(item,);
      }
    } catch (err) {
      fileListContainer.innerHTML = `<p style="color: #ff5252;">Erro ao listar: ${
        (err as Error).message
      }</p>`;
    }
  };

  input.onchange = async () => {
    if (!input.files || input.files.length === 0) return;

    input.disabled = true;

    try {
      for (const file of Array.from(input.files,)) {
        await userDrive.addFile(FOLDER_KEY, file, file.name,);
      }
    } catch (err) {
      console.error('Erro ao subir arquivo:', err,);
    } finally {
      input.disabled = false;
      input.value = '';
      await renderFiles();
    }
  };

  renderFiles();
}

runRealWorldTests()
  .then(() => setupInteractiveOpfsUI())
  .catch((err,) => {
    log('❌ OCORREU UM ERRO FATAL:', err.message,);
  },);

```

---

## Arquivo: `packages/worker-db/example/server.ts`

```ts
import { serveDir, } from '@std/http/file-server';
import { ensureDir, } from '@std/fs';

const clean = async () => {
  try {
    await Deno.remove('./build', { recursive: true, },);
    console.log('📁 Arquivos anteriores excluídos',);
  } catch {
    // diretório não existe, ok
  }
  await ensureDir('./build',);
};

async function prepareAndBuild() {
  const startTime = performance.now();

  console.log('🔨 [DEV SERVER] Preparando ambiente...',);
  await clean();

  console.log('📦 [DEV SERVER] Fazendo bundle do index.html...',);
  // @ts-ignore: Deno.bundle API interna
  const result_html = await Deno.bundle({
    entrypoints: ['./example/index.html',],
    outputDir: './build',
    platform: 'browser',
    format: 'esm',
    packages: 'external',
    keepnames: true,
    inlineImports: true,
    codeSplitting: false,
    minify: false,
    sourcemap: 'linked',
    write: true,
  },);

  if (!result_html.success) throw new Error('Falha ao gerar bundle do HTML.',);

  console.log('⚙️ Gerando bundle do Worker DB...',);
  // @ts-ignore: Deno.bundle API interna
  const result_worker = await Deno.bundle({
    entrypoints: ['./src/worker.ts',],
    outputPath: './build/worker-db.js',
    platform: 'browser',
    format: 'esm',
    packages: 'bundle',
    keepnames: true,
    inlineImports: true,
    codeSplitting: false,
    minify: false,
    sourcemap: 'linked',
    write: true,
  },);

  if (!result_worker.success) throw new Error('Falha ao gerar bundle do Worker.',);

  console.log('🔄 Gerando bundle do Service Worker...',);
  // @ts-ignore: Deno.bundle API interna
  const result_sw = await Deno.bundle({
    entrypoints: ['./example/sw.ts',],
    outputPath: './build/sw.js',
    platform: 'browser',
    format: 'esm',
    packages: 'bundle',
    keepnames: true,
    inlineImports: true,
    codeSplitting: false,
    minify: false,
    sourcemap: 'linked',
    write: true,
  },);

  if (!result_sw.success) throw new Error('Falha ao gerar bundle do Service Worker.',);

  const endTime = performance.now();
  console.log(
    `✅ [DEV SERVER] Build concluído com sucesso em ${(endTime - startTime).toFixed(2,)}ms!`,
  );
}

await prepareAndBuild();

console.log(`\n🚀 Servidor estático rodando em: http://localhost:9000`,);
console.log('   Disponibilizando o diretório: ./build/',);

Deno.serve({ port: 9000, }, (req,) => {
  return serveDir(req, {
    fsRoot: './build/',
    showDirListing: true,
    enableCors: true,
  },);
},);

```

---

## Arquivo: `packages/worker-db/example/sw.ts`

```ts
// ## Arquivo: monorepo/worker-db/example/sw.ts
/// <reference lib="webworker" />

import { dbsw as db, } from '../src/mod-main.ts';
import { listOpfsFiles, } from '../src/utils/opfs.ts';

const sw = self as unknown as ServiceWorkerGlobalScope;

sw.addEventListener('install', (event,) => {
  sw.skipWaiting();
},);

sw.addEventListener('activate', (event,) => {
  event.waitUntil(sw.clients.claim(),);
},);

sw.addEventListener('message', async (event,) => {
  if (event.data && event.data.type === 'RUN_SW_DEMO') {
    try {
      const msgStore = db('BROWSERTORRENT_DATA', 'messages', 'MSG_',);

      const insertedId = await msgStore.set('auto', {
        senderId: 'system_sw',
        recipientId: 'all',
        content: 'Mensagem gravada diretamente pelo Service Worker!',
        status: 'delivered',
        priority: 99,
        timestamp: Date.now(),
      },);

      const allMessages = await msgStore.values();

      // Utilizando o padrão Record-Key ("auto_backups") dentro da pasta física global /backup
      const backupName = await msgStore.backupToOpfs('auto_backups', 'sw_auto_backup.json',);
      const opfsFiles = await listOpfsFiles();

      event.ports[0]?.postMessage({
        success: true,
        payload: {
          insertedId,
          totalMessages: allMessages.length,
          backupName,
          opfsFiles,
        },
      },);
    } catch (error) {
      event.ports[0]?.postMessage({
        success: false,
        error: (error as Error).message,
      },);
    }
  }
},);

```

---

## Arquivo: `packages/worker-db/src/db.ts`

```ts
// ## Arquivo: monorepo/worker-db/src/db-sw.ts
// ⚠️ MÓDULO CENTRAL DO BANCO DE DADOS: Ponto único de verdade para manipulação do IDB e OPFS.
import {
  clear,
  createStore,
  del,
  delMany,
  entries,
  get,
  getMany,
  keys,
  set,
  setMany,
  type UseStore,
  values,
} from 'idb-keyval';
import { unzipSync, zipSync, } from 'fflate';

import {
  formatDbItem,
  gerarId,
  gerarIdComPrefixo,
  prepareForSave,
  type WithId,
} from './utils/id.ts';

// ============================================================================
// DEFINIÇÕES DE TIPOS (Single Source of Truth)
// ============================================================================
export interface DbStoreOptions {
  dbName?: string;
  storeName?: string;
  prefix?: string;
}

export interface OpfsStoreOptions extends DbStoreOptions {
  basePath?: string;
}

export interface OpfsFileInfo {
  name: string;
  size: number;
  type: string;
  lastModified: number;
}
// ============================================================================

const storeCache = new Map<string, UseStore>();

function getCustomStore(dbName?: string, storeName = 'keyval',): UseStore | undefined {
  if (!dbName) return undefined;
  const cacheKey = `${dbName}:${storeName}`;
  if (!storeCache.has(cacheKey,)) storeCache.set(cacheKey, createStore(dbName, storeName,),);
  return storeCache.get(cacheKey,);
}

function formatDbEntries(rawEntries: [IDBValidKey, unknown,][], prefix?: string,) {
  let items = rawEntries;
  if (prefix) items = items.filter(([k,],) => typeof k === 'string' && k.startsWith(prefix,));
  return items.map(([k, v,],) => formatDbItem(k, v, prefix,));
}

async function getRecordDir(
  basePath = '',
  rawKey: string,
  create = false,
): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  const fullPath = basePath ? `${basePath}/${rawKey}` : rawKey;
  const parts = fullPath.split('/',).filter(Boolean,);
  let curr = root;
  for (const p of parts) curr = await curr.getDirectoryHandle(p, { create, },);
  return curr;
}

export const globalSwDbAPI = {
  get: async <T,>(key: string, opts?: DbStoreOptions,): Promise<WithId<T> | undefined> => {
    const store = getCustomStore(opts?.dbName, opts?.storeName,);
    const rawKey = opts?.prefix && !key.startsWith(opts.prefix,) ? `${opts.prefix}${key}` : key;
    const val = await get(rawKey, store,);
    return val !== undefined ? formatDbItem(rawKey, val, opts?.prefix,) : undefined;
  },

  set: async <T,>(
    keyOrVal: string | T,
    val?: T | DbStoreOptions,
    opts?: DbStoreOptions,
  ): Promise<string> => {
    let keyToSave: string | undefined;
    let valToSave: unknown;
    let options: DbStoreOptions = opts || {};
    if (typeof keyOrVal !== 'string') {
      keyToSave = undefined;
      valToSave = keyOrVal;
      if (val) options = val as DbStoreOptions;
    } else {
      keyToSave = keyOrVal;
      valToSave = val;
    }
    const store = getCustomStore(options.dbName, options.storeName,);
    const { key, cleanVal, } = prepareForSave(keyToSave, valToSave, options.prefix,);
    await set(key, cleanVal, store,);
    return key;
  },

  update: async <T,>(
    key: string,
    updater: (val: WithId<T> | undefined,) => T,
    opts?: DbStoreOptions,
  ): Promise<void> => {
    const currentVal = await globalSwDbAPI.get<T>(key, opts,);
    const newVal = updater(currentVal,);
    await globalSwDbAPI.set(key, newVal, opts,);
  },

  patch: async <T extends Record<string, unknown>, C = unknown,>(
    key: string,
    patchOrFn: Partial<T> | ((prev: WithId<T>, ctx?: C,) => T | Partial<T>),
    context?: C,
    opts?: DbStoreOptions,
  ): Promise<WithId<T>> => {
    const store = getCustomStore(opts?.dbName, opts?.storeName,);
    const rawKey = opts?.prefix && !key.startsWith(opts.prefix,) ? `${opts.prefix}${key}` : key;
    const current = (await get(rawKey, store,)) || {};

    let updated: unknown;
    if (typeof patchOrFn === 'function') {
      updated = patchOrFn(formatDbItem(rawKey, current, opts?.prefix,) as WithId<T>, context,);
    } else {
      updated = Object.assign({}, current, patchOrFn,);
    }
    const { key: finalKey, cleanVal, } = prepareForSave(rawKey, updated, opts?.prefix,);
    await set(finalKey, cleanVal, store,);
    return formatDbItem(finalKey, cleanVal, opts?.prefix,);
  },

  delete: async (key: string, opts?: DbStoreOptions,): Promise<void> => {
    const store = getCustomStore(opts?.dbName, opts?.storeName,);
    const rawKey = opts?.prefix && !key.startsWith(opts.prefix,) ? `${opts.prefix}${key}` : key;
    await del(rawKey, store,);
  },

  getMany: async <T,>(
    keysList: string[],
    opts?: DbStoreOptions,
  ): Promise<(WithId<T> | undefined)[]> => {
    const store = getCustomStore(opts?.dbName, opts?.storeName,);
    const fullKeys = keysList.map((k,) =>
      opts?.prefix && !k.startsWith(opts.prefix,) ? `${opts.prefix}${k}` : k
    );
    const rawValues = await getMany(fullKeys, store,);
    return rawValues.map((val, idx,) =>
      val !== undefined ? formatDbItem(fullKeys[idx]!, val, opts?.prefix,) : undefined
    );
  },

  setMany: async (entriesList: [string, unknown,][], opts?: DbStoreOptions,): Promise<void> => {
    const store = getCustomStore(opts?.dbName, opts?.storeName,);
    const entriesToSet: [string, unknown,][] = entriesList.map(([k, v,],) => {
      const { key, cleanVal, } = prepareForSave(k, v, opts?.prefix,);
      return [key, cleanVal,];
    },);
    await setMany(entriesToSet, store,);
  },

  deleteMany: async (keysList: string[], opts?: DbStoreOptions,): Promise<void> => {
    const store = getCustomStore(opts?.dbName, opts?.storeName,);
    const fullKeys = keysList.map((k,) =>
      opts?.prefix && !k.startsWith(opts.prefix,) ? `${opts.prefix}${k}` : k
    );
    await delMany(fullKeys, store,);
  },

  keys: async (opts?: DbStoreOptions,): Promise<string[]> => {
    const store = getCustomStore(opts?.dbName, opts?.storeName,);
    const allKeys = await keys(store,);
    return opts?.prefix
      ? allKeys.filter((k,) => typeof k === 'string' && k.startsWith(opts.prefix!,)) as string[]
      : allKeys as string[];
  },

  values: async <T,>(opts?: DbStoreOptions,): Promise<T[]> => {
    const store = getCustomStore(opts?.dbName, opts?.storeName,);
    const allEntries = await entries(store,);
    return formatDbEntries(allEntries, opts?.prefix,) as unknown as T[];
  },

  entries: async <T,>(opts?: DbStoreOptions,): Promise<[string, T,][]> => {
    const store = getCustomStore(opts?.dbName, opts?.storeName,);
    const allEntries = await entries(store,);
    return opts?.prefix
      ? allEntries.filter(([k,],) => typeof k === 'string' && k.startsWith(opts.prefix!,)) as [
        string,
        T,
      ][]
      : allEntries as [string, T,][];
  },

  clear: async (opts?: DbStoreOptions,): Promise<void> => {
    const store = getCustomStore(opts?.dbName, opts?.storeName,);
    if (opts?.prefix) {
      const allKeys = await keys(store,);
      const keysToDelete = allKeys.filter((k,) =>
        typeof k === 'string' && k.startsWith(opts.prefix!,)
      );
      await delMany(keysToDelete, store,);
    } else {
      await clear(store,);
    }
  },

  query: async <T, R, C = unknown,>(
    fn: (items: WithId<T>[], ctx?: C,) => R,
    context?: C,
    opts?: DbStoreOptions,
  ): Promise<R> => {
    const store = getCustomStore(opts?.dbName, opts?.storeName,);
    const rawEntries = await entries(store,);
    const formattedItems = formatDbEntries(rawEntries, opts?.prefix,);
    return fn(formattedItems as WithId<T>[], context,);
  },

  getSome: async <T, C = unknown,>(
    fn: (items: WithId<T>[], ctx?: C,) => WithId<T>[],
    context?: C,
    opts?: DbStoreOptions,
  ): Promise<WithId<T>[]> => {
    const store = getCustomStore(opts?.dbName, opts?.storeName,);
    const rawEntries = await entries(store,);
    const formattedItems = formatDbEntries(rawEntries, opts?.prefix,);
    const selectedItems = fn(formattedItems as WithId<T>[], context,);
    if (!Array.isArray(selectedItems,)) {
      throw new Error('A função injetada em GET_SOME deve retornar um Array.',);
    }
    return selectedItems;
  },

  delSome: async <T, C = unknown,>(
    fn: (items: WithId<T>[], ctx?: C,) => WithId<T>[],
    context?: C,
    opts?: DbStoreOptions,
  ): Promise<void> => {
    const store = getCustomStore(opts?.dbName, opts?.storeName,);
    const rawEntries = await entries(store,);
    const formattedItems = formatDbEntries(rawEntries, opts?.prefix,);
    const selectedItems = fn(formattedItems as WithId<T>[], context,);

    if (!Array.isArray(selectedItems,)) {
      throw new Error('A função injetada em DEL_SOME deve retornar um Array.',);
    }

    const keysToDelete: string[] = selectedItems.map((item: WithId<T>,) => {
      if (!item || item._id === undefined) {
        throw new Error("Os itens retornados em DEL_SOME precisam conter a propriedade '_id'.",);
      }
      return opts?.prefix && !item._id.startsWith(opts.prefix,)
        ? `${opts.prefix}${item._id}`
        : item._id;
    },);
    await delMany(keysToDelete, store,);
  },

  setSome: async <T, C = unknown,>(
    selectFn: (items: WithId<T>[], ctx?: C,) => WithId<T>[],
    updateFn: (item: WithId<T>, ctx?: C,) => WithId<T>,
    context?: C,
    opts?: DbStoreOptions,
  ): Promise<void> => {
    const store = getCustomStore(opts?.dbName, opts?.storeName,);
    const rawEntries = await entries(store,);
    const formattedItems = formatDbEntries(rawEntries, opts?.prefix,);

    const selectedItems = selectFn(formattedItems as WithId<T>[], context,);
    if (!Array.isArray(selectedItems,)) {
      throw new Error('A função de seleção em SET_SOME deve retornar um Array.',);
    }

    const entriesToSet: [string, unknown,][] = selectedItems.map((item: WithId<T>,) => {
      if (!item || item._id === undefined) {
        throw new Error("Os itens selecionados no SET_SOME precisam conter a propriedade '_id'.",);
      }
      const updatedItem = updateFn(item, context,);
      const { key, cleanVal, } = prepareForSave(undefined, updatedItem, opts?.prefix,);
      return [key, cleanVal,];
    },);
    await setMany(entriesToSet, store,);
  },

  exportDB: async (opts?: DbStoreOptions,): Promise<Record<string, unknown>> => {
    const store = getCustomStore(opts?.dbName, opts?.storeName,);
    const allEntries = await entries(store,);
    const filtered = opts?.prefix
      ? allEntries.filter(([k,],) => typeof k === 'string' && k.startsWith(opts.prefix!,))
      : allEntries;
    return Object.fromEntries(filtered,);
  },

  importDB: async (
    data: Record<string, unknown>,
    clearFirst = false,
    opts?: DbStoreOptions,
  ): Promise<void> => {
    const store = getCustomStore(opts?.dbName, opts?.storeName,);
    if (clearFirst) await globalSwDbAPI.clear(opts,);

    const entriesToImport: [string, unknown,][] = Object.entries(data,).map(([k, v,],) => {
      const { key, cleanVal, } = prepareForSave(k, v, opts?.prefix,);
      return [key, cleanVal,];
    },);
    await setMany(entriesToImport, store,);
  },

  backupToOpfs: async (key: string, fileName?: string, opts?: DbStoreOptions,): Promise<string> => {
    const store = getCustomStore(opts?.dbName, opts?.storeName,);
    const allEntries = await entries(store,);
    const filtered = opts?.prefix
      ? allEntries.filter(([k,],) => typeof k === 'string' && k.startsWith(opts.prefix!,))
      : allEntries;
    const data = Object.fromEntries(filtered,);

    const finalName = fileName || 'backup.json';
    const rawKey = opts?.prefix && !key.startsWith(opts.prefix,) ? `${opts.prefix}${key}` : key;

    const dir = await getRecordDir('backup', rawKey, true,);
    const fileHandle = await dir.getFileHandle(finalName, { create: true, },);
    const w = await fileHandle.createWritable();
    await w.write(new Blob([JSON.stringify(data,),], { type: 'application/json', },),);
    await w.close();

    return `${rawKey}/${finalName}`;
  },

  restoreFromOpfs: async (
    key: string,
    fileName: string,
    clearFirst = false,
    opts?: DbStoreOptions,
  ): Promise<void> => {
    const rawKey = opts?.prefix && !key.startsWith(opts.prefix,) ? `${opts.prefix}${key}` : key;
    const dir = await getRecordDir('backup', rawKey, false,);

    const finalName = fileName.includes('/',) ? fileName.split('/',).pop()! : fileName;

    const fileHandle = await dir.getFileHandle(finalName,);
    const file = await fileHandle.getFile();
    const data = JSON.parse(await file.text(),);

    const store = getCustomStore(opts?.dbName, opts?.storeName,);
    if (clearFirst) await globalSwDbAPI.clear(opts,);

    const entriesToImport: [string, unknown,][] = Object.entries(data,).map(([k, v,],) => {
      const { key, cleanVal, } = prepareForSave(k, v, opts?.prefix,);
      return [key, cleanVal,];
    },);
    await setMany(entriesToImport, store,);
  },
};

export const globalSwOpfsAPI = {
  ...globalSwDbAPI,

  listFiles: async (key: string, opts?: OpfsStoreOptions,): Promise<OpfsFileInfo[]> => {
    const rawKey = opts?.prefix && !key.startsWith(opts.prefix,) ? `${opts.prefix}${key}` : key;
    const dir = await getRecordDir(opts?.basePath, rawKey, true,);
    const filesList = [];
    // @ts-ignore: Deno API for directory entries
    for await (const [name, handle,] of dir.entries()) {
      if (handle.kind === 'file') {
        const file = await handle.getFile();
        filesList.push({
          name,
          size: file.size,
          type: file.type,
          lastModified: file.lastModified,
        },);
      }
    }
    return filesList;
  },

  getFile: async (key: string, fileName: string, opts?: OpfsStoreOptions,): Promise<File> => {
    const rawKey = opts?.prefix && !key.startsWith(opts.prefix,) ? `${opts.prefix}${key}` : key;
    const dir = await getRecordDir(opts?.basePath, rawKey, false,);
    const fileHandle = await dir.getFileHandle(fileName,);
    return await fileHandle.getFile();
  },

  addFile: async (
    key: string,
    file: File | Blob,
    fileName: string,
    opts?: OpfsStoreOptions,
  ): Promise<void> => {
    const rawKey = opts?.prefix && !key.startsWith(opts.prefix,) ? `${opts.prefix}${key}` : key;
    const dir = await getRecordDir(opts?.basePath, rawKey, true,);
    const fh = await dir.getFileHandle(fileName, { create: true, },);
    const w = await fh.createWritable();
    await w.write(new Blob([await file.arrayBuffer(),],),);
    await w.close();
  },

  delFile: async (key: string, fileName: string, opts?: OpfsStoreOptions,): Promise<void> => {
    const rawKey = opts?.prefix && !key.startsWith(opts.prefix,) ? `${opts.prefix}${key}` : key;
    const dir = await getRecordDir(opts?.basePath, rawKey, false,);
    await dir.removeEntry(fileName,);
  },

  renFile: async (
    key: string,
    oldName: string,
    newName: string,
    opts?: OpfsStoreOptions,
  ): Promise<void> => {
    const rawKey = opts?.prefix && !key.startsWith(opts.prefix,) ? `${opts.prefix}${key}` : key;
    const dir = await getRecordDir(opts?.basePath, rawKey, false,);
    const oldFile = await dir.getFileHandle(oldName,);
    const fileData = await oldFile.getFile();
    const newFile = await dir.getFileHandle(newName, { create: true, },);
    const w = await newFile.createWritable();
    await w.write(new Blob([await fileData.arrayBuffer(),],),);
    await w.close();
    await dir.removeEntry(oldName,);
  },

  mvFile: async (
    key: string,
    fileName: string,
    newKey: string,
    opts?: OpfsStoreOptions,
  ): Promise<void> => {
    const rawKey = opts?.prefix && !key.startsWith(opts.prefix,) ? `${opts.prefix}${key}` : key;
    const dir = await getRecordDir(opts?.basePath, rawKey, false,);
    const fileHandle = await dir.getFileHandle(fileName,);
    const fileData = await fileHandle.getFile();

    const rawNewKey = opts?.prefix && !newKey.startsWith(opts.prefix,)
      ? `${opts.prefix}${newKey}`
      : newKey;
    const targetDir = await getRecordDir(opts?.basePath, rawNewKey, true,);

    const newFile = await targetDir.getFileHandle(fileName, { create: true, },);
    const w = await newFile.createWritable();
    await w.write(new Blob([await fileData.arrayBuffer(),],),);
    await w.close();
    await dir.removeEntry(fileName,);
  },

  zip: async (
    key: string,
    zipName: string,
    filesToZip?: string[],
    deleteOriginals = false,
    opts?: OpfsStoreOptions,
  ): Promise<void> => {
    const rawKey = opts?.prefix && !key.startsWith(opts.prefix,) ? `${opts.prefix}${key}` : key;
    const dir = await getRecordDir(opts?.basePath, rawKey, false,);
    const filesRecord: Record<string, Uint8Array> = {};

    // @ts-ignore: Deno API for directory entries
    for await (const [name, handle,] of dir.entries()) {
      if (handle.kind === 'file' && (!filesToZip || filesToZip.includes(name,))) {
        const f = await handle.getFile();
        filesRecord[name] = new Uint8Array(await f.arrayBuffer(),);
      }
    }

    const zippedData = zipSync(filesRecord,);
    const zipFileHandle = await dir.getFileHandle(zipName, { create: true, },);
    const w = await zipFileHandle.createWritable();
    await w.write(new Blob([zippedData as BlobPart,],),);
    await w.close();

    if (deleteOriginals) {
      for (const name of Object.keys(filesRecord,)) await dir.removeEntry(name,);
    }
  },

  unzip: async (
    key: string,
    zipName: string,
    deleteZip = false,
    opts?: OpfsStoreOptions,
  ): Promise<void> => {
    const rawKey = opts?.prefix && !key.startsWith(opts.prefix,) ? `${opts.prefix}${key}` : key;
    const dir = await getRecordDir(opts?.basePath, rawKey, false,);
    const zipFileHandle = await dir.getFileHandle(zipName,);
    const zipBuffer = new Uint8Array(await (await zipFileHandle.getFile()).arrayBuffer(),);

    const unzipped = unzipSync(zipBuffer,);
    for (const [name, data,] of Object.entries(unzipped,)) {
      if (!name.includes('/',)) {
        const fh = await dir.getFileHandle(name, { create: true, },);
        const w = await fh.createWritable();
        await w.write(new Blob([data as BlobPart,],),);
        await w.close();
      }
    }

    if (deleteZip) await dir.removeEntry(zipName,);
  },

  addZip: async (
    key: string,
    zipName: string,
    file: File | Blob,
    fileName: string,
    opts?: OpfsStoreOptions,
  ): Promise<void> => {
    const rawKey = opts?.prefix && !key.startsWith(opts.prefix,) ? `${opts.prefix}${key}` : key;
    const dir = await getRecordDir(opts?.basePath, rawKey, false,);
    const zipFileHandle = await dir.getFileHandle(zipName,);
    const zipBuffer = new Uint8Array(await (await zipFileHandle.getFile()).arrayBuffer(),);
    const currentZipData = unzipSync(zipBuffer,);

    currentZipData[fileName] = new Uint8Array(await file.arrayBuffer(),);

    const newZippedData = zipSync(currentZipData,);
    const w = await zipFileHandle.createWritable();
    await w.write(new Blob([newZippedData as BlobPart,],),);
    await w.close();
  },

  delZip: async (
    key: string,
    zipName: string,
    fileName: string,
    opts?: OpfsStoreOptions,
  ): Promise<void> => {
    const rawKey = opts?.prefix && !key.startsWith(opts.prefix,) ? `${opts.prefix}${key}` : key;
    const dir = await getRecordDir(opts?.basePath, rawKey, false,);
    const zipFileHandle = await dir.getFileHandle(zipName,);
    const zipBuffer = new Uint8Array(await (await zipFileHandle.getFile()).arrayBuffer(),);
    const currentZipData = unzipSync(zipBuffer,);

    delete currentZipData[fileName];

    const newZippedData = zipSync(currentZipData,);
    const w = await zipFileHandle.createWritable();
    await w.write(new Blob([newZippedData as BlobPart,],),);
    await w.close();
  },
};

// 💎 EXPORTA A API INTERNA PARA SER CONSUMIDA PELO PROXY (db.ts)
export const internalAPI = globalSwOpfsAPI;

export function createScopedDb(dbName?: string, storeName = 'keyval', prefix = '',) {
  const opts: DbStoreOptions = { dbName, storeName, prefix, };
  return {
    get: <T,>(key: string,) => globalSwDbAPI.get<T>(key, opts,),
    set: <T,>(keyOrVal: string | T, val?: T,) =>
      globalSwDbAPI.set<T>(keyOrVal, val, opts,),
    update: <T,>(key: string, updater: (val: WithId<T> | undefined,) => T,) =>
      globalSwDbAPI.update<T>(key, updater, opts,),
    patch: <T extends Record<string, unknown>, C = unknown,>(
      key: string,
      patchOrFn: Partial<T> | ((prev: WithId<T>, ctx?: C,) => T | Partial<T>),
      context?: C,
    ) => globalSwDbAPI.patch<T, C>(key, patchOrFn, context, opts,),
    delete: (key: string,) => globalSwDbAPI.delete(key, opts,),
    getMany: <T,>(keys: string[],) => globalSwDbAPI.getMany<T>(keys, opts,),
    setMany: (entries: [string, unknown,][],) => globalSwDbAPI.setMany(entries, opts,),
    deleteMany: (keys: string[],) => globalSwDbAPI.deleteMany(keys, opts,),
    keys: () => globalSwDbAPI.keys(opts,),
    values: <T,>() => globalSwDbAPI.values<T>(opts,),
    entries: <T,>() => globalSwDbAPI.entries<T>(opts,),
    clear: () => globalSwDbAPI.clear(opts,),
    query: <T, R, C = unknown,>(fn: (items: WithId<T>[], ctx?: C,) => R, context?: C,) =>
      globalSwDbAPI.query<T, R, C>(fn, context, opts,),
    getSome: <T, C = unknown,>(fn: (items: WithId<T>[], ctx?: C,) => WithId<T>[], context?: C,) =>
      globalSwDbAPI.getSome<T, C>(fn, context, opts,),
    delSome: <T, C = unknown,>(fn: (items: WithId<T>[], ctx?: C,) => WithId<T>[], context?: C,) =>
      globalSwDbAPI.delSome<T, C>(fn, context, opts,),
    setSome: <T, C = unknown,>(
      selectFn: (items: WithId<T>[], ctx?: C,) => WithId<T>[],
      updateFn: (item: WithId<T>, ctx?: C,) => WithId<T>,
      context?: C,
    ) => globalSwDbAPI.setSome<T, C>(selectFn, updateFn, context, opts,),
    exportDB: () => globalSwDbAPI.exportDB(opts,),
    importDB: (data: Record<string, unknown>, clearFirst = false,) =>
      globalSwDbAPI.importDB(data, clearFirst, opts,),
    backupToOpfs: (key: string, fileName?: string,) =>
      globalSwDbAPI.backupToOpfs(key, fileName, opts,),
    restoreFromOpfs: (key: string, fileName: string, clearFirst = false,) =>
      globalSwDbAPI.restoreFromOpfs(key, fileName, clearFirst, opts,),
    gerarId,
    gerarIdComPrefixo: () => prefix ? gerarIdComPrefixo(prefix,) : gerarId(),
  };
}

export function createScopedOpfs(
  dbName?: string,
  storeName = 'keyval',
  prefix = '',
  basePath = '',
) {
  const opts: OpfsStoreOptions = { dbName, storeName, prefix, basePath, };
  return {
    ...createScopedDb(dbName, storeName, prefix,),
    listFiles: (key: string,) => globalSwOpfsAPI.listFiles(key, opts,),
    getFile: (key: string, fileName: string,) => globalSwOpfsAPI.getFile(key, fileName, opts,),
    addFile: (key: string, file: File | Blob, fileName: string,) =>
      globalSwOpfsAPI.addFile(key, file, fileName, opts,),
    delFile: (key: string, fileName: string,) => globalSwOpfsAPI.delFile(key, fileName, opts,),
    renFile: (key: string, oldName: string, newName: string,) =>
      globalSwOpfsAPI.renFile(key, oldName, newName, opts,),
    mvFile: (key: string, fileName: string, newKey: string,) =>
      globalSwOpfsAPI.mvFile(key, fileName, newKey, opts,),
    zip: (key: string, zipName: string, filesToZip?: string[], deleteOriginals = false,) =>
      globalSwOpfsAPI.zip(key, zipName, filesToZip, deleteOriginals, opts,),
    unzip: (key: string, zipName: string, deleteZip = false,) =>
      globalSwOpfsAPI.unzip(key, zipName, deleteZip, opts,),
    addZip: (key: string, zipName: string, file: File | Blob, fileName: string,) =>
      globalSwOpfsAPI.addZip(key, zipName, file, fileName, opts,),
    delZip: (key: string, zipName: string, fileName: string,) =>
      globalSwOpfsAPI.delZip(key, zipName, fileName, opts,),
  };
}

export const db = Object.assign(
  (dbName?: string, storeName?: string, prefix?: string,) =>
    createScopedDb(dbName, storeName, prefix,),
  globalSwDbAPI,
);
export const opfs = Object.assign(
  (dbName?: string, storeName?: string, prefix?: string, basePath = '',) =>
    createScopedOpfs(dbName, storeName, prefix, basePath,),
  globalSwOpfsAPI,
);

```

---

## Arquivo: `packages/worker-db/src/fake/assert.ts`

```ts
export function assert(condition: boolean, message?: string): void {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

export function assertEquals<T>(actual: unknown, expected: unknown, message?: string): void {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected} but got ${actual}`);
  }
}

export function assertNotEquals<T>(actual: unknown, expected: unknown, message?: string): void {
  if (actual === expected) {
    throw new Error(message || `Expected ${expected} but got ${actual}`);
  }
}

export async function assertRejects(
  fn: () => PromiseLike<unknown>,
  _ErrorClass: typeof Error,
  msg?: string,
): Promise<Error> {
  let result: Error | undefined;

  try {
    await fn();
  } catch (e) {
    if (e instanceof Error) {
      result = e;
    } else {
      throw new Error('Caught value was not an Error', );
    }
  }

  if (result === undefined) {
    throw new Error('Function did not throw, expected it to reject', );
  }

  // Check message if provided
  if (msg && result.message !== msg) {
    throw new Error(
      `Expected error message "${msg}" but got "${result.message}"`,
    );
  }

  return result;
}

```

---

## Arquivo: `packages/worker-db/src/fake/fake-db.ts`

```ts
// monorepo/worker-db/src/fake/fake-sw.ts
// ============================================================================
// 🔧 INJEÇÃO DE FAKE OPFS + INDEXEDDB NO SERVICE WORKER
// ============================================================================
//
// Este arquivo deve ser importado NO INÍCIO do seu service worker
// (antes de qualquer import que use db/opfs) para preparar o ambiente
// de testes/integração com OPFS e IndexedDB fakes.
//
// Diferença do fake-mod.ts (Main Thread):
// - NÃO injeta localStorage (não existe em Service Workers)
// - Injeta no escopo `self` (ServiceWorkerGlobalScope)
// - Exporta APIs diretas do db.ts (sem proxy RPC, pois o SW É o worker)
// ============================================================================

// 1. Injeta o IndexedDB Fake no escopo global do Service Worker (self)
import 'fake-indexeddb/auto';
import { FakeOPFSDirectory, } from './fake-opfs.ts';

const _self = self as any;

// 2. Injeta OPFS Fake no escopo do Service Worker
// navigator.storage.getDirectory() existe em Service Workers modernos,
// então precisamos substituí-la pela nossa versão fake em memória.
if (!_self.navigator) _self.navigator = {};
if (!_self.navigator.storage) _self.navigator.storage = {};
if (!_self.navigator.storage.getDirectory) {
  _self.navigator.storage.getDirectory = async () => new FakeOPFSDirectory();
}

// 3. Agora que o ambiente do Service Worker está perfeitamente simulado,
// exportamos as APIs diretas do banco de dados. O db.ts vai rodar
// achando que está em um Service Worker real do browser!
//
// ⚠️ IMPORTANTE: Importamos do db.ts (não do rpc.ts) porque o Service
// Worker NÃO precisa de um Web Worker interno - ele JÁ É um worker.
export { db, opfs, } from '../db.ts';

```

---

## Arquivo: `packages/worker-db/src/fake/fake-local-storage.ts`

```ts
export class FakeLocalStorage {
  private store = new Map<string, string>();

  getItem(key: string,): string | null {
    return this.store.get(key,) ?? null;
  }

  setItem(key: string, value: string,): void {
    this.store.set(key, String(value,),);
  }

  removeItem(key: string,): void {
    this.store.delete(key,);
  }

  clear(): void {
    this.store.clear();
  }

  get length(): number {
    return this.store.size;
  }

  key(index: number,): string | null {
    return Array.from(this.store.keys(),)[index] ?? null;
  }
}

```

---

## Arquivo: `packages/worker-db/src/fake/fake-mod.ts`

```ts
// monorepo/worker-db/src/fake/fake-mod.ts
// 1. Injeta o IndexedDB Fake globalmente (Main Thread)
import 'fake-indexeddb/auto';
import { FakeOPFSDirectory, } from './fake-opfs.ts';
import { FakeLocalStorage, } from './fake-local-storage.ts';

const _global = globalThis as any;

// 2. Injeta OPFS Fake (Main Thread)
if (!_global.navigator) _global.navigator = {};
if (!_global.navigator.storage) _global.navigator.storage = {};
if (!_global.navigator.storage.getDirectory) {
  _global.navigator.storage.getDirectory = async () => new FakeOPFSDirectory();
}

// 3. Injeta LocalStorage Fake (Main Thread)
if (!_global.localStorage || _global.localStorage.constructor.name !== 'FakeLocalStorage') {
  try {
    Object.defineProperty(_global, 'localStorage', {
      value: new FakeLocalStorage(),
      writable: true,
      configurable: true,
    },);
  } catch {
    _global.localStorage = new FakeLocalStorage();
  }
}

// 4. Exportamos tudo do módulo principal para que o demo.ts consuma
export * from '../mod-main.ts';

// 5. O PULO DO GATO: Forçamos a inicialização do módulo para usar o Worker Fake.
// 🔥 CORREÇÃO: O arquivo se chama fake-worker.ts, não fake-db.ts
// O Deno resolve arquivos .ts nativamente em Workers usando import.meta.url
import { db, } from '../mod-main.ts';
const fakeWorkerUrl = new URL('./fake-worker.ts', import.meta.url,);
db.init(fakeWorkerUrl,);

// 6. Exportamos as funções de assertivas customizadas
export { assert, assertEquals, assertNotEquals, assertRejects, } from './assert.ts';

```

---

## Arquivo: `packages/worker-db/src/fake/fake-opfs.ts`

```ts
export class FakeOPFSFileHandle {
  public kind: 'file' | 'directory' = 'file';

  constructor(
    private fullPath: string,
    private storage: Map<string, Uint8Array>,
  ) {}

  async createWritable() {
    const self = this;
    let content: Uint8Array = new Uint8Array();
    return {
      async write(data: Uint8Array | string | Blob | ArrayBuffer,) {
        if (data instanceof Uint8Array) {
          content = data;
        } else if (data instanceof ArrayBuffer) {
          content = new Uint8Array(data,);
        } else if (data instanceof Blob) {
          content = new Uint8Array(await data.arrayBuffer(),);
        } else {
          content = new TextEncoder().encode(String(data,),);
        }
      },
      async close() {
        self.storage.set(self.fullPath, content,);
      },
    };
  }

  async getFile(): Promise<File> {
    const content = this.storage.get(this.fullPath,);
    if (content === undefined) {
      throw new Error(`File ${this.fullPath} not found in Fake OPFS`,);
    }
    const fileName = this.fullPath.split('/',).pop() || 'file';
    return new File([content as any,], fileName, {
      type: 'application/octet-stream',
      lastModified: Date.now(),
    },);
  }
}

export class FakeOPFSDirectory {
  private static sharedStorage = new Map<string, Uint8Array>();

  constructor(private path: string = '',) {}

  async getDirectoryHandle(name: string, options?: { create?: boolean },) {
    return new FakeOPFSDirectory(this.path ? `${this.path}/${name}` : name,);
  }

  async getFileHandle(name: string, options?: { create?: boolean },) {
    const fullPath = this.path ? `${this.path}/${name}` : name;
    if (!options?.create && !FakeOPFSDirectory.sharedStorage.has(fullPath,)) {
      throw new Error(`File ${fullPath} not found in Fake OPFS`,);
    }
    return new FakeOPFSFileHandle(fullPath, FakeOPFSDirectory.sharedStorage,);
  }

  async removeEntry(name: string,) {
    const fullPath = this.path ? `${this.path}/${name}` : name;
    FakeOPFSDirectory.sharedStorage.delete(fullPath,);
  }

  async *keys() {
    for (const key of FakeOPFSDirectory.sharedStorage.keys()) {
      if (this.path && key.startsWith(`${this.path}/`,)) {
        const localName = key.slice(this.path.length + 1,);
        if (!localName.includes('/',)) yield localName;
      } else if (!this.path && !key.includes('/',)) {
        yield key;
      }
    }
  }

  async *entries() {
    for (const key of FakeOPFSDirectory.sharedStorage.keys()) {
      if (this.path && key.startsWith(`${this.path}/`,)) {
        const localName = key.slice(this.path.length + 1,);
        if (!localName.includes('/',)) {
          yield [
            localName,
            new FakeOPFSFileHandle(key, FakeOPFSDirectory.sharedStorage,),
          ] as const;
        }
      } else if (!this.path && !key.includes('/',)) {
        yield [key, new FakeOPFSFileHandle(key, FakeOPFSDirectory.sharedStorage,),] as const;
      }
    }
  }

  async *values() {
    for (const key of FakeOPFSDirectory.sharedStorage.keys()) {
      if (this.path && key.startsWith(`${this.path}/`,)) {
        const localName = key.slice(this.path.length + 1,);
        if (!localName.includes('/',)) {
          yield new FakeOPFSFileHandle(key, FakeOPFSDirectory.sharedStorage,);
        }
      } else if (!this.path && !key.includes('/',)) {
        yield new FakeOPFSFileHandle(key, FakeOPFSDirectory.sharedStorage,);
      }
    }
  }

  static clear() {
    FakeOPFSDirectory.sharedStorage.clear();
  }
}

```

---

## Arquivo: `packages/worker-db/src/fake/fake-worker.ts`

```ts
// monorepo/worker-db/src/fake/fake-db.ts

// 1. Injeta o IndexedDB Fake no escopo global (self) do Worker
import 'fake-indexeddb/auto';

import { FakeOPFSDirectory, } from './fake-opfs.ts';

const _self = self as any;

// 2. Injeta OPFS Fake no escopo do Worker
if (!_self.navigator) _self.navigator = {};
if (!_self.navigator.storage) _self.navigator.storage = {};
if (!_self.navigator.storage.getDirectory) {
  _self.navigator.storage.getDirectory = async () => new FakeOPFSDirectory();
}

// 3. Agora que o ambiente do Worker está perfeitamente simulado,
// importamos a lógica real do banco de dados. O db.ts vai rodar
// achando que está em um browser de verdade!
import '../worker.ts';

```

---

## Arquivo: `packages/worker-db/src/ls.ts`

```ts
// ## Arquivo: monorepo/worker-db/src/ls.ts
import {
  formatDbItem,
  gerarId,
  gerarIdComPrefixo,
  prepareForSave,
  type WithId,
} from './utils/id.ts';
import { opfs, } from './mod-main.ts'; // 💎 Proxy Worker-DB: Ponto de acesso unificado e assíncrono

export interface LsStoreOptions {
  prefix?: string;
}

function getAllPrefixedEntries(prefix = '',): [string, unknown,][] {
  const entries: [string, unknown,][] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i,);
    if (key && (!prefix || key.startsWith(prefix,))) {
      const rawVal = localStorage.getItem(key,);
      if (rawVal !== null) {
        try {
          entries.push([key, JSON.parse(rawVal,),],);
        } catch {
          // Ignora itens que não sejam JSON válido
        }
      }
    }
  }
  return entries;
}

function getFormattedItems<T,>(prefix = '',): WithId<T>[] {
  const rawEntries = getAllPrefixedEntries(prefix,);
  return rawEntries.map(([k, v,],) => formatDbItem(k, v, prefix,));
}

function resolveKey(key: string, prefix = '',): string {
  return prefix && !key.startsWith(prefix,) ? `${prefix}${key}` : key;
}

function createScopedLs(prefix = '',) {
  return {
    get: <T,>(key: string,): WithId<T> | undefined => {
      const fullKey = resolveKey(key, prefix,);
      const raw = localStorage.getItem(fullKey,);
      if (raw === null) return undefined;
      try {
        return formatDbItem(fullKey, JSON.parse(raw,), prefix,);
      } catch {
        return undefined;
      }
    },

    set: <T,>(keyOrVal: string | T, val?: T,): string => {
      let key: string | undefined;
      let targetVal: unknown;

      if (typeof keyOrVal === 'string') {
        key = keyOrVal;
        targetVal = val;
      } else {
        key = undefined;
        targetVal = keyOrVal;
      }

      const { key: finalKey, cleanVal, } = prepareForSave(key, targetVal, prefix,);
      localStorage.setItem(finalKey, JSON.stringify(cleanVal,),);
      return finalKey;
    },

    patch: <T extends Record<string, unknown>, C = unknown,>(
      key: string,
      patchOrFn: Partial<T> | ((prev: WithId<T>, ctx?: C,) => T | Partial<T>),
      context?: C,
    ): WithId<T> => {
      const current = createScopedLs(prefix,).get<T>(key,) || ({} as WithId<T>);
      let updated: unknown;

      if (typeof patchOrFn === 'function') {
        updated = patchOrFn(current, context,);
      } else {
        updated = Object.assign({}, current, patchOrFn,);
      }

      const { key: finalKey, cleanVal, } = prepareForSave(key, updated, prefix,);
      localStorage.setItem(finalKey, JSON.stringify(cleanVal,),);
      return formatDbItem(finalKey, cleanVal, prefix,);
    },

    delete: (key: string,): void => {
      localStorage.removeItem(resolveKey(key, prefix,),);
    },

    getMany: <T,>(keys: string[],): (WithId<T> | undefined)[] => {
      const api = createScopedLs(prefix,);
      return keys.map((k,) => api.get<T>(k,));
    },

    setMany: (entries: [string, unknown,][],): void => {
      const api = createScopedLs(prefix,);
      entries.forEach(([k, v,],) => api.set(k, v,));
    },

    deleteMany: (keys: string[],): void => {
      const api = createScopedLs(prefix,);
      keys.forEach((k,) => api.delete(k,));
    },

    keys: (): string[] => {
      const keysList: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i,);
        if (k && (!prefix || k.startsWith(prefix,))) {
          keysList.push(k,);
        }
      }
      return keysList;
    },

    values: <T,>(): T[] => {
      return getFormattedItems<T>(prefix,) as unknown as T[];
    },

    entries: <T,>(): [string, T,][] => {
      return getAllPrefixedEntries(prefix,) as [string, T,][];
    },

    clear: (): void => {
      if (!prefix) {
        localStorage.clear();
        return;
      }
      const keysToRemove = createScopedLs(prefix,).keys();
      keysToRemove.forEach((k,) => localStorage.removeItem(k,));
    },

    query: <T, R, C = unknown,>(fn: (items: WithId<T>[], ctx?: C,) => R, context?: C,): R => {
      const items = getFormattedItems<T>(prefix,);
      return fn(items, context,);
    },

    getSome: <T, C = unknown,>(
      fn: (items: WithId<T>[], ctx?: C,) => WithId<T>[],
      context?: C,
    ): WithId<T>[] => {
      const items = getFormattedItems<T>(prefix,);
      const selected = fn(items, context,);
      if (!Array.isArray(selected,)) {
        throw new Error('A função em getSome deve retornar um Array.',);
      }
      return selected;
    },

    delSome: <T, C = unknown,>(
      fn: (items: WithId<T>[], ctx?: C,) => WithId<T>[],
      context?: C,
    ): void => {
      const items = getFormattedItems<T>(prefix,);
      const selected = fn(items, context,);
      if (!Array.isArray(selected,)) {
        throw new Error('A função em delSome deve retornar um Array.',);
      }
      selected.forEach((item,) => {
        if (!item || item._id === undefined) {
          throw new Error("Os itens retornados em delSome precisam conter a propriedade '_id'.",);
        }
        const rawKey = prefix && !item._id.startsWith(prefix,) ? `${prefix}${item._id}` : item._id;
        localStorage.removeItem(rawKey,);
      },);
    },

    setSome: <T, C = unknown,>(
      selectFn: (items: WithId<T>[], ctx?: C,) => WithId<T>[],
      updateFn: (item: WithId<T>, ctx?: C,) => WithId<T>,
      context?: C,
    ): void => {
      const items = getFormattedItems<T>(prefix,);
      const selected = selectFn(items, context,);
      if (!Array.isArray(selected,)) {
        throw new Error('A função de seleção em setSome deve retornar um Array.',);
      }
      selected.forEach((item,) => {
        if (!item || item._id === undefined) {
          throw new Error("Os itens selecionados em setSome precisam conter a propriedade '_id'.",);
        }
        const updatedItem = updateFn(item, context,);
        const { key: finalKey, cleanVal, } = prepareForSave(undefined, updatedItem, prefix,);
        localStorage.setItem(finalKey, JSON.stringify(cleanVal,),);
      },);
    },

    // --- MÉTODOS DE EXPORTAÇÃO / IMPORTAÇÃO ---

    exportLS: (): Record<string, unknown> => {
      const allEntries = getAllPrefixedEntries(prefix,);
      return Object.fromEntries(allEntries,);
    },

    importLS: (data: Record<string, unknown>, clearFirst = false,): void => {
      const api = createScopedLs(prefix,);
      if (clearFirst) api.clear();
      Object.entries(data,).forEach(([k, v,],) => api.set(k, v,));
    },

    backupToOpfs: async (recordKey: string, fileName = 'backup.json',): Promise<string> => {
      const data = Object.fromEntries(getAllPrefixedEntries(prefix,),);
      const blob = new Blob([JSON.stringify(data,),], { type: 'application/json', },);

      // Instancia o drive OPFS via worker apontando para a pasta física /backup
      const drive = opfs('LS_SYS', 'ls_store', prefix, 'backup',);
      await drive.addFile(recordKey, blob, fileName,);

      return `${recordKey}/${fileName}`;
    },

    restoreFromOpfs: async (
      recordKey: string,
      fileName: string,
      clearFirst = false,
    ): Promise<void> => {
      // Instancia o drive OPFS via worker para leitura da pasta /backup
      const drive = opfs('LS_SYS', 'ls_store', prefix, 'backup',);

      const fileBlob = await drive.getFile(recordKey, fileName,);
      const data = JSON.parse(await fileBlob.text(),);

      const api = createScopedLs(prefix,);
      if (clearFirst) api.clear();
      Object.entries(data,).forEach(([k, v,],) => api.set(k, v,));
    },

    gerarId,
    gerarIdComPrefixo: () => (prefix ? gerarIdComPrefixo(prefix,) : gerarId()),
  };
}

export const ls = Object.assign(
  (prefix = '',) => createScopedLs(prefix,),
  createScopedLs(),
);

```

---

## Arquivo: `packages/worker-db/src/mod-main.ts`

```ts
// ## Arquivo: monorepo/worker-db/src/mod.ts

export { ls, } from './ls.ts';
export { db as dbsw, opfs as opfssw, } from './db.ts';
export { db, opfs, } from './rpc.ts';

```

---

## Arquivo: `packages/worker-db/src/mod-sw.ts`

```ts
// ## Arquivo: monorepo/worker-db/src/mod.ts

export { db, opfs, } from './db.ts';

```

---

## Arquivo: `packages/worker-db/src/rpc.ts`

```ts
// ## Arquivo: monorepo/worker-db/src/rpc.ts
import { gerarId, gerarIdComPrefixo, type WithId, } from './utils/id.ts';
import type { DbStoreOptions, OpfsFileInfo, OpfsStoreOptions, } from './db.ts';

let workerInstance: Worker | null = null;
let currentWorkerPath: string | URL = './worker-db.js';
const pendingRequests = new Map<string, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }>();

function getWorker(workerPath?: string | URL,): Worker {
  if (workerPath) {
    currentWorkerPath = workerPath;
  }

  if (!workerInstance) {
    const workerUrl = typeof currentWorkerPath === 'string'
      ? new URL(currentWorkerPath, import.meta.url,)
      : currentWorkerPath;
    workerInstance = new Worker(workerUrl, { type: 'module', },);

    workerInstance.onmessage = (e: MessageEvent,) => {
      const { requestId, success, result, error, } = e.data;
      const promise = pendingRequests.get(requestId,);
      if (promise) {
        if (success) promise.resolve(result,);
        else promise.reject(new Error(error,),);
        pendingRequests.delete(requestId,);
      }
    };

    workerInstance.onerror = (event,) => {
      console.error('⚠️ Falha crítica no Web Worker:', event.message,);
      pendingRequests.forEach(({ reject, },) => reject(new Error('Worker crashed',),));
      pendingRequests.clear();
      restartWorker();
    };
  }
  return workerInstance;
}

function restartWorker() {
  if (workerInstance) {
    workerInstance.terminate();
    workerInstance = null;
  }
  pendingRequests.forEach(({ reject, },) => reject(new Error('Worker foi reiniciado',),));
  pendingRequests.clear();
  getWorker();
}

function terminateWorker() {
  if (workerInstance) {
    workerInstance.terminate();
    workerInstance = null;
  }
}

function exec<T,>(command: string, args: Record<string, unknown> = {},): Promise<T> {
  return new Promise<T>((resolve, reject,) => {
    const requestId = gerarId();
    pendingRequests.set(requestId, { resolve: resolve as (value: unknown) => void, reject, },);
    try {
      getWorker().postMessage({ requestId, command, args, },);
    } catch (err) {
      pendingRequests.delete(requestId,);
      reject(err,);
    }
  },);
}

const globalDbAPI = {
  get: <T,>(key: string, opts?: DbStoreOptions,) => exec<WithId<T>>('GET', { key, ...opts, },),
  set: <T,>(keyOrVal: string | T, val?: T | DbStoreOptions, opts?: DbStoreOptions,) => {
    if (typeof keyOrVal !== 'string') {
      const options = opts || (val as DbStoreOptions) || {};
      return exec<string>('SET', { key: undefined, val: keyOrVal, ...options, },);
    }
    return exec<string>('SET', { key: keyOrVal, val, ...opts, },);
  },
  update: async <T,>(
    key: string,
    updater: (val: WithId<T> | undefined,) => T,
    opts?: DbStoreOptions,
  ): Promise<void> => {
    const currentVal = await exec<WithId<T> | undefined>('GET', { key, ...opts, },);
    const newVal = updater(currentVal,);
    await exec<void>('SET', { key, val: newVal, ...opts, },);
  },
  patch: <T extends Record<string, unknown>, C = unknown,>(
    key: string,
    patchOrFn: Partial<T> | ((prev: WithId<T>, ctx: C,) => T | Partial<T>),
    context?: C,
    opts?: DbStoreOptions,
  ): Promise<WithId<T>> => {
    const isFn = typeof patchOrFn === 'function';
    return exec<WithId<T>>('PATCH', {
      key,
      patch: isFn ? undefined : patchOrFn,
      fnStr: isFn ? patchOrFn.toString() : undefined,
      context,
      ...opts,
    },);
  },
  delete: (key: string, opts?: DbStoreOptions,) => exec<void>('DELETE', { key, ...opts, },),
  getMany: <T,>(keys: string[], opts?: DbStoreOptions,) =>
    exec<(WithId<T> | undefined)[]>('GET_MANY', { keys, ...opts, },),
  setMany: (entries: [string, unknown,][], opts?: DbStoreOptions,) =>
    exec<void>('SET_MANY', { entries, ...opts, },),
  deleteMany: (keys: string[], opts?: DbStoreOptions,) =>
    exec<void>('DEL_MANY', { keys, ...opts, },),
  keys: (opts?: DbStoreOptions,) => exec<string[]>('KEYS', { ...opts, },),
  values: <T,>(opts?: DbStoreOptions,) => exec<T[]>('VALUES', { ...opts, },),
  entries: <T,>(opts?: DbStoreOptions,) => exec<[string, T,][]>('ENTRIES', { ...opts, },),
  clear: (opts?: DbStoreOptions,) => exec<void>('CLEAR', { ...opts, },),
  query: <T, R, C = unknown,>(
    fn: (items: WithId<T>[], ctx: C,) => R,
    context?: C,
    opts?: DbStoreOptions,
  ): Promise<R> => exec<R>('QUERY', { fnStr: fn.toString(), context, ...opts, },),
  getSome: <T, C = unknown,>(
    fn: (items: WithId<T>[], ctx: C,) => WithId<T>[],
    context?: C,
    opts?: DbStoreOptions,
  ): Promise<WithId<T>[]> =>
    exec<WithId<T>[]>('GET_SOME', { fnStr: fn.toString(), context, ...opts, },),
  delSome: <T, C = unknown,>(
    fn: (items: WithId<T>[], ctx: C,) => WithId<T>[],
    context?: C,
    opts?: DbStoreOptions,
  ): Promise<void> => exec<void>('DEL_SOME', { fnStr: fn.toString(), context, ...opts, },),
  setSome: <T, C = unknown,>(
    selectFn: (items: WithId<T>[], ctx: C,) => WithId<T>[],
    updateFn: (item: WithId<T>, ctx: C,) => WithId<T>,
    context?: C,
    opts?: DbStoreOptions,
  ): Promise<void> =>
    exec<void>('SET_SOME', {
      selectFnStr: selectFn.toString(),
      updateFnStr: updateFn.toString(),
      context,
      ...opts,
    },),
  exportDB: (opts?: DbStoreOptions,) => exec<Record<string, unknown>>('EXPORT', { ...opts, },),
  importDB: (data: Record<string, unknown>, clearFirst = false, opts?: DbStoreOptions,) =>
    exec<void>('IMPORT', { data, clearFirst, ...opts, },),
  backupToOpfs: (key: string, fileName?: string, opts?: DbStoreOptions,) =>
    exec<string>('BACKUP_OPFS', { key, fileName, ...opts, },),
  restoreFromOpfs: (key: string, fileName: string, clearFirst = false, opts?: DbStoreOptions,) =>
    exec<void>('RESTORE_OPFS', { key, fileName, clearFirst, ...opts, },),

  init: (workerPath?: string | URL,) => {
    getWorker(workerPath,);
  },
  restart: () => restartWorker(),
  terminate: () => terminateWorker(),
};

function createScopedDb(dbName?: string, storeName = 'keyval', prefix = '',) {
  const opts: DbStoreOptions = { dbName, storeName, prefix, };
  return {
    get: <T,>(key: string,) => globalDbAPI.get<T>(key, opts,),
    set: <T,>(keyOrVal: string | T, val?: T,) =>
      globalDbAPI.set<T>(keyOrVal, val, opts,),
    update: <T,>(key: string, updater: (val: WithId<T> | undefined,) => T,) =>
      globalDbAPI.update<T>(key, updater, opts,),
    patch: <T extends Record<string, unknown>, C = unknown,>(
      key: string,
      patchOrFn: Partial<T> | ((prev: WithId<T>, ctx: C,) => T | Partial<T>),
      context?: C,
    ) => globalDbAPI.patch<T, C>(key, patchOrFn, context, opts,),
    delete: (key: string,) => globalDbAPI.delete(key, opts,),
    getMany: <T,>(keys: string[],) => globalDbAPI.getMany<T>(keys, opts,),
    setMany: (entries: [string, unknown,][],) => globalDbAPI.setMany(entries, opts,),
    deleteMany: (keys: string[],) => globalDbAPI.deleteMany(keys, opts,),
    keys: () => globalDbAPI.keys(opts,),
    values: <T,>() => globalDbAPI.values<T>(opts,),
    entries: <T,>() => globalDbAPI.entries<T>(opts,),
    clear: () => globalDbAPI.clear(opts,),
    query: <T, R, C = unknown,>(fn: (items: WithId<T>[], ctx: C,) => R, context?: C,) =>
      globalDbAPI.query<T, R, C>(fn, context, opts,),
    getSome: <T, C = unknown,>(fn: (items: WithId<T>[], ctx: C,) => WithId<T>[], context?: C,) =>
      globalDbAPI.getSome<T, C>(fn, context, opts,),
    delSome: <T, C = unknown,>(fn: (items: WithId<T>[], ctx: C,) => WithId<T>[], context?: C,) =>
      globalDbAPI.delSome<T, C>(fn, context, opts,),
    setSome: <T, C = unknown,>(
      selectFn: (items: WithId<T>[], ctx: C,) => WithId<T>[],
      updateFn: (item: WithId<T>, ctx: C,) => WithId<T>,
      context?: C,
    ) => globalDbAPI.setSome<T, C>(selectFn, updateFn, context, opts,),
    exportDB: () => globalDbAPI.exportDB(opts,),
    importDB: (data: Record<string, unknown>, clearFirst = false,) =>
      globalDbAPI.importDB(data, clearFirst, opts,),
    backupToOpfs: (key: string, fileName?: string,) =>
      globalDbAPI.backupToOpfs(key, fileName, opts,),
    restoreFromOpfs: (key: string, fileName: string, clearFirst = false,) =>
      globalDbAPI.restoreFromOpfs(key, fileName, clearFirst, opts,),
    gerarId,
    gerarIdComPrefixo: () => prefix ? gerarIdComPrefixo(prefix,) : gerarId(),
  };
}

const globalOpfsAPI = {
  ...globalDbAPI,
  listFiles: (key: string, opts?: OpfsStoreOptions,) =>
    exec<OpfsFileInfo[]>('OPFS_LIST', { key, ...opts, },),
  getFile: (key: string, fileName: string, opts?: OpfsStoreOptions,) =>
    exec<File>('OPFS_GET', { key, fileName, ...opts, },),
  addFile: (key: string, file: File | Blob, fileName: string, opts?: OpfsStoreOptions,) =>
    exec<void>('OPFS_ADD', { key, file, fileName, ...opts, },),
  delFile: (key: string, fileName: string, opts?: OpfsStoreOptions,) =>
    exec<void>('OPFS_DEL', { key, fileName, ...opts, },),
  renFile: (key: string, oldName: string, newName: string, opts?: OpfsStoreOptions,) =>
    exec<void>('OPFS_REN', { key, oldName, newName, ...opts, },),
  mvFile: (key: string, fileName: string, newKey: string, opts?: OpfsStoreOptions,) =>
    exec<void>('OPFS_MV', { key, fileName, newKey, ...opts, },),
  zip: (
    key: string,
    zipName: string,
    filesToZip?: string[],
    deleteOriginals = false,
    opts?: OpfsStoreOptions,
  ) => exec<void>('OPFS_ZIP', { key, zipName, filesToZip, deleteOriginals, ...opts, },),
  unzip: (key: string, zipName: string, deleteZip = false, opts?: OpfsStoreOptions,) =>
    exec<void>('OPFS_UNZIP', { key, zipName, deleteZip, ...opts, },),
  addZip: (
    key: string,
    zipName: string,
    file: File | Blob,
    fileName: string,
    opts?: OpfsStoreOptions,
  ) => exec<void>('OPFS_ADDZIP', { key, zipName, file, fileName, ...opts, },),
  delZip: (key: string, zipName: string, fileName: string, opts?: OpfsStoreOptions,) =>
    exec<void>('OPFS_DELZIP', { key, zipName, fileName, ...opts, },),
};

function createScopedOpfs(dbName?: string, storeName = 'keyval', prefix = '', basePath = '',) {
  const opts: OpfsStoreOptions = { dbName, storeName, prefix, basePath, };
  return {
    ...createScopedDb(dbName, storeName, prefix,),
    listFiles: (key: string,) => globalOpfsAPI.listFiles(key, opts,),
    getFile: (key: string, fileName: string,) => globalOpfsAPI.getFile(key, fileName, opts,),
    addFile: (key: string, file: File | Blob, fileName: string,) =>
      globalOpfsAPI.addFile(key, file, fileName, opts,),
    delFile: (key: string, fileName: string,) => globalOpfsAPI.delFile(key, fileName, opts,),
    renFile: (key: string, oldName: string, newName: string,) =>
      globalOpfsAPI.renFile(key, oldName, newName, opts,),
    mvFile: (key: string, fileName: string, newKey: string,) =>
      globalOpfsAPI.mvFile(key, fileName, newKey, opts,),
    zip: (key: string, zipName: string, filesToZip?: string[], deleteOriginals = false,) =>
      globalOpfsAPI.zip(key, zipName, filesToZip, deleteOriginals, opts,),
    unzip: (key: string, zipName: string, deleteZip = false,) =>
      globalOpfsAPI.unzip(key, zipName, deleteZip, opts,),
    addZip: (key: string, zipName: string, file: File | Blob, fileName: string,) =>
      globalOpfsAPI.addZip(key, zipName, file, fileName, opts,),
    delZip: (key: string, zipName: string, fileName: string,) =>
      globalOpfsAPI.delZip(key, zipName, fileName, opts,),
  };
}

export const db = Object.assign(
  (dbName?: string, storeName?: string, prefix?: string,) =>
    createScopedDb(dbName, storeName, prefix,),
  globalDbAPI,
);

export const opfs = Object.assign(
  (dbName?: string, storeName?: string, prefix?: string, basePath = '',) =>
    createScopedOpfs(dbName, storeName, prefix, basePath,),
  globalOpfsAPI,
);

```

---

## Arquivo: `packages/worker-db/src/utils/id.ts`

```ts
// src/utils/id-utils.ts

export type WithId<T,> = T & { _id: string };

/**
 * Gera um identificador único curto seguro.
 * Utiliza Web Crypto API se disponível, senão cai no fallback matemático.
 * @returns {string} ID gerado
 */
export function gerarId(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const array = new Uint8Array(12,);
    crypto.getRandomValues(array,);
    return Array.from(array, (byte,) => byte.toString(16,).padStart(2, '0',),).join('',).substring(
      0,
      12,
    );
  }
  return Date.now().toString(36,) + Math.random().toString(36,).substring(2, 8,);
}

/**
 * Valida se a string tem formato aceitável de ID.
 * @param {string} id
 * @returns {boolean}
 */
export function validarId(id: string,): boolean {
  return typeof id === 'string' && id.length > 0 && id.length <= 24;
}

export function gerarIdComPrefixo(prefix: string,): string {
  return `${prefix}${gerarId()}`;
}

// Injeta dinamicamente o '_id' sem o prefixo ao LER do banco/localStorage
export function formatDbItem(key: IDBValidKey, val: any, prefix = '',): any {
  if (!val || typeof val !== 'object' || Array.isArray(val,)) return val;
  const keyStr = String(key,);
  const _id = prefix && keyStr.startsWith(prefix,) ? keyStr.slice(prefix.length,) : keyStr;
  return { _id, ...val, };
}

// Prepara a chave final e limpa o '_id' do objeto gravado
export function prepareForSave(
  key: string | undefined | null,
  val: any,
  prefix = '',
): { key: string; cleanVal: any } {
  let rawId = val && typeof val === 'object' ? val._id : undefined;

  if (rawId === 'auto') {
    rawId = gerarId();
  }

  // Intercepta a chave informada como "auto" via parâmetro direto ou tupla do setMany
  let processKey = key === 'auto' ? gerarId() : key;

  let finalKey = processKey || '';

  if (rawId) {
    if (prefix && rawId.startsWith(prefix,)) {
      finalKey = rawId;
    } else {
      finalKey = prefix ? `${prefix}${rawId}` : rawId;
    }
  } else if (processKey) {
    if (prefix && processKey.startsWith(prefix,)) {
      finalKey = processKey;
    } else {
      finalKey = prefix ? `${prefix}${processKey}` : processKey;
    }
  }

  if (!finalKey) {
    throw new Error("Uma chave (key) ou um atributo '_id' no objeto deve ser fornecido.",);
  }

  if (val && typeof val === 'object' && !Array.isArray(val,) && '_id' in val) {
    const { _id: _, ...cleanVal } = val;
    return { key: finalKey, cleanVal, };
  }

  return { key: finalKey, cleanVal: val, };
}

```

---

## Arquivo: `packages/worker-db/src/utils/opfs.ts`

```ts
// ## Arquivo: monorepo/worker-db/src/utils/opfs_utils.ts
export interface OpfsResolveOptions {
  dbName?: string;
  storeName?: string;
  prefix?: string;
}

export function resolveOpfsFileName(
  type: 'db' | 'ls',
  fileName: string,
  opts?: OpfsResolveOptions,
): string {
  const parts: string[] = [type,];
  if (type === 'db') {
    if (opts?.dbName) parts.push(opts.dbName,);
    if (opts?.storeName) parts.push(opts.storeName,);
  }
  if (opts?.prefix) parts.push(opts.prefix,);

  parts.push(fileName,);
  return parts.join('_',);
}

async function getBackupDir() {
  const root = await navigator.storage.getDirectory();
  return await root.getDirectoryHandle('backup', { create: true, },);
}

// Navega e cria (se necessário) o caminho completo baseado em strings com '/'
async function resolvePath(filePath: string, create = false,) {
  const backupDir = await getBackupDir();
  const parts = filePath.split('/',);
  const fileName = parts.pop()!;
  let curr = backupDir;
  for (const p of parts) {
    curr = await curr.getDirectoryHandle(p, { create, },);
  }
  return { dir: curr, fileName, };
}

export async function writeJsonToOpfs(filePath: string, data: unknown,): Promise<string> {
  const { dir, fileName, } = await resolvePath(filePath, true,);
  const fileHandle = await dir.getFileHandle(fileName, { create: true, },);
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(data,),);
  await writable.close();
  return filePath;
}

export async function readJsonFromOpfs(filePath: string,): Promise<unknown> {
  const { dir, fileName, } = await resolvePath(filePath, false,);
  const fileHandle = await dir.getFileHandle(fileName,);
  const file = await fileHandle.getFile();
  const text = await file.text();
  return JSON.parse(text,);
}

export async function deleteFromOpfs(filePath: string,): Promise<void> {
  const { dir, fileName, } = await resolvePath(filePath, false,);
  await dir.removeEntry(fileName,);
}

export async function getFileFromOpfs(filePath: string,): Promise<File> {
  const { dir, fileName, } = await resolvePath(filePath, false,);
  const fileHandle = await dir.getFileHandle(fileName,);
  return await fileHandle.getFile();
}

// Lista recursivamente arquivos mantendo o path relativo (ex: "MINHA_KEY/backup.json")
export async function listOpfsFiles(
  dirHandle?: FileSystemDirectoryHandle,
  path = '',
): Promise<string[]> {
  const dir = dirHandle || await getBackupDir();
  let files: string[] = [];
  // @ts-ignore: async iterator support
  for await (const [name, handle,] of dir.entries()) {
    if (handle.kind === 'file') {
      files.push(path ? `${path}/${name}` : name,);
    } else if (handle.kind === 'directory') {
      const subFiles = await listOpfsFiles(handle, path ? `${path}/${name}` : name,);
      files = files.concat(subFiles,);
    }
  }
  return files;
}

export async function downloadOpfsFile(fileName: string,): Promise<void> {
  if (typeof document === 'undefined') {
    throw new Error(
      "downloadOpfsFile só pode ser executado na Main Thread (onde 'document' existe).",
    );
  }
  const file = await getFileFromOpfs(fileName,);
  const url = URL.createObjectURL(file,);
  const a = document.createElement('a',);
  a.href = url;
  a.download = fileName.split('/',).pop()!; // Download sempre usa apenas o nome do arquivo final
  document.body.appendChild(a,);
  a.click();
  document.body.removeChild(a,);
  URL.revokeObjectURL(url,);
}

```

---

## Arquivo: `packages/worker-db/src/worker.ts`

```ts
// ## Arquivo: monorepo/worker-db/src/db.ts
import { internalAPI, } from './db.ts';
import type { DbStoreOptions, OpfsStoreOptions, } from './db.ts';

import { APP_VERSION, } from '@browsertorrent/utils/config';

console.log(`[DB] 🌌 Worker-db carregado (v${APP_VERSION}).`,);

self.onmessage = async (e: MessageEvent,) => {
  const { requestId, command, args, } = e.data;

  try {
    const dbOpts: DbStoreOptions = {
      dbName: args.dbName,
      storeName: args.storeName,
      prefix: args.prefix,
    };

    const opfsOpts: OpfsStoreOptions = {
      ...dbOpts,
      basePath: args.basePath,
    };

    let result;

    switch (command) {
      case 'VERSION':
        result = { version: APP_VERSION, };
        break;
      case 'GET':
        result = await internalAPI.get(args.key, dbOpts,);
        break;
      case 'SET':
        if (args.key !== undefined) {
          result = await internalAPI.set(args.key, args.val, dbOpts,);
        } else {
          result = await internalAPI.set(args.val, dbOpts,);
        }
        break;
      case 'DELETE':
        result = await internalAPI.delete(args.key, dbOpts,);
        break;
      case 'GET_MANY':
        result = await internalAPI.getMany(args.keys, dbOpts,);
        break;
      case 'SET_MANY':
        result = await internalAPI.setMany(args.entries, dbOpts,);
        break;
      case 'DEL_MANY':
        result = await internalAPI.deleteMany(args.keys, dbOpts,);
        break;
      case 'KEYS':
        result = await internalAPI.keys(dbOpts,);
        break;
      case 'VALUES':
        result = await internalAPI.values(dbOpts,);
        break;
      case 'ENTRIES':
        result = await internalAPI.entries(dbOpts,);
        break;
      case 'CLEAR':
        result = await internalAPI.clear(dbOpts,);
        break;
      case 'PATCH': {
        let patchOrFn;
        if (args.fnStr) {
          patchOrFn = new Function('prev', 'ctx', `return (${args.fnStr})(prev, ctx);`,) as unknown;
        } else {
          patchOrFn = args.patch;
        }
        result = await internalAPI.patch(args.key, patchOrFn, args.context, dbOpts,);
        break;
      }
      case 'QUERY': {
        const fn = new Function('items', 'ctx', `return (${args.fnStr})(items, ctx);`,) as (items: { _id: string; }[], ctx?: any) => { _id: string; }[];
        result = await internalAPI.query(fn, args.context, dbOpts,);
        break;
      }
      case 'GET_SOME': {
        const fn = new Function('items', 'ctx', `return (${args.fnStr})(items, ctx);`,) as (items: { _id: string; }[], ctx?: any) => { _id: string; }[];
        result = await internalAPI.getSome(fn, args.context, dbOpts,);
        break;
      }
      case 'DEL_SOME': {
        const fn = new Function('items', 'ctx', `return (${args.fnStr})(items, ctx);`,) as (items: { _id: string; }[], ctx?: any) => { _id: string; }[];
        result = await internalAPI.delSome(fn, args.context, dbOpts,);
        break;
      }
      case 'SET_SOME': {
        const selectFn = new Function(
          'items',
          'ctx',
          `return (${args.selectFnStr})(items, ctx);`,
        ) as (items: { _id: string; }[], ctx?: any) => { _id: string; }[];
        const updateFn = new Function(
          'item',
          'ctx',
          `return (${args.updateFnStr})(item, ctx);`,
        ) as (item: { _id: string; }, ctx?: any) => { _id: string; };
        result = await internalAPI.setSome(selectFn, updateFn, args.context, dbOpts,);
        break;
      }
      case 'EXPORT':
        result = await internalAPI.exportDB(dbOpts,);
        break;
      case 'IMPORT':
        result = await internalAPI.importDB(args.data, args.clearFirst, dbOpts,);
        break;
      case 'BACKUP_OPFS':
        result = await internalAPI.backupToOpfs(args.key, args.fileName, dbOpts,);
        break;
      case 'RESTORE_OPFS':
        result = await internalAPI.restoreFromOpfs(
          args.key,
          args.fileName,
          args.clearFirst,
          dbOpts,
        );
        break;

      // ==== OPFS EXTENSION ====
      case 'OPFS_LIST':
        result = await internalAPI.listFiles(args.key, opfsOpts,);
        break;
      case 'OPFS_GET':
        result = await internalAPI.getFile(args.key, args.fileName, opfsOpts,);
        break;
      case 'OPFS_ADD':
        result = await internalAPI.addFile(args.key, args.file, args.fileName, opfsOpts,);
        break;
      case 'OPFS_DEL':
        result = await internalAPI.delFile(args.key, args.fileName, opfsOpts,);
        break;
      case 'OPFS_REN':
        result = await internalAPI.renFile(args.key, args.oldName, args.newName, opfsOpts,);
        break;
      case 'OPFS_MV':
        result = await internalAPI.mvFile(args.key, args.fileName, args.newKey, opfsOpts,);
        break;
      case 'OPFS_ZIP':
        result = await internalAPI.zip(
          args.key,
          args.zipName,
          args.filesToZip,
          args.deleteOriginals,
          opfsOpts,
        );
        break;
      case 'OPFS_UNZIP':
        result = await internalAPI.unzip(args.key, args.zipName, args.deleteZip, opfsOpts,);
        break;
      case 'OPFS_ADDZIP':
        result = await internalAPI.addZip(
          args.key,
          args.zipName,
          args.file,
          args.fileName,
          opfsOpts,
        );
        break;
      case 'OPFS_DELZIP':
        result = await internalAPI.delZip(args.key, args.zipName, args.fileName, opfsOpts,);
        break;

      default:
        throw new Error(`Comando desconhecido: ${command}`,);
    }

    self.postMessage({ requestId, success: true, result, },);
  } catch (error) {
    self.postMessage({ requestId, success: false, error: (error as Error).message, },);
  }
};

```

---

## Arquivo: `packages/worker-db/tests/db_advanced_test.ts`

```ts
import { db, assert, assertEquals, assertNotEquals, assertRejects, } from '../src/fake/fake-mod.ts';

interface Fatura {
  tag: string;
  amount: number;
  status: string;
  code: string;
}

interface Funcionario {
  _id: string;
  name: string;
  department: string;
  level: number | string;
  active: boolean;
}

Deno.test({
  name: 'DB Advanced - Execução de Métodos de Array no Worker (query, getSome)',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const store = db('FINANCAS', 'faturas', 'FAT_',);
    await store.clear();

    await store.importDB({
      FAT_f1: { tag: 'work', amount: 150, status: 'paid', code: 'x', },
      FAT_f2: { tag: 'personal', amount: 300, status: 'pending', code: 'y', },
      FAT_f3: { tag: 'work', amount: 500, status: 'paid', code: 'z', },
      FAT_f4: { tag: 'home', amount: 80, status: 'pending', code: 'w', },
      FAT_f5: { tag: 'work', amount: 200, status: 'paid', code: 'k', },
    },);

    // Valida execução de funções avançadas dentro do Worker de Banco de Dados
    const result = await store.query((items: Fatura[]) => {
      return {
        count: items.length, // length
        total: items.reduce((acc: number, i: Fatura) => acc + i.amount, 0,), // reduce
        firstWork: items.find((i: Fatura) => i.tag === 'work'), // find
        lastWork: items.findLast((i: Fatura) => i.tag === 'work'), // findLast
        lastItem: items.at(-1,), // at
        hasPending: items.some((i: Fatura) => i.status === 'pending'), // some
        allPositive: items.every((i: Fatura) => i.amount > 0), // every
        tagsHaveHome: items.map((i: Fatura) => i.tag).includes('home',), // map e includes
        idxPersonal: items.findIndex((i: Fatura) => i.tag === 'personal'), // findIndex
        lastIdxWork: items.findLastIndex((i: Fatura) => i.tag === 'work'), // findLastIndex
        indexOfZ: items.map((i: Fatura) => i.code).indexOf('z',), // indexOf
        paidItems: items.filter((i: Fatura) => i.status === 'paid'), // filter
        sliced: items.slice(1, 4,), // slice
        sortedByAmount: items.toSorted((a: Fatura, b: Fatura) => a.amount - b.amount), // toSorted
        reversed: items.toReversed(), // toReversed
        spliced: items.toSpliced(0, 2,), // toSpliced
      };
    },);

    assertEquals(result.count, 5,);
    assertEquals(result.total, 1230,);
    assertEquals((result.firstWork as Fatura).amount, 150,);
    assertEquals((result.lastWork as Fatura).amount, 200,);
    assertEquals((result.lastItem as Fatura).code, 'k',);
    assert(result.hasPending,);
    assert(result.allPositive,);
    assert(result.tagsHaveHome,);
    assertEquals(result.idxPersonal, 1,);
    assertEquals(result.lastIdxWork, 4,);
    assertEquals(result.indexOfZ, 2,);
    assertEquals(result.paidItems.length, 3,);
    assertEquals(result.sliced.length, 3,);
    assertEquals((result.sortedByAmount[0] as Fatura).amount, 80,);
    assertEquals((result.reversed[0] as Fatura).code, 'k',);
    assertEquals(result.spliced.length, 3,);
  },
},);

Deno.test({
  name: 'DB Advanced - Erros em tempo de execução no Worker (Retornos Inválidos)',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const store = db('ERROS_WORKER', 'testes', 'ERR_',);
    await store.clear();
    await store.set('1', { valid: true, },);

    // AssertRejects captura os throw Exceptions disparados lá no switch(command) do worker
    await assertRejects(
      async () => await store.getSome(() => ({ obj: 'invalid', } as any)),
      Error,
      'A função injetada em GET_SOME deve retornar um Array.',
    );

    await assertRejects(
      async () => await store.delSome(() => false as any),
      Error,
      'A função injetada em DEL_SOME deve retornar um Array.',
    );

    await assertRejects(
      async () => await store.setSome(() => 'string' as any, (i: any,) => i,),
      Error,
      'A função de seleção em SET_SOME deve retornar um Array.',
    );
  },
},);

Deno.test({
  name: 'DB Advanced - Transformações de Tipo, UPPERCASE e Exclusão Segura no Worker',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const store = db('EMPRESA', 'funcionarios', 'EMP_',);
    await store.clear();

    await store.importDB({
      EMP_e10: { name: 'joão silva', department: 'tecnologia', level: 2, active: true, },
      EMP_e20: { name: 'maria souza', department: 'rh', level: 3, active: true, },
      EMP_e30: { name: 'pedro alves', department: 'vendas', level: 1, active: false, },
    },);

    // Atualiza nome para UPPERCASE e converte 'level' (number) para string
    await store.setSome(
      (items: Funcionario[]) => items.filter((item: Funcionario) => item.active === true),
      (item: Funcionario) => ({
        ...item,
        name: item.name.toUpperCase(),
        department: item.department.toUpperCase(),
        level: String(item.level,), // Mutação de tipo!
      }),
    );

    const e10 = await store.get<Funcionario>('e10');
    assertEquals(e10?.name, 'JOÃO SILVA',);
    assertEquals(e10?.department, 'TECNOLOGIA',);
    assertEquals(typeof e10?.level, 'string',);
    assertEquals(e10?.level, '2',);

    const e30 = await store.get<Funcionario>('e30');
    assertEquals(e30?.department, 'vendas',); // Permanece em lowercase
    assertEquals(typeof e30?.level, 'number',); // Permanece tipo número

    // Exclui funcionários inativos via delSome
    await store.delSome((items: Funcionario[]) => items.filter((i: Funcionario) => i.active === false));

    // Checa deleção correta
    assertEquals(await store.get('e30',), undefined,);
    const remainingKeys = await store.keys();
    assertEquals(remainingKeys.length, 2,);

    // Assegura integridade dos que ficaram
    const remaining = await store.values<Funcionario>();
    assertNotEquals(remaining[0]?.name, 'pedro alves',);
  },
},);

```

---

## Arquivo: `packages/worker-db/tests/db_opfs_extension_test.ts`

```ts
import { assert, assertEquals, } from '@std/assert';
import { opfs, } from '../src/fake/fake-mod.ts';
import { FakeOPFSDirectory, } from '../src/fake/fake-opfs.ts';

const drive = opfs('P2P_DRIVE', 'files', 'FL_', 'meus_compartilhamentos',);

Deno.test({
  name: 'OPFS Ext - Manipulação Básica de Arquivos e Metadados',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    FakeOPFSDirectory.clear();
    await drive.clear();

    const folderKey = await drive.set('auto', {
      owner: 'Satoshi',
      permissions: 'read-only',
      seeders: 5,
    },);

    const encoder = new TextEncoder();
    const file1 = new Blob([encoder.encode('BrowserTorrent PWA Rocks!',),], { type: 'text/plain', },);
    const file2 = new Blob([encoder.encode('Offline First',),], { type: 'text/plain', },);

    await drive.addFile(folderKey, file1, 'doc1.txt',);
    await drive.addFile(folderKey, file2, 'doc2.txt',);

    let files = await drive.listFiles(folderKey,);
    assertEquals(files.length, 2,);
    assert(files.some((f,) => f.name === 'doc1.txt'),);

    await drive.renFile(folderKey, 'doc1.txt', 'doc_renomeado.txt',);
    await drive.delFile(folderKey, 'doc2.txt',);

    files = await drive.listFiles(folderKey,);
    assertEquals(files.length, 1,);
    assertEquals(files[0]?.name, 'doc_renomeado.txt',);
  },
},);

Deno.test({
  name: 'OPFS Ext - Compressão e Descompressão ZIP (fflate)',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    FakeOPFSDirectory.clear();
    await drive.clear();

    const folderKey = await drive.set('auto', { description: 'Album de Fotos', },);

    const img1 = new Blob([new Uint8Array([255, 0, 150,],),],);
    const img2 = new Blob([new Uint8Array([10, 20, 30,],),],);

    await drive.addFile(folderKey, img1, 'foto1.png',);
    await drive.addFile(folderKey, img2, 'foto2.png',);

    await drive.zip(folderKey, 'album.zip', undefined, true,);

    let files = await drive.listFiles(folderKey,);
    assertEquals(files.length, 1,);
    assertEquals(files[0]?.name, 'album.zip',);

    const img3 = new Blob([new Uint8Array([99, 99,],),],);
    await drive.addZip(folderKey, 'album.zip', img3, 'foto3.png',);

    await drive.delZip(folderKey, 'album.zip', 'foto1.png',);

    await drive.unzip(folderKey, 'album.zip', true,);

    files = await drive.listFiles(folderKey,);
    assertEquals(files.length, 2,);
    assert(files.some((f,) => f.name === 'foto2.png'),);
    assert(files.some((f,) => f.name === 'foto3.png'),);
  },
},);

Deno.test({
  name: 'OPFS Ext - Movendo arquivos entre registros (Pastas)',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    FakeOPFSDirectory.clear();
    await drive.clear();

    const folderA = await drive.set('auto', { type: 'inbox', },);
    const folderB = await drive.set('auto', { type: 'archive', },);

    await drive.addFile(folderA, new Blob(['Move me',],), 'target.txt',);
    await drive.mvFile(folderA, 'target.txt', folderB,);

    const filesA = await drive.listFiles(folderA,);
    const filesB = await drive.listFiles(folderB,);

    assertEquals(filesA.length, 0,);
    assertEquals(filesB.length, 1,);
    assertEquals(filesB[0]?.name, 'target.txt',);
  },
},);

```

---

## Arquivo: `packages/worker-db/tests/db_simple_test.ts`

```ts
import { assert, assertEquals, assertNotEquals, } from '@std/assert';

import { db, } from '../src/fake/fake-mod.ts';

Deno.test({
  name: "DB Simple - Tratamento de _id ('auto', '0990', com prefixo)",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // CORREÇÃO: Utilizando um nome de banco isolado para o teste para evitar choque de instâncias no IndexedDB fake
    const store = db('LOJA_TEST_1', 'clientes', 'CLI_',);
    await store.clear();

    // 1. _id: "auto"
    const keyAuto = await store.set({ _id: 'auto', name: 'Alice', level: 1, },);
    assert(keyAuto.startsWith('CLI_',),);
    const itemAuto = await store.get<any>(keyAuto,);
    assert(itemAuto !== undefined,);
    assertNotEquals(itemAuto?._id, 'auto',);
    assertEquals(itemAuto?.name, 'Alice',);

    // 2. _id: "0990"
    const key0990 = await store.set({ _id: '0990', name: 'Bob', level: 2, },);
    assertEquals(key0990, 'CLI_0990',);
    const item0990 = await store.get<any>('0990',);
    assertEquals(item0990?._id, '0990',);
    assertEquals(item0990?.name, 'Bob',);

    // 3. _id: "CLI_0990" (com prefixo pré-existente)
    const keyPref = await store.set({ _id: 'CLI_0990', name: 'Bob Atualizado', level: 3, },);
    assertEquals(keyPref, 'CLI_0990',);
    const itemPref = await store.get<any>('0990',);
    assertEquals(itemPref?.name, 'Bob Atualizado',);
  },
},);

Deno.test({
  name: 'DB Simple - CRUD, Patch e Métodos de Coleção',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // CORREÇÃO: Isolando o banco para não colidir com o teste anterior
    const store = db('LOJA_TEST_2', 'produtos', 'PROD_',);
    await store.clear();

    await store.set('p1', { name: 'Notebook', price: 3000, },);
    const p1 = await store.get<any>('p1',);
    assertEquals(p1?.name, 'Notebook',);

    const patched = await store.patch<any>('p1', { price: 3200, },);
    assertEquals(patched.price, 3200,);

    await store.setMany([
      ['p2', { name: 'Mouse', price: 80, },],
      ['p3', { name: 'Teclado', price: 200, },],
    ],);

    const items = await store.getMany<any>(['p1', 'p2', 'p3',],);
    assertEquals(items.length, 3,);

    const keys = await store.keys();
    assert(keys.includes('PROD_p1',),);

    await store.delete('p1',);
    assertEquals(await store.get('p1',), undefined,);

    await store.deleteMany(['p2', 'p3',],);
    assertEquals((await store.keys()).length, 0,);
  },
},);

Deno.test({
  name: 'DB Simple - ImportDB e ExportDB com Respeito ao Escopo/Prefixo',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // CORREÇÃO: Isolando o banco de dados
    const store = db('LOJA_TEST_3', 'estoque', 'EST_',);
    await store.clear();

    const mockData = {
      EST_e1: { item: 'Parafuso', qty: 100, },
      EST_e2: { item: 'Porca', qty: 200, },
    };

    await store.importDB(mockData, true,);

    const exported = await store.exportDB();
    assertEquals(exported, mockData,);

    const values = await store.values<any>();
    assertEquals(values.length, 2,);
  },
},);

```

---

## Arquivo: `packages/worker-db/tests/ls_advanced_test.ts`

```ts
import { assert, assertEquals, assertNotEquals, assertThrows, } from '@std/assert';
import { ls, } from '../src/fake/fake-mod.ts';

Deno.test({
  name: 'LS Advanced - Execução de Métodos Modernos de Array JS (query, getSome)',
  fn() {
    const store = ls('LS_FINANCAS_',);
    store.clear();

    store.importLS({
      LS_FINANCAS_f1: { tag: 'work', amount: 150, status: 'paid', code: 'x', },
      LS_FINANCAS_f2: { tag: 'personal', amount: 300, status: 'pending', code: 'y', },
      LS_FINANCAS_f3: { tag: 'work', amount: 500, status: 'paid', code: 'z', },
      LS_FINANCAS_f4: { tag: 'home', amount: 80, status: 'pending', code: 'w', },
      LS_FINANCAS_f5: { tag: 'work', amount: 200, status: 'paid', code: 'k', },
    },);

    // Valida execução de funções avançadas síncronas de Array
    const result = store.query((items: any[],) => {
      return {
        count: items.length, // length
        total: items.reduce((acc: number, i: any,) => acc + i.amount, 0,), // reduce
        firstWork: items.find((i: any,) => i.tag === 'work'), // find
        lastWork: items.findLast((i: any,) => i.tag === 'work'), // findLast
        lastItem: items.at(-1,), // at
        hasPending: items.some((i: any,) => i.status === 'pending'), // some
        allPositive: items.every((i: any,) => i.amount > 0), // every
        tagsHaveHome: items.map((i: any,) => i.tag).includes('home',), // map e includes
        idxPersonal: items.findIndex((i: any,) => i.tag === 'personal'), // findIndex
        lastIdxWork: items.findLastIndex((i: any,) => i.tag === 'work'), // findLastIndex
        indexOfZ: items.map((i: any,) => i.code).indexOf('z',), // indexOf
        paidItems: items.filter((i: any,) => i.status === 'paid'), // filter
        sliced: items.slice(1, 4,), // slice
        sortedByAmount: items.toSorted((a: any, b: any,) => a.amount - b.amount), // toSorted
        reversed: items.toReversed(), // toReversed
        spliced: items.toSpliced(0, 2,), // toSpliced
      };
    },);

    assertEquals(result.count, 5,);
    assertEquals(result.total, 1230,);
    assertEquals((result.firstWork as any).amount, 150,);
    assertEquals((result.lastWork as any).amount, 200,);
    assertEquals((result.lastItem as any).code, 'k',);
    assert(result.hasPending,);
    assert(result.allPositive,);
    assert(result.tagsHaveHome,);
    assertEquals(result.idxPersonal, 1,);
    assertEquals(result.lastIdxWork, 4,);
    assertEquals(result.indexOfZ, 2,);
    assertEquals(result.paidItems.length, 3,);
    assertEquals(result.sliced.length, 3,);
    assertEquals((result.sortedByAmount[0] as any).amount, 80,);
    assertEquals((result.reversed[0] as any).code, 'k',);
    assertEquals(result.spliced.length, 3,);

    store.clear();
  },
},);

Deno.test({
  name: 'LS Advanced - Erros de Tipagem Síncronos (Retornos Inválidos)',
  fn() {
    const store = ls('LS_ERROS_',);
    store.clear();
    store.set('1', { valid: true, },);

    // AssertThrows captura as exceções síncronas disparadas pelo wrapper ls()
    assertThrows(
      () => store.getSome(() => ({ obj: 'invalid', } as any)),
      Error,
      'A função em getSome deve retornar um Array.',
    );

    assertThrows(
      () => store.delSome(() => false as any),
      Error,
      'A função em delSome deve retornar um Array.',
    );

    assertThrows(
      () => store.setSome(() => 'string' as any, (i: any,) => i,),
      Error,
      'A função de seleção em setSome deve retornar um Array.',
    );

    store.clear();
  },
},);

Deno.test({
  name: 'LS Advanced - Transformações de Tipo, Mutação em Massa e Exclusão Segura',
  fn() {
    const store = ls('LS_EMPRESA_',);
    store.clear();

    store.importLS({
      LS_EMPRESA_e10: { name: 'joão silva', department: 'tecnologia', level: 2, active: true, },
      LS_EMPRESA_e20: { name: 'maria souza', department: 'rh', level: 3, active: true, },
      LS_EMPRESA_e30: { name: 'pedro alves', department: 'vendas', level: 1, active: false, },
    },);

    // Atualiza nome para UPPERCASE e converte 'level' (number) para string
    store.setSome(
      (items: any[],) => items.filter((item: any,) => item.active === true),
      (item: any,) => ({
        ...item,
        name: item.name.toUpperCase(),
        department: item.department.toUpperCase(),
        level: String(item.level,), // Mutação de tipo explícita!
      }),
    );

    const e10 = store.get<any>('e10',);
    assertEquals(e10?.name, 'JOÃO SILVA',);
    assertEquals(e10?.department, 'TECNOLOGIA',);
    assertEquals(typeof e10?.level, 'string',);
    assertEquals(e10?.level, '2',);

    const e30 = store.get<any>('e30',);
    assertEquals(e30?.department, 'vendas',); // Permanece em lowercase pois active=false
    assertEquals(typeof e30?.level, 'number',); // Permanece tipo número

    // Exclui funcionários inativos via delSome
    store.delSome((items: any[],) => items.filter((i: any,) => i.active === false));

    // Checa deleção correta
    assertEquals(store.get('e30',), undefined,);
    const remainingKeys = store.keys();
    assertEquals(remainingKeys.length, 2,);

    // Assegura integridade dos que ficaram
    const remaining = store.values<any>();
    assertNotEquals(remaining[0].name, 'pedro alves',);

    store.clear();
  },
},);

```

---

## Arquivo: `packages/worker-db/tests/ls_simple_test.ts`

```ts
import { assert, assertEquals, assertNotEquals, } from '@std/assert';
import { ls, } from '../src/fake/fake-mod.ts';

type DbItem = {
  _id: string;
  name?: string;
  type?: string;
  age?: number;
  v?: number;
};

Deno.test({
  name: "LS Simple - Gestão de _id ('auto', '0990', com prefixo)",
  fn() {
    const store = ls('LS_PRE_',);
    store.clear();

    // 1. Geração automática com _id: "auto"
    const autoKey = store.set({ _id: 'auto', name: 'Item Auto', type: 'system', },);
    assert(
      autoKey.startsWith('LS_PRE_',),
      'A chave gerada automaticamente deve conter o prefixo do banco',
    );

    // O _id retornado no objeto deve ter o prefixo removido pelo formatDbItem
    const fetchedAuto = store.get(autoKey) as DbItem;
    assert(fetchedAuto !== undefined,);
    assertNotEquals(
      fetchedAuto._id,
      'auto',
      "O _id 'auto' deve ter sido substituído por um UUID ou Hash",
    );
    assertEquals(autoKey, `LS_PRE_${fetchedAuto._id}`,);
    assertEquals(fetchedAuto.name, 'Item Auto',);

    // 2. Definindo chave customizada via parâmetro direto
    const customKey = store.set('0990', { name: 'Item Fixo', type: 'user', },);
    assertEquals(customKey, 'LS_PRE_0990',);

    // A busca aceita tanto a chave simples quanto a formatada (resolveKey cuida disso)
    const fetchedCustom = store.get('0990') as DbItem;
    assertEquals(fetchedCustom._id, '0990',);
    assertEquals(fetchedCustom.name, 'Item Fixo',);

    // 3. Salvando passando um objeto que já possui o prefixo no _id
    const keyPref = store.set({ _id: 'LS_PRE_0991', name: 'Item Fixo 2', type: 'user', },);
    assertEquals(keyPref, 'LS_PRE_0991',);
    const fetchedPref = store.get('0991') as DbItem;
    assertEquals(fetchedPref.name, 'Item Fixo 2',);

    store.clear();
  },
},);

Deno.test({
  name: 'LS Simple - CRUD Básico, Patch e Iteradores (keys, values, entries)',
  fn() {
    const store = ls('LS_CRUD_',);
    store.clear();

    // Create / Read
    store.set('user1', { name: 'Carlos', age: 30, },);
    let user = store.get('user1') as DbItem;
    assertEquals(user.name, 'Carlos',);

    // Update Parcial (Patch)
    const patchedUser = store.patch('user1', { age: 31, },);
    assertEquals(patchedUser.age, 31,);

    user = store.get('user1') as DbItem;
    assertEquals(user.age, 31,);

    // Operações em Lote (setMany, getMany)
    store.setMany([
      ['user2', { name: 'Ana', },],
      ['user3', { name: 'Beatriz', },],
    ],);

    const users = store.getMany(['user1', 'user2', 'user3',]) as DbItem[];
    assertEquals(users.length, 3,);
    assertEquals(users[1]?.name, 'Ana',);

    // Testando Iteradores (keys, values, entries)
    const allKeys = store.keys();
    assertEquals(allKeys.length, 3,);
    assert(allKeys.includes('LS_CRUD_user1',),);

    const allValues = store.values() as DbItem[];
    assertEquals(allValues.length, 3,);
    assert(allValues.some((v) => v._id === 'user2' && v.name === 'Ana'),); // Valida se formatDbItem agiu nos values

    const allEntries = store.entries() as [string, DbItem][];
    assertEquals(allEntries.length, 3,);
    const firstEntry = allEntries.find(([k,]) => k === 'LS_CRUD_user3');
    assert(firstEntry !== undefined,);
    assertEquals(firstEntry[1].name, 'Beatriz',);

    // Delete
    store.delete('user1',);
    assertEquals(store.get('user1',), undefined,);
    assertEquals(store.keys().length, 2,);

    store.deleteMany(['user2', 'user3',],);
    assertEquals(store.keys().length, 0,);

    store.clear();
  },
},);

Deno.test({
  name: 'LS Simple - Import e Export com Respeito ao Escopo/Prefixo',
  fn() {
    const store = ls('LS_EXP_',);
    store.clear();

    const mockData = {
      LS_EXP_k1: { v: 1, label: 'A', },
      LS_EXP_k2: { v: 2, label: 'B', },
    };

    store.importLS(mockData, true,);

    const exported = store.exportLS();
    assertEquals(exported, mockData,);

    const values = store.values() as DbItem[];
    assertEquals(values.length, 2,);
    assertEquals(values.find((i) => i._id === 'k1')?.v, 1,);

    store.clear();
  },
},);

```

---

## Arquivo: `packages/worker-db/tests/main.test.ts`

```ts
import { assert, assertEquals, } from '@std/assert';
import { gerarId, validarId, } from '../src/utils/id.ts';
import { db, ls, } from '../src/fake/fake-mod.ts';

Deno.test('MAIN - Validação de Utilitários de ID e Integração Global', () => {
  const id = gerarId();
  assert(id.length > 0,);

  const isValid = validarId(id,);
  assertEquals(isValid, true,);

  const dbInstance = db('MAIN_DB', 'main',);
  assert(dbInstance !== undefined,);

  const lsInstance = ls('MAIN_LS_',);
  assert(lsInstance !== undefined,);
});

```

---

## Arquivo: `packages/worker-db/tests/opfs_and_isolation_test.ts`

```ts
// ## Arquivo: monorepo/worker-db/tests/opfs_and_isolation_test.ts
import { assert, assertEquals, } from '@std/assert';

import { db, ls, } from '../src/fake/fake-mod.ts';
import { FakeOPFSDirectory, } from '../src/fake/fake-opfs.ts';

Deno.test({
  name: 'ISOLATION - LS: Garantir que instâncias com prefixos diferentes não colidam',
  sanitizeOps: false,
  sanitizeResources: false,
  fn() {
    const storeA = ls('APP_A_',);
    const storeB = ls('APP_B_',);

    storeA.clear();
    storeB.clear();

    storeA.set('1', { data: 'from A', },);
    storeB.set('1', { data: 'from B', },);

    assertEquals(storeA.get<any>('1',)?.data, 'from A',);
    assertEquals(storeB.get<any>('1',)?.data, 'from B',);

    storeA.clear();
    assertEquals(storeA.keys().length, 0,);
    assertEquals(storeB.keys().length, 1,);
    assertEquals(storeB.get<any>('1',)?.data, 'from B',);
  },
},);

db.init(new URL('../build/worker-db.js', import.meta.url,),);

Deno.test({
  name:
    'ISOLATION - DB: Garantir que instâncias no mesmo Store, com prefixos diferentes, são isoladas',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const dbApp1 = db('SHARED_DB', 'keyval', 'APP_1_',);
    const dbApp2 = db('SHARED_DB', 'keyval', 'APP_2_',);

    await dbApp1.clear();
    await dbApp2.clear();

    await dbApp1.set('config', { theme: 'dark', },);
    await dbApp2.set('config', { theme: 'light', },);

    const app1Vals = await dbApp1.values<any>();
    assertEquals(app1Vals.length, 1,);
    assertEquals(app1Vals[0].theme, 'dark',);

    const exportApp2 = await dbApp2.exportDB();
    assert(Object.keys(exportApp2,).includes('APP_2_config',),);
    assert(!Object.keys(exportApp2,).includes('APP_1_config',),);

    await dbApp1.clear();
    assertEquals((await dbApp1.keys()).length, 0,);

    const app2Keys = await dbApp2.keys();
    assertEquals(app2Keys.length, 1,);
    assertEquals(app2Keys[0], 'APP_2_config',);
  },
},);

Deno.test({
  name: 'OPFS - Fluxo completo de Backup e Restore (INDEXED-DB) usando record-keys',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    FakeOPFSDirectory.clear();
    const store = db('OPFS_DB', 'test', 'BACKUP_',);
    await store.clear();

    await store.set('k1', { text: 'Hello OPFS DB', },);
    await store.set('k2', { text: 'BrowserTorrent PWA', },);

    const recordKey = 'meus_snapshots_db';
    const fileNamePath = await store.backupToOpfs(recordKey, 'meu_backup_db.json',);

    assert(fileNamePath.includes('BACKUP_',),);
    assert(fileNamePath.includes(recordKey,),);
    assert(fileNamePath.includes('meu_backup_db.json',),);

    await store.clear();
    assertEquals((await store.keys()).length, 0,);

    // Restore indicando a recordKey isolada
    await store.restoreFromOpfs(recordKey, 'meu_backup_db.json',);
    const restored = await store.values<any>();
    assertEquals(restored.length, 2,);

    const k1 = await store.get<any>('k1',);
    assertEquals(k1?.text, 'Hello OPFS DB',);

    FakeOPFSDirectory.clear();
  },
},);

Deno.test({
  name:
    'OPFS - Fluxo completo de Backup e Restore (LOCAL-STORAGE) usando record-keys e proxy opfs()',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    FakeOPFSDirectory.clear();
    const store = ls('LS_BKP_SYS_',);
    store.clear();

    // 1. Popula o LocalStorage de forma síncrona
    store.set('config', { theme: 'dark', notifications: true, },);
    store.set('perfil', { alias: 'Satoshi', status: 'online', },);
    assertEquals(store.keys().length, 2,);

    // 2. Realiza o backup assíncrono delegando para o Worker-DB via opfs()
    const recordKey = 'ls_snapshots';
    const fileNamePath = await store.backupToOpfs(recordKey, 'ls_backup.json',);

    // Verifica se a rota de retorno seguiu a padronização das keys
    assert(fileNamePath.includes(recordKey,),);
    assert(fileNamePath.includes('ls_backup.json',),);

    // 3. Limpa o LocalStorage simulando uma perda de dados local ou troca de dispositivo
    store.clear();
    assertEquals(store.keys().length, 0,);

    // 4. Executa o Restore assíncrono puxando o binário via Worker e regravando no LS
    await store.restoreFromOpfs(recordKey, 'ls_backup.json', true,);

    // 5. Valida a integridade dos dados resgatados
    const restoredKeys = store.keys();
    assertEquals(restoredKeys.length, 2,);

    const config = store.get<any>('config',);
    assertEquals(config?.theme, 'dark',);
    assertEquals(config?.notifications, true,);

    const perfil = store.get<any>('perfil',);
    assertEquals(perfil?.alias, 'Satoshi',);

    FakeOPFSDirectory.clear();
  },
},);

```

---

## Arquivo: `packages/worker-db/tests/worker_lifecycle_test.ts`

```ts
import { assertEquals, } from '@std/assert';
import { db, } from '../src/fake/fake-mod.ts';

const isFake = true;

Deno.test({
  name: 'LIFECYCLE - Inicialização, Terminação, Restart e Persistência do Worker',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const store = db('WORKER_LIFECYCLE_DB', 'state', 'LC_',);
    await store.clear();

    await store.set('status', { alive: true, phase: 'init', },);
    let result = await store.get<any>('status',);
    assertEquals(result?.alive, true,);

    db.terminate();

    await store.set('status', { alive: true, phase: 'healed', },);
    result = await store.get<any>('status',);
    assertEquals(result?.phase, 'healed',);

    // O restart vai recriar o Worker utilizando o último caminho válido
    // (que é o fake-db.ts garantido pelo nosso fake-mod.ts)
    db.restart();

    if (!isFake) {
      // Lógica isolada para cenários não-falsos, caso necessário
    }

    await store.patch<any>('status', { phase: 'restarted', },);
    result = await store.get<any>('status',);
    assertEquals(result?.phase, 'restarted', 'Worker recriado pelo restart() falhou',);

    db.terminate();
  },
},);

Deno.test({
  name: 'LIFECYCLE - Comportamento com requisições disparadas imediatamente após restart',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const store = db('WORKER_LIFECYCLE_DB', 'stress', 'STRESS_',);

    db.restart();

    await store.set('k1', { val: 1, },);
    await store.set('k2', { val: 2, },);

    const keys = await store.keys();
    assertEquals(keys.length, 2,);

    await store.clear();
    db.terminate();
  },
},);

```

---

