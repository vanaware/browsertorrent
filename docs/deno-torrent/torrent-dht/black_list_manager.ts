/** In-memory set of blocked IP addresses. */
export default class BlackListManager {
  #banIpList: Set<string> = new Set()

  /**
   * Return whether an IP address is blocked.
   *
   * @deprecated Use {@linkcode isBanned}.
   */
  isBaned(ip: string): boolean {
    return this.isBanned(ip)
  }

  /** Return whether an IP address is blocked. */
  isBanned(ip: string): boolean {
    return this.#banIpList.has(ip)
  }

  /** Add an IP address to the block list. */
  ban(ip: string): void {
    this.#banIpList.add(ip)
  }
}
