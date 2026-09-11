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
