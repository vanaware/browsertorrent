/**
 * @file test_trackers.ts
 * @description Utilitário para testar a saúde e resposta de trackers WebTorrent (WebSocket)
 * @stack Deno 2.x, TypeScript, Web Crypto API, jsr:@std/encoding
 * 
 * Fontes pesquisadas:
 * - Documentação oficial webtorrent.io
 * - Repositório ngosang/trackerslist (issue #257)
 * - Projeto bitvid (js/constants.js)
 * - Instâncias PeerTube
 */

import { encodeBase64 } from "jsr:@std/encoding/base64";

/**
 * Lista expandida de trackers WebTorrent candidatos
 */
const TRACKER_CANDIDATES = [
  "wss://tracker.webtorrent.dev:443",
  "wss://tracker.openwebtorrent.com:443",
  "wss://open.ftorrent.com:443",
  "wss://video.blender.org/tracker/socket",
];

/**
 * Gera uma string Base64 de 20 bytes aleatórios, simulando info_hash ou peer_id.
 * Usa a Web Crypto API nativa do Deno.
 */
function generateRandom20BytesBase64(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return encodeBase64(bytes);
}

/**
 * Testa um único tracker WebTorrent enviando um payload de announce válido.
 * @param url A URL do tracker (ws:// ou wss://)
 * @param timeoutMs Tempo máximo de espera em milissegundos (padrão: 3000ms)
 * @returns Promise<{success: boolean, timeMs: number, error?: string}>
 */
async function testTracker(
  url: string,
  timeoutMs = 3000
): Promise<{ success: boolean; timeMs: number; error?: string }> {
  const startTime = performance.now();
  
  return new Promise((resolve) => {
    let resolved = false;
    let ws: WebSocket | null = null;

    const cleanup = (success: boolean, error?: string) => {
      if (!resolved) {
        resolved = true;
        const timeMs = Math.round(performance.now() - startTime);
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.close(1000, success ? "Resposta recebida" : "Teste concluído");
        }
        resolve({ success, timeMs, error });
      }
    };

    try {
      ws = new WebSocket(url);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Erro desconhecido";
      cleanup(false, `Falha ao instanciar WebSocket: ${errorMsg}`);
      return;
    }

    ws.onopen = () => {
      try {
        // Payload mínimo válido conforme especificação do bittorrent-tracker
        const payload = {
          action: "announce",
          info_hash: generateRandom20BytesBase64(),
          peer_id: generateRandom20BytesBase64(),
          numwant: 1,
          port: 6881,
          left: 0,
          event: "started",
        };
        ws!.send(JSON.stringify(payload));
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Erro desconhecido";
        cleanup(false, `Erro ao enviar payload: ${errorMsg}`);
      }
    };

    ws.onmessage = (event) => {
      if (!resolved) {
        // Verifica se a resposta contém estrutura válida
        try {
          const response = JSON.parse(event.data);
          if (response && typeof response === "object") {
            cleanup(true);
          } else {
            cleanup(false, "Resposta inválida");
          }
        } catch {
          // Mesmo que não seja JSON válido, se recebemos algo, é positivo
          cleanup(true);
        }
      }
    };

    ws.onerror = (event) => {
      const errorMsg = event instanceof ErrorEvent ? event.message : "Erro desconhecido";
      cleanup(false, `WebSocket error: ${errorMsg}`);
    };

    ws.onclose = (event) => {
      if (!resolved) {
        cleanup(false, `Conexão fechada: ${event.reason || "Sem razão"}`);
      }
    };

    // Mecanismo de timeout para evitar conexões "penduradas"
    setTimeout(() => {
      if (!resolved) {
        cleanup(false, "Timeout atingido");
      }
    }, timeoutMs);
  });
}

/**
 * Executa o teste em massa e exibe um relatório formatado no console.
 */
async function runTrackerDiagnostics() {
  console.log("🚀 Iniciando diagnóstico de Trackers WebTorrent...\n");
  console.log(`| ${"Tracker".padEnd(50)} | ${"Status".padEnd(10)} | ${"Tempo".padEnd(8)} | ${"Detalhes"}`);
  console.log(`|${"-".repeat(52)}|${"-".repeat(12)}|${"-".repeat(10)}|${"-".repeat(20)}|`);

  const results: { url: string; success: boolean; timeMs: number; error?: string }[] = [];

  for (const url of TRACKER_CANDIDATES) {
    const result = await testTracker(url, 3000);
    results.push({ url, ...result });

    const statusIcon = result.success ? "✅ ATIVO" : "❌ FALHOU";
    const statusPadded = statusIcon.padEnd(10);
    const urlPadded = url.padEnd(50);
    const timePadded = `${result.timeMs}ms`.padEnd(8);
    const details = result.error || "OK";

    console.log(`| ${urlPadded} | ${statusPadded} | ${timePadded} | ${details}`);
  }

  console.log(`\n📊 Resumo: ${results.filter((r) => r.success).length} de ${results.length} trackers estão operacionais.`);
  
  // Sugestão de ação: Filtrar apenas os vivos para uso em produção
  const healthyTrackers = results.filter((r) => r.success).map((r) => r.url);
  if (healthyTrackers.length > 0) {
    console.log("\n💡 Lista saudável recomendada para o array PUBLIC_TRACKERS:");
    console.log(JSON.stringify(healthyTrackers, null, 2));
  } else {
    console.warn("\n⚠️ Nenhum tracker respondeu. Verifique sua conexão de rede ou firewall.");
  }

  // Estatísticas adicionais
  const avgTime = results
    .filter((r) => r.success)
    .reduce((sum, r) => sum + r.timeMs, 0) / (healthyTrackers.length || 1);
  
  console.log(`\n⏱️  Tempo médio de resposta: ${Math.round(avgTime)}ms`);
  
  // Classificação por velocidade
  const sorted = results
    .filter((r) => r.success)
    .sort((a, b) => a.timeMs - b.timeMs);
  
  if (sorted.length > 0) {
    console.log("\n🏆 Trackers mais rápidos:");
    sorted.slice(0, 5).forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.url} (${r.timeMs}ms)`);
    });
  }
}

// Executa se for o módulo principal
if (import.meta.main) {
  runTrackerDiagnostics();
}

export { TRACKER_CANDIDATES, testTracker, runTrackerDiagnostics };