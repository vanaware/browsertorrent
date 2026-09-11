/** Internal path and ordering helpers shared by parsing and generation. @module */

/** Compare strings deterministically without depending on the host locale. */
export function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Return whether a torrent path component is safe to interpret on common
 * filesystems. Separators, NUL, and traversal components are never valid file
 * or directory names in metainfo produced by this package.
 */
export function isSafePathComponent(component: unknown): component is string {
  return typeof component === 'string' &&
    component.length > 0 &&
    component !== '.' &&
    component !== '..' &&
    !component.includes('/') &&
    !component.includes('\\') &&
    !component.includes('\0');
}
