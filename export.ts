/// <reference lib="deno.ns" />

/**
 * @file export.ts
 * @description Script de consolidação de contexto para IAs com suporte a parâmetros via CLI.
 * Contém as configurações específicas do projeto BrowserTorrent e a lógica de execução.
 * A lógica pura reutilizável está em @browsertorrent/utils/export.
 *
 * Comportamento:
 * - Sem args: executa todos os modos com `default !== false`
 * - Com args: executa apenas os modos solicitados
 * - Suporta múltiplos modos em uma única execução
 */

import { walk, } from '@std/fs/walk';
import { relative, } from '@std/path/relative';
import {
  deveIncluirArquivo,
  formatarArquivoMarkdown,
  gerarCabecalho,
} from '@browsertorrent/utils/export';
import type { ExportConfig, } from '@browsertorrent/utils/interfaces';
import { APP_VERSION, EXTENSOES_PADRAO, } from '@browsertorrent/utils/config';

// ============================================================================
// 📦 TIPOS ESPECÍFICOS DO PROJETO
// ============================================================================

/**
 * Modos de exportação disponíveis no BrowserTorrent.
 * Específicos para este projeto.
 */
export type ModoExportacao =
  | 'parser'
  | 'ui'
  | 'docs'
  | 'decisoes'
  | 'fases'
  | 'engine'
  | 'learning'
  | 'source'
  | 'server'
  | 'workerdb'
  | 'utils'
  | 'sw';

// ============================================================================
// 📋 CONFIGURAÇÕES ESPECÍFICAS DO BROWSERTORRENT
// ============================================================================

/**
 * Dicionário de configurações para cada modo de exportação do BrowserTorrent.
 * Declarativo, extensível e específico deste projeto.
 */
export const CONFIGURACOES: Record<ModoExportacao, ExportConfig> = {
  ui: {
    arquivoSaida: 'snapshots/ui.md',
    extensoesPermitidas: EXTENSOES_PADRAO,
    pastaBase: './packages/ui/',
    subpastasPermitidas: ['src', 'public', 'tests', 'docs',],
    arquivosRaizPermitidos: ['build.ts', 'deno.json', 'deno.jsonc', 'readme.md',],
    incluiVersao: true,
    instrucaoCustomizada:
      'O texto abaixo contém os arquivos de CÓDIGO FONTE principais da aplicação (UI).',
    default: true, // ✅ Roda por padrão
  },
  docs: {
    arquivoSaida: 'snapshots/docs.md',
    extensoesPermitidas: ['.md', '.txt',],
    pastaBase: './',
    subpastasPermitidas: ['docs', 'docs/browsertorrent',],
    arquivosRaizPermitidos: [
      'readme.md',
      'readme',
      'license',
      'license.md',
      'license.txt',
      '.tool-versions',
    ],
    incluiVersao: false,
    instrucaoCustomizada:
      'O texto abaixo contém a DOCUMENTAÇÃO e diretrizes arquiteturais do projeto.',
    default: false, // ✅ Roda por padrão
  },
  decisoes: {
    arquivoSaida: 'snapshots/decisoes.md',
    extensoesPermitidas: ['.md', '.txt',],
    pastaBase: './docs/browsertorrent',
    subpastasPermitidas: ['decisoes',],
    arquivosRaizPermitidos: [
      '03-arquitetura.md',
      '01-visao.md',
      '09-regras-para-ia.md',
    ],
    incluiVersao: false,
    instrucaoCustomizada:
      'O texto abaixo contém a DOCUMENTAÇÃO de Decisões arquitetônicas fundamentais como ADRs (Architecture Decision Record).',
    default: false, // ✅ Roda por padrão
  },
  fases: {
    arquivoSaida: 'snapshots/fases.md',
    extensoesPermitidas: ['.md', '.txt',],
    pastaBase: './docs/browsertorrent',
    subpastasPermitidas: ['fases',],
    arquivosRaizPermitidos: [
      '06-testes-e-processo.md',
      '07-roadmap.md',
    ],
    incluiVersao: false,
    instrucaoCustomizada:
      'O texto abaixo contém o planejamento do projeto dividido em fases e com TODO list planejado.',
    default: false, // ✅ Roda por padrão
  },
  engine: {
    arquivoSaida: 'snapshots/engine.md',
    extensoesPermitidas: ['.md', '.txt',],
    pastaBase: './docs',
    subpastasPermitidas: ['tj3-engine',],
    arquivosRaizPermitidos: [],
    incluiVersao: false,
    instrucaoCustomizada:
      'O texto abaixo contém um blueprint investigativo de como funciona o motor do projeto taskjuggler, analisando seu código fonte.',
    default: false, // ✅ Roda por padrão
  },
  source: {
    arquivoSaida: 'snapshots/source.md',
    extensoesPermitidas: ['.rb',],
    pastaBase: './docs/taskjuggler',
    subpastasPermitidas: ['lib/taskjuggler',],
    arquivosRaizPermitidos: [],
    incluiVersao: false,
    instrucaoCustomizada:
      'O texto abaixo contém um snapshot do código fonte do projeto taskjuggler, em ruby.',
    default: false, // ✅ Roda por padrão
  },
  learning: {
    arquivoSaida: 'snapshots/learning.md',
    extensoesPermitidas: ['.tjp', '.md',],
    pastaBase: './docs',
    subpastasPermitidas: ['Learning',],
    arquivosRaizPermitidos: ['README.md',],
    incluiVersao: false,
    instrucaoCustomizada:
      'O texto abaixo contém um snapshot de arquivos de projetos do taskjuggler, para treinamento.',
    default: false, // ✅ Roda por padrão
  },
  server: {
    arquivoSaida: 'snapshots/server.md',
    extensoesPermitidas: EXTENSOES_PADRAO,
    pastaBase: 'packages/server',
    subpastasPermitidas: ['src', 'tests', 'docs',],
    caminhosAdicionaisPermitidos: ['.github/workflows',],
    arquivosRaizPermitidos: [
      'build.ts',
      'deno.json',
      'deno.jsonc',
      'readme.md',
      'minify-keys.ts',
      'wrangler-worker.toml',
      'wrangler-pages.toml',
      'deploy.sh',
    ],
    incluiVersao: false,
    instrucaoCustomizada:
      'O texto abaixo contém os arquivos de configuração e execução do SERVIDOR @browsertorrent/server e CI/CD.',
    default: true, // ✅ Roda por padrão
  },
  workerdb: {
    arquivoSaida: 'snapshots/worker-db.md',
    extensoesPermitidas: EXTENSOES_PADRAO,
    pastaBase: 'packages/worker-db',
    subpastasPermitidas: ['src', 'tests', 'docs', 'example',],
    arquivosRaizPermitidos: ['build.ts', 'deno.json', 'deno.jsonc', 'readme.md',],
    incluiVersao: false,
    instrucaoCustomizada:
      'O texto abaixo contém experimentos e código da área de @browsertorrent/workerdb',
    default: true, // ✅ Roda por padrão
  },
  utils: {
    arquivoSaida: 'snapshots/utils.md',
    extensoesPermitidas: EXTENSOES_PADRAO,
    pastaBase: 'packages/utils',
    subpastasPermitidas: ['src', 'tests', 'docs',],
    caminhosAdicionaisPermitidos: ['export.ts', 'esbuild.ts', 'build.ts',],
    arquivosRaizPermitidos: ['deno.json', 'deno.jsonc', 'readme.md',],
    incluiVersao: false,
    instrucaoCustomizada:
      'O texto abaixo contém experimentos e código da área de @browsertorrent/utils',
    default: true, // ✅ Roda por padrão
  },
  parser: {
    arquivoSaida: 'snapshots/parser.md',
    extensoesPermitidas: EXTENSOES_PADRAO,
    pastaBase: 'packages/parser',
    subpastasPermitidas: ['src', 'tests', 'docs',],
    caminhosAdicionaisPermitidos: ['export.ts', 'esbuild.ts', 'build.ts',],
    arquivosRaizPermitidos: ['deno.json', 'deno.jsonc', 'readme.md',],
    incluiVersao: false,
    instrucaoCustomizada:
      'O texto abaixo contém experimentos e código da área de @browsertorrent/parser',
    default: true, // ✅ Roda por padrão
  },
  sw: {
    arquivoSaida: 'snapshots/sw.md',
    extensoesPermitidas: EXTENSOES_PADRAO,
    pastaBase: 'packages/service-worker',
    subpastasPermitidas: ['src', 'tests', 'docs',],
    arquivosRaizPermitidos: ['deno.json', 'deno.jsonc', 'readme.md',],
    incluiVersao: true,
    instrucaoCustomizada:
      'O texto abaixo contém experimentos e código da área de @browsertorrent/service-worker',
    default: true, // ❌ Só roda quando solicitado explicitamente
  },
};

// ============================================================================
// 🎯 PARSING DE ARGUMENTOS CLI
// ============================================================================

/**
 * Parseia os argumentos da CLI e determina quais modos devem ser executados.
 *
 * Regras:
 * - Sem args: executa todos os modos com `default !== false`
 * - Com args: executa apenas os modos solicitados (na ordem do CONFIG)
 * - Args desconhecidos são ignorados
 *
 * @param args - Argumentos da CLI
 * @returns Array de modos a serem executados (na ordem do CONFIG)
 */
function parseArgs(args: string[],): ModoExportacao[] {
  const configKeys = Object.keys(CONFIGURACOES,) as ModoExportacao[];

  // Normaliza args para lowercase
  const lowerArgs = args.map((a,) => a.toLowerCase());

  // Filtra args válidos (que existem no CONFIG)
  const requestedModos = lowerArgs.filter(
    (arg,) => configKeys.includes(arg as ModoExportacao,),
  ) as ModoExportacao[];

  // Se nenhum modo foi solicitado, usa os defaults
  if (requestedModos.length === 0) {
    return configKeys.filter((modo,) => {
      const config = CONFIGURACOES[modo];
      return config.default !== false;
    },);
  }

  // Retorna na ordem do CONFIG (não na ordem da CLI)
  return configKeys.filter((modo,) => requestedModos.includes(modo,));
}

// ============================================================================
// 🚀 EXECUÇÃO DE UM MODO ESPECÍFICO
// ============================================================================

async function exportarModo(modo: ModoExportacao,): Promise<void> {
  const config = CONFIGURACOES[modo];
  const versaoDisplay = config.incluiVersao ? `[v${APP_VERSION}] ` : '';

  console.log(`\n${'='.repeat(60,)}`,);
  console.log(`📦 EXPORTANDO MODO: ${modo.toUpperCase()} ${versaoDisplay}`,);
  console.log(`${'='.repeat(60,)}`,);
  console.log(`📄 Arquivo de saída: ${config.arquivoSaida}`,);
  console.log(`📁 Pasta base: ${config.pastaBase}`,);

  // Gera o cabeçalho do snapshot
  let conteudoFinal = gerarCabecalho(config, modo, APP_VERSION,);

  let arquivosIncluidos = 0;

  // Varre o diretório atual e filtra os arquivos
  for await (const entry of walk('.', { includeDirs: false, },)) {
    const caminhoRelativo = relative('.', entry.path,);

    if (deveIncluirArquivo(caminhoRelativo, config,)) {
      try {
        console.log(`   ✅ Incluindo: ${caminhoRelativo}`,);
        const conteudoArquivo = await Deno.readTextFile(entry.path,);
        conteudoFinal += formatarArquivoMarkdown(caminhoRelativo, conteudoArquivo,);
        arquivosIncluidos++;
      } catch (erro) {
        if (erro instanceof Error) {
          console.error(`   ❌ Erro ao ler ${caminhoRelativo}:`, erro.message,);
        }
      }
    }
  }

  // Escreve o arquivo final
  await Deno.writeTextFile(config.arquivoSaida, conteudoFinal,);
  console.log(
    `\n✨ Modo ${modo.toUpperCase()} concluído: ${arquivosIncluidos} arquivos exportados para ${config.arquivoSaida}`,
  );
}

// ============================================================================
// 🚀 EXECUÇÃO PRINCIPAL
// ============================================================================

if (import.meta.main) {
  const startTime = performance.now();

  // Parseia args e determina quais modos executar
  const modosParaExecutar = parseArgs(Deno.args,);

  console.log('\n🚀 Iniciando Exportação de Contexto BrowserTorrent',);
  console.log(`📋 Modos a exportar: ${modosParaExecutar.join(', ',)}`,);
  console.log(`📌 Versão: v${APP_VERSION}\n`,);

  if (modosParaExecutar.length === 0) {
    console.log(
      "⚠️ Nenhum modo para executar. Verifique as configurações de 'default' no CONFIG.",
    );
    Deno.exit(0,);
  }

  // Executa cada modo sequencialmente
  for (const modo of modosParaExecutar) {
    try {
      await exportarModo(modo,);
    } catch (error) {
      console.error(`\n🛑 Erro ao exportar modo ${modo}:`, error,);
      Deno.exit(1,);
    }
  }

  const elapsed = (performance.now() - startTime).toFixed(0,);
  console.log(`\n${'='.repeat(60,)}`,);
  console.log(`🎉 EXPORTAÇÃO CONCLUÍDA COM SUCESSO!`,);
  console.log(`⏱️ Tempo total: ${elapsed}ms`,);
  console.log(`${'='.repeat(60,)}\n`,);
}
