/**
 * debug-panel.tsx — Painel de debug com logs em tempo real.
 */
import { useSignal } from "@preact/signals";
import { debugSignal } from "../torrent-context.tsx";

export function DebugPanel() {
  const expanded = useSignal(false);
  const logs = debugSignal.value;

  return (
    <article class="border round debug-panel">
      <nav class="middle" onClick={() => { expanded.value = !expanded.value; }}>
        <i class="material-symbols">terminal</i>
        <h5>Debug Log</h5>
        <span class="chip">{logs.length} msgs</span>
        <button
          class="transparent"
          onClick={(e) => {
            e.stopPropagation();
            debugSignal.value = [];
          }}
          title="Limpar logs"
        >
          <i class="material-symbols small">delete</i>
        </button>
        <button class="transparent">
          <i class="material-symbols small">
            {expanded.value ? "expand_less" : "expand_more"}
          </i>
        </button>
      </nav>

      {expanded.value && (
        <div class="debug-log">
          {logs.length === 0 ? (
            <div class="secondary-text small-text">Nenhuma mensagem de debug</div>
          ) : (
            logs.map((log, i) => (
              <div key={i} class="debug-line">
                <code>{log}</code>
              </div>
            ))
          )}
        </div>
      )}
    </article>
  );
}
