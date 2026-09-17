export class WsTracker extends TypedEventTarget<TrackerEvents>
  implements Tracker {
  private url: string;
  private opts: TrackerOptions;
  private ws: WebSocket | null = null;
  private pendingAnnounces: Array<
    {
      event: TrackerAnnounceEvent | undefined;
      resolve: (val: TrackerResponse,) => void;
      reject: (err: Error,) => void;
    }
  > = [];
  private hasConnected = false;
  private destroyed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private trackerId?: string;

  constructor(url: string, opts: TrackerOptions,) {
    super();
    this.url = url;
    this.opts = opts;
  }

  announce(event?: TrackerAnnounceEvent,): Promise<TrackerResponse> {
    return new Promise((resolve, reject,) => {
      if (this.destroyed) {
        return reject(new TrackerError("Tracker destroyed",),);
      }

      this.pendingAnnounces.push({ event, resolve, reject, },);

      if (
        !this.ws || this.ws.readyState === WebSocket.CLOSED ||
        this.ws.readyState === WebSocket.CLOSING
      ) {
        this._connect();
      } else if (this.ws.readyState === WebSocket.OPEN) {
        this._flushAnnounces();
      }
    },);
  }

  private _connect() {
    if (this.destroyed) return;
    try {
      this.ws = new WebSocket(this.url,);

      this.ws.onopen = () => {
        this.hasConnected = true;
        this._flushAnnounces();
      };

      this.ws.onmessage = (event,) => {
        if (this.destroyed) return;
        try {
          const data = JSON.parse(event.data,) as TrackerMessage;

          if (data.action === "announce") {
            if (data.interval) {
              const response: TrackerResponse = {
                interval: data.interval || 1800,
                complete: data.complete || 0,
                incomplete: data.incomplete || 0,
                peers: [],
                trackerId: this.trackerId,
              };
              this.emit(
                "update",
                new CustomEvent("update", { detail: response, },),
              );

              // Resolve any pending announce promises
              const pending = [...this.pendingAnnounces,];
              this.pendingAnnounces = [];
              for (const p of pending) {
                p.resolve(response,);
              }
            }

            // Handle signaling (WebRTC)
            if (data.peer_id) {
              // Remote peer sent us something (offer, answer, or just their existence)
              this.emit(
                "peer",
                new CustomEvent("peer", {
                  detail: {
                    peerId: data.peer_id,
                    offer: data.offer,
                    answer: data.answer,
                    offerId: data.offer_id,
                  },
                },),
              );
            }

            // Handle plain TCP/IP peers if sent in a batch (not typical for WebTorrent WebSockets, but possible)
            if (data.peers && Array.isArray(data.peers,)) {
              for (const p of data.peers) {
                // Ignore for now unless we want to connect to regular peers via tcp/webrtc-hybrid
              }
            }
          } else if (data["failure reason"]) {
            const err = new TrackerError(String(data["failure reason"],),);
            this.emit("error", new CustomEvent("error", { detail: err, },),);
            this._rejectPending(err,);
          } else if (data.action === "error") {
            const err = new TrackerError(
              String(data["failure reason"] || "Unknown error",),
            );
            this.emit("error", new CustomEvent("error", { detail: err, },),);
            this._rejectPending(err,);
          }
        } catch (err) {
          console.warn("WsTracker parse error:", err,);
        }
      };

      this.ws.onerror = () => {
        // Will close right after, handled in onclose
      };

      this.ws.onclose = () => {
        this.ws = null;
        if (!this.destroyed && this.hasConnected) {
          this.reconnectTimer = setTimeout(() => this._connect(), 5000,);
        } else {
          this._rejectPending(
            new TrackerError("WebSocket connection closed",),
          );
        }
      };
    } catch (err) {
      this._rejectPending(
        err instanceof Error ? err : new TrackerError(String(err,),),
      );
    }
  }

  private _flushAnnounces() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    for (const pending of this.pendingAnnounces) {
      const e = pending.event || {};
      const msg: TrackerAnnounceRequest = {
        action: "announce",
        info_hash: uint8ArrayToBinaryString(this.opts.infoHash,),
        peer_id: uint8ArrayToBinaryString(this.opts.peerId,),
        numwant: e.numwant || this.opts.numwant || 50,
        uploaded: this.opts.uploaded || 0,
        downloaded: this.opts.downloaded || 0,
        left: this.opts.left || 0,
      };

      if (e.event) (msg as any).event = e.event;
      if (e.offers) msg.offers = e.offers;
      if (e.answer) msg.answer = e.answer;
      if (e.to_peer_id) msg.to_peer_id = e.to_peer_id;
      if (e.offer_id) msg.offer_id = e.offer_id;

      if (this.trackerId) (msg as any).trackerid = this.trackerId;

      this.ws.send(JSON.stringify(msg,),);
    }

    // We don't clear pendingAnnounces here, we wait for the response to resolve them
    // But if we send an 'answer' (which has to_peer_id), the tracker might NOT send back an interval response!
    // We need to resolve immediately for directed messages.
    this.pendingAnnounces = this.pendingAnnounces.filter((p,) => {
      if (p.event?.to_peer_id) {
        p.resolve({ interval: 1800, complete: 0, incomplete: 0, peers: [], },);
        return false;
      }
      return true;
    },);
  }

  private _rejectPending(err: Error,) {
    const pending = [...this.pendingAnnounces,];
    this.pendingAnnounces = [];
    for (const p of pending) {
      p.reject(err,);
    }
  }

  destroy(): void {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer,);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._rejectPending(new TrackerError("Tracker destroyed",),);
  }
}
