// /loco/monorepo/webtorrent/src/utils/event-target.ts

/**
 * Substituto tipado para o `EventEmitter` do Node.js.
 * Usa a API nativa `EventTarget` do browser, mas com tipagem estrita para eventos.
 */

export type EventMap = Record<string, Event | CustomEvent | any>;

export class TypedEventTarget<Events extends EventMap> extends EventTarget {
  /**
   * Registra um listener para um evento específico.
   */
  on<K extends keyof Events>(
    type: K & string,
    listener: (event: Events[K]) => void,
    options?: boolean | AddEventListenerOptions
  ): this {
    this.addEventListener(type, listener as EventListener, options);
    return this;
  }

  /**
   * Registra um listener que será removido após a primeira execução.
   */
  once<K extends keyof Events>(
    type: K & string,
    listener: (event: Events[K]) => void
  ): this {
    this.addEventListener(type, listener as EventListener, { once: true });
    return this;
  }

  /**
   * Remove um listener.
   */
  off<K extends keyof Events>(
    type: K & string,
    listener: (event: Events[K]) => void,
    options?: boolean | EventListenerOptions
  ): this {
    this.removeEventListener(type, listener as EventListener, options);
    return this;
  }

  /**
   * Emite um evento.
   * 🔥 CORREÇÃO: Usamos `(detail as any) instanceof Event` para contornar 
   * a restrição do TypeScript com tipos genéricos union (TS2358).
   */
  emit<K extends keyof Events>(type: K & string, detail?: Events[K]): boolean {
    const event =
      (detail && (detail as any) instanceof Event)
        ? (detail as any)
        : new CustomEvent(type, { detail, cancelable: true });
    
    return this.dispatchEvent(event);
  }

  /**
   * Remove todos os listeners de um tipo específico (ou de todos os tipos).
   * Nota: EventTarget nativo não expõe os listeners, então esta implementação
   * é um no-op seguro, confiando no Garbage Collector quando o alvo é destruído.
   */
  removeAllListeners<K extends keyof Events>(type?: K & string): this {
    // Em implementações nativas, recriar o EventTarget é a forma mais limpa
    // de limpar tudo, mas para o WebTorrent, o destroy() do objeto pai 
    // geralmente cuida da limpeza das referências.
    return this;
  }
}