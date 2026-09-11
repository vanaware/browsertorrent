import { type BencodeValue, decode, encode } from "@deno-torrent/bencode";
import { PeerWireError, PeerWireProtocolError } from "@src/errors.ts";
import type { ExtendedMessage } from "@src/message.ts";

/** Parsed BEP 10 extended handshake fields. */
export interface ExtendedHandshake {
  /** Extension names mapped to the IDs selected by the remote peer. */
  readonly extensions: ReadonlyMap<string, number>;
  /** Remote client identification (`v`). */
  readonly client?: string;
  /** Remote TCP/uTP listen port (`p`). */
  readonly port?: number;
  /** Remote request queue preference (`reqq`). */
  readonly requestQueue?: number;
  /** Raw info-dictionary length advertised for BEP 9. */
  readonly metadataSize?: number;
  /** This endpoint's compact address as observed by the remote peer. */
  readonly yourIp?: Uint8Array;
  /** Remote endpoint's explicitly advertised compact IPv4 address. */
  readonly ipv4?: Uint8Array;
  /** Remote endpoint's explicitly advertised compact IPv6 address. */
  readonly ipv6?: Uint8Array;
  /** Complete decoded dictionary, including non-standard extension fields. */
  readonly raw: ReadonlyMap<string | Uint8Array, BencodeValue>;
}

/** Operations exposed to one registered BEP 10 extension. */
export interface PeerWireExtensionContext {
  /** Connection-local host, including the peer's directional ID mapping. */
  readonly host: ExtensionHost;
  /** Send a payload under this extension's peer-selected outgoing ID. */
  send(payload: Uint8Array): Promise<void>;
}

/** A named BEP 10 extension hosted by {@link ExtensionHost}. */
export interface PeerWireExtension {
  /** BEP 10 mapping name, for example `ut_metadata`. */
  readonly name: string;
  /** Capture connection-local operations when the extension is registered. */
  onRegister?(context: PeerWireExtensionContext): void;
  /** Contribute fields to each local extended handshake. */
  handshakeFields?(): ReadonlyMap<string, BencodeValue>;
  /** Observe the peer's initial or repeated extended handshake. */
  onExtendedHandshake?(handshake: ExtendedHandshake): void | Promise<void>;
  /** Handle one payload addressed to this extension. */
  onMessage?(payload: Uint8Array): void | Promise<void>;
  /** Release pending work when the owning wire closes. */
  close?(reason?: unknown): void;
}

/** Construction options for one connection-local BEP 10 host. */
export interface ExtensionHostOptions {
  /** Low-level sender used for extended message ID and payload pairs. */
  send: (extensionId: number, payload: Uint8Array) => Promise<void>;
  /** Maximum accepted extension payload, defaulting to 256 KiB. */
  maxPayloadLength?: number;
  /** Optional standard extended-handshake client name (`v`). */
  client?: string;
  /** Optional standard extended-handshake listen port (`p`). */
  port?: number;
  /** Optional standard extended-handshake request queue size (`reqq`). */
  requestQueue?: number;
}

/** Negotiates, maps, and dispatches BEP 10 extension messages for one peer. */
export class ExtensionHost {
  /** Maximum extension payload accepted in either direction. */
  readonly maxPayloadLength: number;
  /** IDs selected locally, which the peer uses when sending to us. */
  readonly localExtensions: Map<string, number> = new Map();
  /** IDs selected by the peer, which we use when sending to it. */
  readonly peerExtensions: Map<string, number> = new Map();

  /** Most recent valid extended handshake received from the peer. */
  peerHandshake?: ExtendedHandshake;

  #send: (extensionId: number, payload: Uint8Array) => Promise<void>;
  // localExtensions contains IDs the peer must use when sending to us;
  // peerExtensions contains IDs we must use when sending to the peer. BEP 10
  // deliberately makes these mappings connection-local and directional.
  #extensions = new Map<string, PeerWireExtension>();
  #handshakeFields = new Map<string, BencodeValue>();
  #nextId = 1;
  #handshakeWaiters: Array<(value: ExtendedHandshake) => void> = [];

  /** Create a connection-local extension registry around a low-level sender. */
  constructor(options: ExtensionHostOptions) {
    this.#send = options.send;
    this.maxPayloadLength = options.maxPayloadLength ?? 256 * 1024;
    if (
      !Number.isSafeInteger(this.maxPayloadLength) || this.maxPayloadLength < 1
    ) {
      throw new RangeError("maxPayloadLength must be a positive safe integer");
    }
    if (options.client !== undefined) {
      this.setHandshakeField("v", options.client);
    }
    if (options.port !== undefined) this.setHandshakeField("p", options.port);
    if (options.requestQueue !== undefined) {
      this.setHandshakeField("reqq", options.requestQueue);
    }
  }

  /** Register an extension and allocate its local incoming message ID. */
  use<T extends PeerWireExtension>(extension: T): T {
    if (!extension.name || extension.name.length < 3) {
      throw new TypeError(
        "extension name must contain at least three characters",
      );
    }
    if (this.#extensions.has(extension.name)) {
      throw new PeerWireError(
        `extension ${extension.name} is already registered`,
      );
    }
    if (this.#nextId > 255) throw new PeerWireError("no extension IDs remain");
    this.#extensions.set(extension.name, extension);
    this.localExtensions.set(extension.name, this.#nextId++);
    extension.onRegister?.({
      host: this,
      send: (payload) => this.send(extension.name, payload),
    });
    return extension;
  }

  /** Retrieve a registered extension by its BEP 10 name. */
  get<T extends PeerWireExtension = PeerWireExtension>(
    name: string,
  ): T | undefined {
    return this.#extensions.get(name) as T | undefined;
  }

  /** Add, replace, or remove a non-`m` extended-handshake field. */
  setHandshakeField(name: string, value: BencodeValue | undefined): void {
    if (name === "m") {
      throw new TypeError("the m field is managed by ExtensionHost");
    }
    if (value === undefined) this.#handshakeFields.delete(name);
    else this.#handshakeFields.set(name, value);
  }

  /** Send the local extended handshake. This may be called again after updates. */
  async sendHandshake(): Promise<void> {
    const extensions = new Map<string, BencodeValue>();
    for (const [name, id] of this.localExtensions) extensions.set(name, id);
    const fields = new Map<string, BencodeValue>(this.#handshakeFields);
    fields.set("m", extensions);
    for (const extension of this.#extensions.values()) {
      for (const [name, value] of extension.handshakeFields?.() ?? []) {
        if (name === "m") {
          throw new PeerWireError(
            `${extension.name} may not replace the m field`,
          );
        }
        fields.set(name, value);
      }
    }
    await this.#send(0, encode(fields));
  }

  /** Send a payload using the ID selected by the remote peer. */
  async send(name: string, payload: Uint8Array): Promise<void> {
    if (payload.length > this.maxPayloadLength) {
      throw new RangeError(
        `extension payload exceeds configured limit ${this.maxPayloadLength}`,
      );
    }
    const id = this.peerExtensions.get(name);
    if (id === undefined) {
      throw new PeerWireError(
        `remote peer did not advertise extension ${name}`,
      );
    }
    await this.#send(id, payload);
  }

  /** Resolve after the first valid remote extended handshake. */
  waitForPeerHandshake(): Promise<ExtendedHandshake> {
    if (this.peerHandshake) return Promise.resolve(this.peerHandshake);
    return new Promise((resolve) => this.#handshakeWaiters.push(resolve));
  }

  /** Parse and dispatch one raw BEP 10 message. */
  async handle(message: ExtendedMessage): Promise<string | undefined> {
    if (message.payload.length > this.maxPayloadLength) {
      throw new PeerWireProtocolError(
        `extension payload exceeds configured limit ${this.maxPayloadLength}`,
      );
    }
    if (message.extensionId === 0) {
      // Repeated handshakes are additive. A zero mapping explicitly disables
      // one previously advertised extension without resetting other entries.
      const handshake = decodeExtendedHandshake(message.payload);
      for (const [name, id] of handshake.extensions) {
        if (id === 0) this.peerExtensions.delete(name);
        else this.peerExtensions.set(name, id);
      }
      this.peerHandshake = handshake;
      for (const waiter of this.#handshakeWaiters.splice(0)) waiter(handshake);
      for (const extension of this.#extensions.values()) {
        await extension.onExtendedHandshake?.(handshake);
      }
      return undefined;
    }

    const name = findNameById(this.localExtensions, message.extensionId);
    if (name === undefined) return undefined;
    await this.#extensions.get(name)?.onMessage?.(message.payload);
    return name;
  }

  /** Notify registered extensions that their owning peer connection ended. */
  close(reason?: unknown): void {
    for (const extension of this.#extensions.values()) {
      extension.close?.(reason);
    }
    this.#handshakeWaiters.length = 0;
  }
}

/** Decode and validate a bounded BEP 10 extended handshake dictionary. */
export function decodeExtendedHandshake(
  payload: Uint8Array,
): ExtendedHandshake {
  let value: BencodeValue;
  try {
    value = decode(payload, { maxBytes: 256 * 1024, maxDepth: 32 });
  } catch (cause) {
    throw new PeerWireProtocolError("invalid extended handshake", { cause });
  }
  if (!(value instanceof Map)) {
    throw new PeerWireProtocolError("extended handshake must be a dictionary");
  }
  const mapping = value.get("m");
  if (mapping !== undefined && !(mapping instanceof Map)) {
    throw new PeerWireProtocolError(
      "extended handshake m field must be a dictionary",
    );
  }
  const extensions = new Map<string, number>();
  for (const [name, id] of mapping ?? []) {
    if (
      typeof name !== "string" || typeof id !== "number" || id < 0 || id > 255
    ) {
      throw new PeerWireProtocolError(
        "extended handshake contains an invalid mapping",
      );
    }
    extensions.set(name, id);
  }
  return {
    extensions,
    client: optionalString(value, "v"),
    port: optionalInteger(value, "p", 0xffff),
    requestQueue: optionalInteger(value, "reqq", 0xffffffff),
    metadataSize: optionalInteger(value, "metadata_size", 0xffffffff),
    yourIp: optionalBytes(value, "yourip"),
    ipv4: optionalBytes(value, "ipv4"),
    ipv6: optionalBytes(value, "ipv6"),
    raw: value,
  };
}

function optionalString(
  map: Map<string | Uint8Array, BencodeValue>,
  key: string,
) {
  const value = map.get(key);
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new PeerWireProtocolError(
      `extended handshake ${key} must be a string`,
    );
  }
  return value;
}

function optionalInteger(
  map: Map<string | Uint8Array, BencodeValue>,
  key: string,
  maximum: number,
) {
  const value = map.get(key);
  if (value === undefined) return undefined;
  if (typeof value !== "number" || value < 0 || value > maximum) {
    throw new PeerWireProtocolError(`extended handshake ${key} is invalid`);
  }
  return value;
}

function optionalBytes(
  map: Map<string | Uint8Array, BencodeValue>,
  key: string,
) {
  const value = map.get(key);
  if (value === undefined) return undefined;
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (typeof value === "string") return new TextEncoder().encode(value);
  throw new PeerWireProtocolError(`extended handshake ${key} must be bytes`);
}

function findNameById(mapping: ReadonlyMap<string, number>, id: number) {
  for (const [name, candidate] of mapping) if (candidate === id) return name;
  return undefined;
}
