# Fase 5.3: OPFS-backed Torrent Generator

## 🎯 Objetivo da Fase
A Fase 5.3 substitui o gerador de `.torrent` baseado em `Deno.open`/`Deno.stat` do
`deno-torrent/torrent-generator` por uma versão browser-native que opera inteiramente
sobre **OPFS** (`Origin Private File System`).  Isso permite criar torrents diretamente
no browser, sem nenhuma syscall de filesystem.

---

## 📁 Arquivos Criados

| Arquivo | Descrição |
|---|---|
| `src/torrent-generator/types.ts` | Tipos: `Writer`, `PieceSizeEnum`, `OPFSFileEntry`, `GeneratorOptions`, `PieceFile`, `Torrent` |
| `src/torrent-generator/opfs-walker.ts` | `walkOPFSDir()` — varredura recursiva de `FileSystemDirectoryHandle` |
| `src/torrent-generator/opfs-reader.ts` | `OPFSMultiFileReader` — leitura sequencial cross-file via `File.slice()` |
| `src/torrent-generator/util.ts` | Funções puras: `calcPieceSize`, `buildPieceFiles`, `sha1sum`, `fileSizeSum`, `isHiddenFile`, `getDefaultCreatedBy` |
| `src/torrent-generator/generator.ts` | `generateTorrent()` — orquestrador completo |
| `src/torrent-generator/mod.ts` | Barrel file com todas as exportações públicas |
| `tests/torrent-generator_test.ts` | **37 testes** cobrindo todas as funções |

---

## 🔧 Substituição de Primitivos Deno → Browser

A tabela abaixo mostra os 4 primitivos Deno que foram substituídos:

| Deno (original) | Browser (implementação) | Local |
|---|---|---|
| `Deno.stat(path).size` | `FileSystemFileHandle.getFile().size` | `opfs-walker.ts` |
| `Deno.open(path)` → `FsFile.read()` | `FileSystemFileHandle.getFile().slice(start, end).arrayBuffer()` | `opfs-reader.ts` |
| `@std/fs/walk()` | `FileSystemDirectoryHandle.values()` (BFS) | `opfs-walker.ts` |
| `git describe --tags` | hardcoded `"loco-torrent-generator@1.0.0"` | `util.ts` |

---

## 📦 API Pública

### `generateTorrent(options: GeneratorOptions): Promise<void>`

Gera um `.torrent` e escreve os bytes bencoded em `options.writer`.

**Parâmetros de `GeneratorOptions`:**

```ts
interface GeneratorOptions {
  writer: Writer;                         // sink para os bytes bencoded
  entry: FileSystemDirectoryHandle | OPFSFileEntry[];  // fonte dos arquivos
  pieceSize?: PieceSizeEnum | number;    // SIZE_AUTO (default) ou preset
  ignoreHiddenFile?: boolean;            // pula arquivos que começam com "."
  alignPiece?: boolean;                  // BEP-47: padding entre arquivos
  isPrivate?: boolean;                   // info.private = 1
  trackers?: readonly string[];           // BEP-12
  webSeeds?: readonly string[];          // BEP-19
  source?: string;
  comment?: string;
  createdBy?: string;
  createdAt?: number;
}
```

**Exemplo de uso:**

```ts
import { generateTorrent } from "@loco/webtorrent/torrent-generator";

// Obter handle do diretório OPFS
const rootHandle = await navigator.storage.getDirectory();

// Popular o diretório com arquivos...
// await rootHandle.getFileHandle("video.mp4", { create: true })...

const chunks: Uint8Array[] = [];
await generateTorrent({
  entry: rootHandle,
  writer: {
    async write(p: Uint8Array) {
      chunks.push(p);
      return p.byteLength;
    },
  },
  trackers: ["udp://tracker.example.com:6969/announce"],
  webSeeds: ["https://seed.example.com/"],
  isPrivate: false,
  pieceSize: 512 * 1024, // SIZE_512KB
});

// Flatten chunks → Uint8Array → salvar como .torrent
const torrentBytes = new Uint8Array(chunks.reduce((a, b) => a + b.byteLength, 0));
```

---

## 🔢 `PieceSizeEnum` (presets BEP-3)

```ts
enum PieceSizeEnum {
  SIZE_AUTO = 0,   // heuristic: menor preset > tamanho total
  SIZE_16KB = 16 * 1024,
  SIZE_32KB = 32 * 1024,
  SIZE_64KB = 64 * 1024,
  SIZE_128KB = 128 * 1024,
  SIZE_256KB = 256 * 1024,
  SIZE_512KB = 512 * 1024,  // recomendado para arquivos grandes
  SIZE_1MB = 1024 * 1024,
  SIZE_2MB,
  SIZE_4MB,
  SIZE_8MB,
  SIZE_16MB,
}
```

---

## 🧩 Funções Exportadas

| Função | Pureza | Descrição |
|---|---|---|
| `generateTorrent(opts)` | ❌ | Orquestrador principal |
| `walkOPFSDir(root, ignoreHidden?)` | ❌ | Varredura recursiva de OPFS → `OPFSFileEntry[]` |
| `getOPFSFileSize(handle)` | ❌ | `FileSystemFileHandle.getFile().size` |
| `OPFSMultiFileReader(entries)` | ❌ | Leitura cross-file sequencial |
| `calcPieceSize(fileSize, pieceSizeEnum)` | ✅ | Seleciona preset de piece size |
| `fileSizeSum(entries)` | ✅ | Soma tamanhos de arquivos |
| `buildPieceFiles(entries, pieceSize)` | ✅ | Constrói stream BEP-47 (com padding) |
| `sha1sum(entries, pieceSize, alignPiece?)` | ❌ | SHA-1 streaming das peças |
| `isHiddenFile(name)` | ✅ | Detecta arquivos ocultos |
| `getDefaultCreatedBy()` | ✅ | `"loco-torrent-generator@1.0.0"` |
| `PieceSizeEnum` | ✅ | Enum de presets |

---

## ✅ Suporte a BEPs

| BEP | Suporte | Detalhes |
|---|---|---|
| **BEP-3** | ✅ | Ordenação por profundidade + lexicográfica |
| **BEP-12** | ✅ | `announce-list` com trackers ordenados |
| **BEP-19** | ✅ | `url-list` com web seeds ordenados |
| **BEP-47** | ✅ | `alignPiece: true` insere `.pad/<size>-<index>` |

---

## 🧪 Testes (37 novos, todos passando)

| Categoria | Testes | Status |
|---|---|---|
| `PieceSizeEnum` | 1 | ✅ |
| `calcPieceSize` | 3 | ✅ |
| `fileSizeSum` | 2 | ✅ |
| `isHiddenFile` | 2 | ✅ |
| `buildPieceFiles` | 4 | ✅ |
| `getDefaultCreatedBy` | 1 | ✅ |
| `OPFSMultiFileReader` | 5 | ✅ |
| `sha1sum` | 4 | ✅ |
| `walkOPFSDir` | 4 | ✅ |
| `getOPFSFileSize` | 1 | ✅ |
| `generateTorrent` (bencode) | 10 | ✅ |

**Total geral do pacote: 568 testes passando, 0 falhas.**

---

## 📝 Decisões de Implementação

1. **Mock de OPFS nos testes**: como OPFS não está disponível em Deno, todos os testes
   usam `buildMockDir()` — um builder recursivo de `FileSystemDirectoryHandle` mockados
   que simula `values()`, `getFileHandle()`, e navegação em sub-diretórios.

2. **Versão gerada**: `loco-torrent-generator@1.0.0` é hardcoded porque `git describe`
   não está disponível no browser.  Callers podem sobrescrever via `createdBy`.

3. **SHA-1 via `crypto.subtle`**: usa a API Web Crypto em vez de libs externas,
   compatível com browsers modernos (Chrome 37+, Firefox 34+, Safari 11+).

4. **Single-file vs multi-file**: detectada automaticamente quando `entry` é um array
   de `OPFSFileEntry` com zero barras no nome (single) vs múltiplos arquivos/pastas.

5. **`inferRootName`**: quando `entry` é um array pré-populado (sem handle de
   diretório), o nome raiz é inferido do prefixo comum dos paths dos arquivos.
