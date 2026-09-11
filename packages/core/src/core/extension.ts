// /loco/monorepo/webtorrent/src/core/extension.ts

import { TypedEventTarget } from "../utils/event-target.ts";

export interface ExtensionEvents {
  warning: CustomEvent<{ error: Error }>;
  metadata: CustomEvent<{ metadata: Uint8Array }>;
  info: CustomEvent<{ message: string }>;
}

/**
 * Classe base para extensões do protocolo BitTorrent (BEP 10).
 * Extensões como ut_metadata e ut_pex devem herdar desta classe.
 */
export abstract class Extension extends TypedEventTarget<ExtensionEvents> {
  public abstract readonly name: string;
  protected wire: any;

  constructor(wire: any) {
    super();
    this.wire = wire;
  }

  /**
   * Chamado quando o handshake estendido é recebido do peer.
   */
  abstract onExtendedHandshake(handshake: any): void;

  /**
   * Chamado quando uma mensagem estendida para esta extensão é recebida.
   */
  abstract onMessage(payload: Uint8Array): void;
}