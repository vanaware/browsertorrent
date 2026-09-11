import { hashCode, isIPv6, isValidHostname } from "./util.ts";

export class UtpAddr {
  port: number;
  hostname: string;

  constructor(port: number, hostname: string) {
    // check port and hostname is valid
    if (port < 0 || port > 65535) {
      throw new Error(`invalid port: ${port}`);
    }

    const normalizedHostname =
      hostname.startsWith("[") && hostname.endsWith("]")
        ? hostname.slice(1, -1)
        : hostname;

    if (!isValidHostname(normalizedHostname)) {
      throw new Error(`invalid hostname: ${hostname}`);
    }

    this.port = port;
    this.hostname = normalizedHostname;
  }

  static fromNetAddr(addr: Deno.NetAddr): UtpAddr {
    return new UtpAddr(addr.port, addr.hostname);
  }

  static fromDenoAddr(addr: Deno.Addr): UtpAddr {
    if ("port" in addr && "hostname" in addr) {
      return new UtpAddr(addr.port, addr.hostname);
    }
    throw new Error("invalid addr");
  }

  toString(): string {
    const hostname = isIPv6(this.hostname)
      ? `[${this.hostname}]`
      : this.hostname;
    return `${hostname}:${this.port}`;
  }

  equals(addr: UtpAddr): boolean {
    return this.port === addr.port && this.hostname === addr.hostname;
  }

  hashCode(): number {
    return this.port * 31 + hashCode(this.hostname);
  }
}
