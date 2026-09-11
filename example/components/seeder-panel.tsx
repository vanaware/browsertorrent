/**
 * seeder-panel.tsx — Upload de vídeo e seeding P2P.
 */
import { useSignal } from "@preact/signals";
import { seedFile, torrentSignal, modeSignal, PUBLIC_TRACKERS } from "../torrent-context.tsx";
import type { Torrent } from "@loco/webtorrent";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function buildMagnetURI(torrent: Torrent): string {
  const ih = torrent.infoHash;
  const name = encodeURIComponent(torrent.name ?? "download");
  const trackers = torrent.announce?.length
    ? torrent.announce
    : PUBLIC_TRACKERS;
  const trs = trackers.map((t) => `&tr=${encodeURIComponent(t)}`).join("");
  return `magnet:?xt=urn:btih:${ih}&dn=${name}${trs}`;
}

interface Props {
  disabled?: boolean;
}

export function SeederPanel({ disabled }: Props) {
  const selectedFile = useSignal<File | null>(null);
  const loading = useSignal(false);
  const magnetCopied = useSignal(false);

  const handleSeed = async () => {
    const file = selectedFile.value;
    if (!file) return;

    loading.value = true;
    try {
      await seedFile(file);
    } catch {
      // erro no signal
    } finally {
      loading.value = false;
    }
  };

  const handleCopyMagnet = () => {
    const t = torrentSignal.value;
    if (!t) return;
    // Constrói magnet URI manualmente (parsedTorrent.magnetURI é "" para torrents gerados)
    const magnet = buildMagnetURI(t);
    navigator.clipboard.writeText(magnet);
    magnetCopied.value = true;
    setTimeout(() => { magnetCopied.value = false; }, 2000);
  };

  const getMagnetURI = (): string => {
    const t = torrentSignal.value;
    if (!t) return "";
    return buildMagnetURI(t);
  };

  const torrent = torrentSignal.value;
  const isSeeding = modeSignal.value === "seeding";

  return (
    <div class="field">
      {/* Botão selecionar mídia */}
      {!isSeeding && (
        <button
          class={selectedFile.value ? "tertiary" : ""}
          disabled={disabled}
          onClick={() => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "video/*,audio/*";
            input.onchange = () => {
              if (input.files?.[0]) {
                selectedFile.value = input.files[0]!;
              }
            };
            input.click();
          }}
        >
          <i class="material-symbols">{selectedFile.value ? "file_present" : "add"}</i>
          {selectedFile.value ? selectedFile.value.name : "Selecionar mídia"}
        </button>
      )}

      {/* Info do arquivo */}
      {selectedFile.value && !isSeeding && (
        <div class="secondary-text small-text">
          <i class="material-symbols small">file_present</i>
          {" "}{formatSize(selectedFile.value.size)}
        </div>
      )}

      {/* Status seeding */}
      {isSeeding && (
        <div class="green-text small-text">
          <i class="material-symbols small">check_circle</i>
          {" "}{torrent?.name}
        </div>
      )}

      {/* Botão Seed */}
      {!isSeeding && (
        <button
          class={loading.value ? "loading" : ""}
          disabled={disabled || !selectedFile.value || loading.value}
          onClick={handleSeed}
        >
          <i class="material-symbols">upload</i>
          Seed
        </button>
      )}

      {/* Magnet URI */}
      {isSeeding && torrent && (
        <div class="field label suffix border">
          <input
            type="text"
            value={getMagnetURI()}
            id="magnet-output"
            readonly
            onClick={(e) => {
              (e.target as HTMLInputElement).select();
              handleCopyMagnet();
            }}
          />
          <label>Magnet URI</label>
          <button
            class="transparent front"
            onClick={handleCopyMagnet}
            title="Copiar magnet"
          >
            <i class="material-symbols small">{magnetCopied.value ? "check" : "content_copy"}</i>
          </button>
        </div>
      )}

      {/* InfoHash */}
      {isSeeding && torrent && (
        <div class="field label border">
          <input type="text" value={torrent.infoHash} readonly />
          <label>InfoHash</label>
        </div>
      )}
    </div>
  );
}
