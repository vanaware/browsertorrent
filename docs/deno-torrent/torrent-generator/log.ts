/**
 * Optional debug-logging utilities.
 *
 * Debug output is **disabled by default** and has zero performance impact
 * unless explicitly enabled via {@link enableDebug}.
 *
 * @module
 */

let DEBUG_ENABLED = false

/** Enable debug log output to stdout. */
export function enableDebug(): void {
  DEBUG_ENABLED = true
}

/** Disable debug log output (default state). */
export function disableDebug(): void {
  DEBUG_ENABLED = false
}

/**
 * Emit a timestamped debug message to stdout.
 *
 * Does nothing when debug mode is disabled.
 *
 * @param message - Primary message string.
 * @param params - Additional values forwarded to `console.log`.
 */
export function logd(message?: unknown, ...params: unknown[]): void {
  if (!DEBUG_ENABLED) return

  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`

  // Cyan timestamp
  console.log(`[\x1b[36m${ts}\x1b[0m] ${message}`, ...params)
}
