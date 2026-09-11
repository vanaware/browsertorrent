/**
 * check if the port is valid
 * @param port the port to be checked
 * @returns true if the port is valid, otherwise return false
 */
function isNetPort(port: number): boolean {
  if (!Number.isInteger(port)) return false;
  return port >= 0 && port <= 65535;
}

/**
 * check if the port is well known port
 * @see https://en.wikipedia.org/wiki/List_of_TCP_and_UDP_port_numbers#Well-known_ports
 * @param port the port to be checked
 * @returns true if the port is well known port, otherwise return false
 */
function isWellKnownPort(port: number): boolean {
  return isNetPort(port) && port <= 1023;
}

/**
 * check if the port is registered port
 * @see https://en.wikipedia.org/wiki/List_of_TCP_and_UDP_port_numbers#Registered_ports
 * @param port the port to be checked
 * @returns true if the port is registered port, otherwise return false
 */
function isRegisteredPort(port: number): boolean {
  return isNetPort(port) && port >= 1024 && port <= 49151;
}

/**
 * check if the port is dynamic port
 * @see https://en.wikipedia.org/wiki/List_of_TCP_and_UDP_port_numbers#Dynamic,_private_or_ephemeral_ports
 * @param port the port to be checked
 * @returns true if the port is dynamic port, otherwise return false
 */
function isDynamicPort(port: number): boolean {
  return isNetPort(port) && port >= 49152 && port <= 65535;
}

/**
 * check if the ip is IPv4 string
 * @param ip the ip to be checked, e.g. 192.168.1.1
 * @returns true if the ip is IPv4 string, otherwise return false
 */
function isIPv4Str(ip?: string): boolean {
  if (!ip) return false;
  return /^((25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)$/.test(ip);
}

/**
 * check if the bytes is IPv4 Uint8Array
 * @param bytes the bytes to be checked
 * @returns true if the bytes is IPv4 Uint8Array, otherwise return false
 */
function isIPv4Bytes(bytes?: Uint8Array): boolean {
  if (!bytes) return false;
  return bytes.length === 4;
}

/**
 * check if the domain is valid
 * @param domain
 * @returns
 */
function isDomain(domain?: string): boolean {
  if (!domain || domain.length > 253) return false;

  const labels = domain.split('.');
  if (labels.length < 2 || !/^[A-Za-z]{2,63}$/.test(labels.at(-1)!)) return false;

  return labels.every(
    (label) =>
      label.length >= 1 &&
      label.length <= 63 &&
      /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label),
  );
}

/**
 * convert the ip address to Uint8Array,use 4 bytes to represent the ip address
 * @param value
 * @returns
 */
function bytes2IPv4Str(value?: Uint8Array): string | undefined {
  if (!value || !isIPv4Bytes(value)) return undefined;
  return Array.from(value).join('.');
}

/**
 * convert the ip address to Uint8Array,use 4 bytes to represent the ip address,this is only for IPv4
 * @param value
 * @returns
 */
function ipv4Str2Bytes(value?: string): Uint8Array | undefined {
  if (!value || !isIPv4Str(value)) return undefined;
  return Uint8Array.from(value.split('.').map((v) => parseInt(v)));
}

/** An IPv4 address and TCP/UDP port. */
export interface IPv4Endpoint {
  /** Dotted-decimal IPv4 address. */
  host: string;
  /** Network port in the range [0, 65535]. */
  port: number;
}

/**
 * Encodes an IPv4 endpoint in the six-byte compact-peer format used by BEP 23.
 *
 * @throws {TypeError} If `host` is not a valid IPv4 address.
 * @throws {RangeError} If `port` is not a valid network port.
 */
function ipv4EndpointToCompact(host: string, port: number): Uint8Array {
  const hostBytes = ipv4Str2Bytes(host);
  if (hostBytes === undefined) throw new TypeError('host must be a valid IPv4 address');
  if (!isNetPort(port)) throw new RangeError('port must be an integer in the range [0, 65535]');

  const result = new Uint8Array(6);
  result.set(hostBytes);
  result[4] = port >>> 8;
  result[5] = port & 0xff;
  return result;
}

/**
 * Decodes a six-byte BEP 23 compact IPv4 peer into an endpoint.
 *
 * @throws {RangeError} If `bytes` does not contain exactly six bytes.
 */
function compactIPv4ToEndpoint(bytes: Uint8Array): IPv4Endpoint {
  if (bytes.length !== 6) {
    throw new RangeError('compact IPv4 endpoint must contain exactly 6 bytes');
  }

  return {
    host: bytes2IPv4Str(bytes.subarray(0, 4))!,
    port: (bytes[4] << 8) | bytes[5],
  };
}

/**
 * get the mac address using Deno.networkInterfaces()
 * @returns sorted, deduplicated list of MAC addresses, or undefined if none found
 */
function getMacAddr(): string[] | undefined {
  const macAddrs = Deno.networkInterfaces()
    .map((iface) => iface.mac.toLowerCase().replace(/-/g, ':'))
    .filter((mac) => mac !== '00:00:00:00:00:00')
    .filter((mac, index, array) => array.indexOf(mac) === index)
    .sort();

  return macAddrs.length > 0 ? macAddrs : undefined;
}

/** Network address, port, and interface utilities. */
const NetUtil = {
  isNetPort,
  isWellKnownPort,
  isRegisteredPort,
  isDynamicPort,
  isIPv4Str,
  isIPv4Bytes,
  isDomain,
  bytes2IPv4Str,
  ipv4Str2Bytes,
  ipv4EndpointToCompact,
  compactIPv4ToEndpoint,
  getMacAddr,
};

export { NetUtil };
