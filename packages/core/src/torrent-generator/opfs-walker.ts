// /loco/monorepo/webtorrent/src/torrent-generator/opfs-walker.ts
/**
 * Recursively walks an OPFS directory handle, returning an ordered list
 * of files with their relative paths and sizes.
 *
 * This replaces the Deno `@std/fs/walk` + `Deno.stat` calls in
 * `deno-torrent/torrent-generator/util.ts#obtainFiles`.  In the browser
 * we don't have filesystem stat calls — we read the size from the
 * `File` object obtained via `FileSystemFileHandle.getFile()`.
 */

import type { OPFSFileEntry } from "./types.ts";

/**
 * Returns the size of an OPFS file handle.
 *
 * @param handle - OPFS file handle.
 * @returns Size in bytes.
 */
export async function getOPFSFileSize(handle: FileSystemFileHandle): Promise<number> {
  const file = await handle.getFile();
  return file.size;
}

/**
 * Recursively walks an OPFS directory handle, returning all files with
 * paths relative to `root`.
 *
 * BEP-3 sorting (shallowest first, then lexicographic) is applied so
 * the result is directly consumable by `buildPieceFiles` and
 * `generateTorrent`.
 *
 * Hidden file policy mirrors the deno-torrent reference: when
 * `ignoreHiddenFile` is true, files whose final path component starts
 * with `"."` are skipped.  BEP-47 padding files (`.pad/...`) are
 * generated synthetically and never appear in the walk.
 *
 * @param root - The directory handle to walk.
 * @param ignoreHiddenFile - When `true`, skip entries whose base name starts with `"."`.
 * @returns Ordered list of files under `root`.
 */
export async function walkOPFSDir(
  root: FileSystemDirectoryHandle,
  ignoreHiddenFile = false,
): Promise<OPFSFileEntry[]> {
  const files: OPFSFileEntry[] = [];

  async function visit(
    dir: FileSystemDirectoryHandle,
    prefix: string[],
  ): Promise<void> {
    // BFS for stable ordering — `values()` yields in insertion order.
    // We collect into an array first to avoid losing `for-await` context.
    const queue: Array<FileSystemHandle> = [];
    for await (const entry of (dir as any).values()) {
      queue.push(entry);
    }
    for (const entry of queue) {
      if (entry.kind === "file") {
        if (ignoreHiddenFile && entry.name.startsWith(".")) continue;
        const fileHandle = entry as FileSystemFileHandle;
        const size = await getOPFSFileSize(fileHandle);
        files.push({
          name: [...prefix, entry.name].join("/"),
          size,
          handle: fileHandle,
        });
      } else if (entry.kind === "directory") {
        if (ignoreHiddenFile && entry.name.startsWith(".")) continue;
        await visit(entry as FileSystemDirectoryHandle, [...prefix, entry.name]);
      }
    }
  }

  await visit(root, []);

  // BEP-3 sort: shallowest first, then lexicographic.
  files.sort((a, b) => {
    const depthA = a.name.split("/").length;
    const depthB = b.name.split("/").length;
    if (depthA !== depthB) return depthA - depthB;
    return a.name.localeCompare(b.name);
  });

  return files;
}
