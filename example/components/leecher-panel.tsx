/**
 * leecher-panel.tsx — Download via magnet e opção de ajudar compartilhando.
 */
import { useSignal } from "@preact/signals";
import { addTorrent, torrentSignal, modeSignal, peersSignal } from "../torrent-context.tsx";

function formatSpeed(bps: number): string {
  if (bps < 1024) return `${bps} B/s`;
  if (bps < 1024 ** 2) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${(bps / 1024 ** 2).toFixed(1)} MB/s`;
}

interface Props {
  disabled?: boolean;
}

export function LeecherPanel({ disabled }: Props) {
  const magnetInput = useSignal("");
  const loading = useSignal(false);
  const helpingShare = useSignal(false);

  const handleDownload = async () => {
    const id = magnetInput.value.trim();
    if (!id) return;

    loading.value = true;
    try {
      await addTorrent(id);
    } catch {
      // erro no signal
    } finally {
      loading.value = false;
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") handleDownload();
  };

  const torrent = torrentSignal.value;
  const isLeeching = modeSignal.value === "leeching";
  const isSeeding = modeSignal.value === "seeding";
  const hasActiveTorrent = isLeeching || isSeeding;

  return (
    <div class="field">
      {/* Input magnet */}
      {!hasActiveTorrent && (
        <div class="field label border">
          <input
            type="text"
            id="magnet-input"
            placeholder="magnet:?xt=urn:btih:..."
            disabled={disabled}
            value={magnetInput.value}
            onInput={(e) => {
              magnetInput.value = (e.target as HTMLInputElement).value;
            }}
            onKeyDown={handleKeyDown}
          />
          <label for="magnet-input">Magnet / InfoHash</label>
        </div>
      )}

      {/* Status download ativo */}
      {isLeeching && torrent && (
        <div class="blue-text small-text">
          <i class="material-symbols small">download</i>
          {" "}{torrent.name ?? "Baixando..."}
        </div>
      )}

      {/* Botão Download */}
      {!hasActiveTorrent && (
        <button
          class={loading.value ? "loading" : ""}
          disabled={disabled || !magnetInput.value || loading.value}
          onClick={handleDownload}
        >
          <i class="material-symbols">download</i>
          Download
        </button>
      )}

      {/* Info do torrent */}
      {isLeeching && torrent && (
        <div class="field label border">
          <input type="text" value={torrent.infoHash} readonly />
          <label>InfoHash</label>
        </div>
      )}

      {/* Switch ajudar compartilhando */}
      {hasActiveTorrent && (
        <label class="switch">
          <input
            type="checkbox"
            checked={helpingShare.value}
            onChange={() => { helpingShare.value = !helpingShare.value; }}
          />
          <span>Ajudar compartilhando</span>
        </label>
      )}

      {/* Status de peers */}
      {hasActiveTorrent && (
        <div class="chip">
          <i class="material-symbols small">group</i>
          {peersSignal.value.length} peers
        </div>
      )}
    </div>
  );
}
