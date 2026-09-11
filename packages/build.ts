/// <reference lib="deno.ns" />
/**
 * @file build.ts
 * @description Build alternativo usando Deno.bundle API nativa (--unstable-bundle)
 */
import {
  currentVersion,
  incrementVersion,
  listAssetsForCache,
  parseArgs,
  processBundleTarget,
} from '@browsertorrent/utils/build';
import type { DenoBundleGlobalConfig, } from '@browsertorrent/utils/interfaces';

// ============================================================================
// 📦 CONFIGURAÇÃO DECLARATIVA DE BUILDS
// ============================================================================
const CONFIG: DenoBundleGlobalConfig = {
  ui: {
    mode: 'build',
    default: true,
    srcdir: 'packages/ui/src',
    distdir: 'packages/server/build/dist',
    publicdir: 'packages/ui/public',
    indexHtml: true,
    clean: ['.',],
    entryPoints: ['app.tsx',],
    platform: 'browser',
    format: 'esm',
    minify: false,
    sourcemap: 'linked',
    keepNames: true,
    codeSplitting: false,
    packages: 'bundle',
    inlineImports: true,
  },
  workerdb: {
    mode: 'build',
    default: true,
    srcdir: 'packages/worker-db/src',
    distdir: 'packages/server/build/dist',
    clean: ['worker-db.js', 'worker-db.js.map',],
    entryPoints: ['worker.ts',],
    outfile: 'worker-db.js',
    platform: 'browser',
    format: 'esm',
    minify: false,
    sourcemap: 'linked',
    indexHtml: false,
    keepNames: true,
    codeSplitting: false,
    packages: 'bundle',
    inlineImports: true,
  },
  sw: {
    mode: 'build',
    default: true,
    srcdir: 'packages/service-worker/src',
    distdir: 'packages/server/build/dist',
    clean: ['service-worker.js', 'service-worker.js.map',],
    entryPoints: ['service-worker.ts',],
    platform: 'browser',
    format: 'esm',
    minify: false,
    sourcemap: 'linked',
    indexHtml: false,
    keepNames: true,
    codeSplitting: false,
    packages: 'bundle',
    inlineImports: true,
  },
};

// ============================================================================
// 🚀 PIPELINE PRINCIPAL
// ============================================================================
const DENO_JSONC_PATH = 'deno.jsonc';

async function build() {
  const start = performance.now();
  const { targets, globalNoVersion, watchTarget, } = parseArgs(
    Deno.args,
    CONFIG,
  );

  console.log('\n🚀 Iniciando Orquestrador de Build BrowserTorrent (Deno.bundle API)',);
  console.log(`   📦 Motor: Deno.bundle (nativo, --unstable-bundle)`,);

  if (watchTarget) {
    console.log(
      `\n⚠️ AVISO: Modo Watch não suportado pelo Deno.bundle API.`,
    );
    console.log(`   O alvo '${watchTarget}' foi ignorado.`,);
    console.log(
      `   Para watch mode, use o build oficial: deno task build watch`,
    );
    console.log(
      `   (que utiliza esbuild com suporte a esbuild.context().watch())\n`,
    );
    Deno.exit(0,);
  }

  console.log(`   📋 Alvos: ${targets.join(', ',) || '(nenhum)'}`,);
  console.log(`   🔒 Noversion: ${globalNoVersion}\n`,);

  if (targets.length === 0) {
    console.log('⚠️ Nenhum alvo para processar.',);
    Deno.exit(0,);
  }

  try {
    const currentVer = await currentVersion(DENO_JSONC_PATH,);

    const finalVersion = globalNoVersion
      ? currentVer
      : await incrementVersion(currentVer, DENO_JSONC_PATH,);

    for (const targetName of targets) {
      const targetConfig = CONFIG[targetName];
      if (!targetConfig) {
        console.warn(
          `⚠️ Alvo '${targetName}' não encontrado no CONFIG. Pulando.`,
        );
        continue;
      }

      const listFn = targetName === 'sw' ? listAssetsForCache : undefined;
      await processBundleTarget(targetName, targetConfig, finalVersion, listFn,);
    }

    console.log(`\n${'='.repeat(60,)}`,);
    console.log(`🎉 ORQUESTRAÇÃO CONCLUÍDA COM SUCESSO!`,);
    console.log(`${'='.repeat(60,)}`,);
  } catch (error) {
    console.error('\n🛑 Pipeline de build falhou:', error,);
    Deno.exit(1,);
  } finally {
    const elapsed = (performance.now() - start).toFixed(0,);
    console.log(`\n⏱️ Tempo total: ${elapsed}ms\n`,);
  }
}

if (import.meta.main) {
  await build();
}
