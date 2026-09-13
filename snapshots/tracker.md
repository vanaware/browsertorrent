> **INSTRUÇÃO PARA A IA:** 
> O texto abaixo contém um snapshot de arquivos javascript de um servidor tracker de bittorrent.
> O projeto é o **BrowserTorrent ** estruturado em blocos. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: `## Arquivo: src/main.ts`).
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo.

---

# Contexto Exportado do Projeto BrowserTorrent - Modo: TRACKER

Gerado automaticamente em: 9/12/2026, 8:09:19 PM

---

## Arquivo: `docs/bittorrent-tracker/client-ws-socket-pool.js`

```js
import Client from '../index.js'
import common from './common.js'
import fixtures from 'webtorrent-fixtures'
import test from 'tape'

const peerId = Buffer.from('01234567890123456789')
const port = 6681

test('ensure client.destroy() callback is called with re-used websockets in socketPool', t => {
  t.plan(4)

  common.createServer(t, 'ws', (server, announceUrl) => {
    const client1 = new Client({
      infoHash: fixtures.leaves.parsedTorrent.infoHash,
      announce: announceUrl,
      peerId,
      port,
      wrtc: {}
    })

    common.mockWebsocketTracker(client1)
    client1.on('error', err => { t.error(err) })
    client1.on('warning', err => { t.error(err) })

    client1.start()

    client1.once('update', () => {
      t.pass('got client1 update')
      // second ws client using same announce url will re-use the same websocket
      const client2 = new Client({
        infoHash: fixtures.alice.parsedTorrent.infoHash, // different info hash
        announce: announceUrl,
        peerId,
        port,
        wrtc: {}
      })

      common.mockWebsocketTracker(client2)
      client2.on('error', err => { t.error(err) })
      client2.on('warning', err => { t.error(err) })

      client2.start()

      client2.once('update', () => {
        t.pass('got client2 update')
        client1.destroy(err => {
          t.error(err, 'got client1 destroy callback')
          client2.destroy(err => {
            t.error(err, 'got client2 destroy callback')
            server.close()
          })
        })
      })
    })
  })
})

```

---

## Arquivo: `docs/bittorrent-tracker/client.js`

```js
import Debug from 'debug'
import EventEmitter from 'events'
import once from 'once'
import parallel from 'run-parallel'
import Peer from '@thaunknown/simple-peer/lite.js'
import queueMicrotask from 'queue-microtask'
import { hex2arr, hex2bin, text2arr, arr2hex, arr2text } from 'uint8-util'

import common from './lib/common.js'
import HTTPTracker from './lib/client/http-tracker.js' // empty object in browser
import UDPTracker from './lib/client/udp-tracker.js' // empty object in browser
import WebSocketTracker from './lib/client/websocket-tracker.js'

const debug = Debug('bittorrent-tracker:client')

/**
 * BitTorrent tracker client.
 *
 * Find torrent peers, to help a torrent client participate in a torrent swarm.
 *
 * @param {Object} opts                          options object
 * @param {string|Uint8Array} opts.infoHash          torrent info hash
 * @param {string|Uint8Array} opts.peerId            peer id
 * @param {string|Array.<string>} opts.announce  announce
 * @param {number} opts.port                     torrent client listening port
 * @param {function} opts.getAnnounceOpts        callback to provide data to tracker
 * @param {number} opts.rtcConfig                RTCPeerConnection configuration object
 * @param {number} opts.userAgent                User-Agent header for http requests
 * @param {number} opts.wrtc                     custom webrtc impl (useful in node.js)
 * @param {object} opts.proxyOpts                proxy options (useful in node.js)
 */
class Client extends EventEmitter {
  constructor (opts = {}) {
    super()

    if (!opts.peerId) throw new Error('Option `peerId` is required')
    if (!opts.infoHash) throw new Error('Option `infoHash` is required')
    if (!opts.announce) throw new Error('Option `announce` is required')
    if (!process.browser && !opts.port) throw new Error('Option `port` is required')

    this.peerId = typeof opts.peerId === 'string'
      ? opts.peerId
      : arr2hex(opts.peerId)
    this._peerIdBuffer = hex2arr(this.peerId)
    this._peerIdBinary = hex2bin(this.peerId)

    this.infoHash = typeof opts.infoHash === 'string'
      ? opts.infoHash.toLowerCase()
      : arr2hex(opts.infoHash)
    this._infoHashBuffer = hex2arr(this.infoHash)
    this._infoHashBinary = hex2bin(this.infoHash)

    debug('new client %s', this.infoHash)

    this.destroyed = false

    this._port = opts.port
    this._getAnnounceOpts = opts.getAnnounceOpts
    this._rtcConfig = opts.rtcConfig
    this._userAgent = opts.userAgent
    this._proxyOpts = opts.proxyOpts

    // Support lazy 'wrtc' module initialization
    // See: https://github.com/webtorrent/webtorrent-hybrid/issues/46
    this._wrtc = typeof opts.wrtc === 'function' ? opts.wrtc() : opts.wrtc

    let announce = typeof opts.announce === 'string'
      ? [opts.announce]
      : opts.announce == null ? [] : opts.announce

    // Remove trailing slash from trackers to catch duplicates
    announce = announce.map(announceUrl => {
      if (ArrayBuffer.isView(announceUrl)) announceUrl = arr2text(announceUrl)
      if (announceUrl[announceUrl.length - 1] === '/') {
        announceUrl = announceUrl.substring(0, announceUrl.length - 1)
      }
      return announceUrl
    })
    // remove duplicates by converting to Set and back
    announce = Array.from(new Set(announce))

    const webrtcSupport = this._wrtc !== false && (!!this._wrtc || Peer.WEBRTC_SUPPORT)

    const nextTickWarn = err => {
      queueMicrotask(() => {
        this.emit('warning', err)
      })
    }

    this._trackers = announce
      .map(announceUrl => {
        let parsedUrl
        try {
          parsedUrl = common.parseUrl(announceUrl)
        } catch (err) {
          nextTickWarn(new Error(`Invalid tracker URL: ${announceUrl}`))
          return null
        }

        const port = parsedUrl.port
        if (port < 0 || port > 65535) {
          nextTickWarn(new Error(`Invalid tracker port: ${announceUrl}`))
          return null
        }

        const protocol = parsedUrl.protocol
        if ((protocol === 'http:' || protocol === 'https:') &&
            typeof HTTPTracker === 'function') {
          return new HTTPTracker(this, announceUrl)
        } else if (protocol === 'udp:' && typeof UDPTracker === 'function') {
          return new UDPTracker(this, announceUrl)
        } else if ((protocol === 'ws:' || protocol === 'wss:') && webrtcSupport) {
          // Skip ws:// trackers on https:// sites because they throw SecurityError
          if (protocol === 'ws:' && typeof window !== 'undefined' &&
              window.location.protocol === 'https:') {
            nextTickWarn(new Error(`Unsupported tracker protocol: ${announceUrl}`))
            return null
          }
          return new WebSocketTracker(this, announceUrl)
        } else {
          nextTickWarn(new Error(`Unsupported tracker protocol: ${announceUrl}`))
          return null
        }
      })
      .filter(Boolean)
  }

  /**
   * Send a `start` announce to the trackers.
   * @param {Object} opts
   * @param {number=} opts.uploaded
   * @param {number=} opts.downloaded
   * @param {number=} opts.left (if not set, calculated automatically)
   */
  start (opts) {
    opts = this._defaultAnnounceOpts(opts)
    opts.event = 'started'
    debug('send `start` %o', opts)
    this._announce(opts)

    // start announcing on intervals
    this._trackers.forEach(tracker => {
      tracker.setInterval()
    })
  }

  /**
   * Send a `stop` announce to the trackers.
   * @param {Object} opts
   * @param {number=} opts.uploaded
   * @param {number=} opts.downloaded
   * @param {number=} opts.numwant
   * @param {number=} opts.left (if not set, calculated automatically)
   */
  stop (opts) {
    opts = this._defaultAnnounceOpts(opts)
    opts.event = 'stopped'
    debug('send `stop` %o', opts)
    this._announce(opts)
  }

  /**
   * Send a `complete` announce to the trackers.
   * @param {Object} opts
   * @param {number=} opts.uploaded
   * @param {number=} opts.downloaded
   * @param {number=} opts.numwant
   * @param {number=} opts.left (if not set, calculated automatically)
   */
  complete (opts) {
    if (!opts) opts = {}
    opts = this._defaultAnnounceOpts(opts)
    opts.event = 'completed'
    debug('send `complete` %o', opts)
    this._announce(opts)
  }

  /**
   * Send a `update` announce to the trackers.
   * @param {Object} opts
   * @param {number=} opts.uploaded
   * @param {number=} opts.downloaded
   * @param {number=} opts.numwant
   * @param {number=} opts.left (if not set, calculated automatically)
   */
  update (opts) {
    opts = this._defaultAnnounceOpts(opts)
    if (opts.event) delete opts.event
    debug('send `update` %o', opts)
    this._announce(opts)
  }

  _announce (opts) {
    this._trackers.forEach(tracker => {
      // tracker should not modify `opts` object, it's passed to all trackers
      tracker.announce(opts)
    })
  }

  /**
   * Send a scrape request to the trackers.
   * @param {Object} opts
   */
  scrape (opts) {
    debug('send `scrape`')
    if (!opts) opts = {}
    this._trackers.forEach(tracker => {
      // tracker should not modify `opts` object, it's passed to all trackers
      tracker.scrape(opts)
    })
  }

  setInterval (intervalMs) {
    debug('setInterval %d', intervalMs)
    this._trackers.forEach(tracker => {
      tracker.setInterval(intervalMs)
    })
  }

  destroy (cb) {
    if (this.destroyed) return
    this.destroyed = true
    debug('destroy')

    const tasks = this._trackers.map(tracker => cb => {
      tracker.destroy(cb)
    })

    parallel(tasks, cb)

    this._trackers = []
    this._getAnnounceOpts = null
  }

  _defaultAnnounceOpts (opts = {}) {
    if (opts.numwant == null) opts.numwant = common.DEFAULT_ANNOUNCE_PEERS

    if (opts.uploaded == null) opts.uploaded = 0
    if (opts.downloaded == null) opts.downloaded = 0

    if (this._getAnnounceOpts) opts = Object.assign({}, opts, this._getAnnounceOpts())

    return opts
  }
}

/**
 * Simple convenience function to scrape a tracker for an info hash without needing to
 * create a Client, pass it a parsed torrent, etc. Support scraping a tracker for multiple
 * torrents at the same time.
 * @params {Object} opts
 * @param  {string|Array.<string>} opts.infoHash
 * @param  {string} opts.announce
 * @param  {function} cb
 */
Client.scrape = (opts, cb) => {
  cb = once(cb)

  if (!opts.infoHash) throw new Error('Option `infoHash` is required')
  if (!opts.announce) throw new Error('Option `announce` is required')

  const clientOpts = Object.assign({}, opts, {
    infoHash: Array.isArray(opts.infoHash) ? opts.infoHash[0] : opts.infoHash,
    peerId: text2arr('01234567890123456789'), // dummy value
    port: 6881 // dummy value
  })

  const client = new Client(clientOpts)
  client.once('error', cb)
  client.once('warning', cb)

  let len = Array.isArray(opts.infoHash) ? opts.infoHash.length : 1
  const results = {}
  client.on('scrape', data => {
    len -= 1
    results[data.infoHash] = data
    if (len === 0) {
      client.destroy()
      const keys = Object.keys(results)
      if (keys.length === 1) {
        cb(null, results[keys[0]])
      } else {
        cb(null, results)
      }
    }
  })

  client.scrape({ infoHash: opts.infoHash })
  return client
}

export default Client

```

---

## Arquivo: `docs/bittorrent-tracker/common-node.js`

```js
/**
 * Functions/constants needed by both the client and server (but only in node).
 * These are separate from common.js so they can be skipped when bundling for the browser.
 */

import querystring from 'querystring'
import { concat } from 'uint8-util'

export const IPV4_RE = /^[\d.]+$/
export const IPV6_RE = /^[\da-fA-F:]+$/
export const REMOVE_IPV4_MAPPED_IPV6_RE = /^::ffff:/

export const CONNECTION_ID = concat([toUInt32(0x417), toUInt32(0x27101980)])
export const ACTIONS = { CONNECT: 0, ANNOUNCE: 1, SCRAPE: 2, ERROR: 3 }
export const EVENTS = { update: 0, completed: 1, started: 2, stopped: 3, paused: 4 }
export const EVENT_IDS = {
  0: 'update',
  1: 'completed',
  2: 'started',
  3: 'stopped',
  4: 'paused'
}
export const EVENT_NAMES = {
  update: 'update',
  completed: 'complete',
  started: 'start',
  stopped: 'stop',
  paused: 'pause'
}

/**
 * Client request timeout. How long to wait before considering a request to a
 * tracker server to have timed out.
 */
export const REQUEST_TIMEOUT = 15000

/**
 * Client destroy timeout. How long to wait before forcibly cleaning up all
 * pending requests, open sockets, etc.
 */
export const DESTROY_TIMEOUT = 1000

export function toUInt32 (n) {
  const buf = new Uint8Array(4)
  const view = new DataView(buf.buffer)
  view.setUint32(0, n)
  return buf
}

/**
 * `querystring.parse` using `unescape` instead of decodeURIComponent, since bittorrent
 * clients send non-UTF8 querystrings
 * @param  {string} q
 * @return {Object}
 */
export const querystringParse = q => querystring.parse(q, null, null, { decodeURIComponent: unescape })

/**
 * `querystring.stringify` using `escape` instead of encodeURIComponent, since bittorrent
 * clients send non-UTF8 querystrings
 * @param  {Object} obj
 * @return {string}
 */
export const querystringStringify = obj => {
  let ret = querystring.stringify(obj, null, null, { encodeURIComponent: escape })
  ret = ret.replace(/[@*/+]/g, char => // `escape` doesn't encode the characters @*/+ so we do it manually
  `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
  return ret
}

```

---

## Arquivo: `docs/bittorrent-tracker/common.js`

```js
/**
 * Functions/constants needed by both the client and server.
 */
import * as common from './common-node.js'
export * from './common-node.js'

export const DEFAULT_ANNOUNCE_PEERS = 50
export const MAX_ANNOUNCE_PEERS = 82

// HACK: Fix for WHATWG URL object not parsing non-standard URL schemes like
// 'udp:'. Just replace it with 'http:' since we only need a few properties.
//
// Note: Only affects Chrome and Firefox. Works fine in Node.js, Safari, and
// Edge.
//
// Note: UDP trackers aren't used in the normal browser build, but they are
// used in a Chrome App build (i.e. by Brave Browser).
//
// Bug reports:
// - Chrome: https://bugs.chromium.org/p/chromium/issues/detail?id=734880
// - Firefox: https://bugzilla.mozilla.org/show_bug.cgi?id=1374505
export const parseUrl = str => {
  const url = new URL(str.replace(/^udp:/, 'http:'))

  if (str.match(/^udp:/)) {
    Object.defineProperties(url, {
      href: { value: url.href.replace(/^http/, 'udp') },
      protocol: { value: url.protocol.replace(/^http/, 'udp') },
      origin: { value: url.origin.replace(/^http/, 'udp') }
    })
  }

  return url
}

export default {
  DEFAULT_ANNOUNCE_PEERS,
  MAX_ANNOUNCE_PEERS,
  parseUrl,
  ...common
}

```

---

## Arquivo: `docs/bittorrent-tracker/parse-websocket.js`

```js
import { bin2hex } from 'uint8-util'

import common from '../common.js'

export default function (socket, opts, params) {
  if (!opts) opts = {}
  params = JSON.parse(params) // may throw

  params.type = 'ws'
  params.socket = socket
  if (params.action === 'announce') {
    params.action = common.ACTIONS.ANNOUNCE

    if (typeof params.info_hash !== 'string' || params.info_hash.length !== 20) {
      throw new Error('invalid info_hash')
    }
    params.info_hash = bin2hex(params.info_hash)

    if (typeof params.peer_id !== 'string' || params.peer_id.length !== 20) {
      throw new Error('invalid peer_id')
    }
    params.peer_id = bin2hex(params.peer_id)

    if (params.answer) {
      if (typeof params.to_peer_id !== 'string' || params.to_peer_id.length !== 20) {
        throw new Error('invalid `to_peer_id` (required with `answer`)')
      }
      params.to_peer_id = bin2hex(params.to_peer_id)
    }

    params.left = Number(params.left)
    if (Number.isNaN(params.left)) params.left = Infinity

    params.numwant = Math.min(
      Number(params.offers && params.offers.length) || 0, // no default - explicit only
      common.MAX_ANNOUNCE_PEERS
    )
    params.compact = -1 // return full peer objects (used for websocket responses)
  } else if (params.action === 'scrape') {
    params.action = common.ACTIONS.SCRAPE

    if (typeof params.info_hash === 'string') params.info_hash = [params.info_hash]
    if (Array.isArray(params.info_hash)) {
      params.info_hash = params.info_hash.map(binaryInfoHash => {
        if (typeof binaryInfoHash !== 'string' || binaryInfoHash.length !== 20) {
          throw new Error('invalid info_hash')
        }
        return bin2hex(binaryInfoHash)
      })
    }
  } else {
    throw new Error(`invalid action in WS request: ${params.action}`)
  }

  // On first parse, save important data from `socket.upgradeReq` and delete it
  // to reduce memory usage.
  if (socket.upgradeReq) {
    if (opts.trustProxy) {
      if (socket.upgradeReq.headers['x-forwarded-for']) {
        const [realIp] = socket.upgradeReq.headers['x-forwarded-for'].split(',')
        socket.ip = realIp.trim()
      } else {
        socket.ip = socket.upgradeReq.connection.remoteAddress
      }
    } else {
      socket.ip = socket.upgradeReq.connection.remoteAddress.replace(common.REMOVE_IPV4_MAPPED_IPV6_RE, '') // force ipv4
    }

    socket.port = socket.upgradeReq.connection.remotePort
    if (socket.port) {
      socket.addr = `${common.IPV6_RE.test(socket.ip) ? `[${socket.ip}]` : socket.ip}:${socket.port}`
    }

    socket.headers = socket.upgradeReq.headers

    // Delete `socket.upgradeReq` when it is no longer needed to reduce memory usage
    socket.upgradeReq = null
  }

  params.ip = socket.ip
  params.port = socket.port
  params.addr = socket.addr
  params.headers = socket.headers

  return params
}

```

---

## Arquivo: `docs/bittorrent-tracker/server.js`

```js
import bencode from 'bencode'
import Debug from 'debug'
import dgram from 'dgram'
import EventEmitter from 'events'
import http from 'http'
import peerid from 'bittorrent-peerid'
import series from 'run-series'
import string2compact from 'string2compact'
import { WebSocketServer } from 'ws'
import { hex2bin } from 'uint8-util'

import common from './lib/common.js'
import Swarm from './lib/server/swarm.js'
import parseHttpRequest from './lib/server/parse-http.js'
import parseUdpRequest from './lib/server/parse-udp.js'
import parseWebSocketRequest from './lib/server/parse-websocket.js'

const debug = Debug('bittorrent-tracker:server')
const hasOwnProperty = Object.prototype.hasOwnProperty

/**
 * BitTorrent tracker server.
 *
 * HTTP service which responds to GET requests from torrent clients. Requests include
 * metrics from clients that help the tracker keep overall statistics about the torrent.
 * Responses include a peer list that helps the client participate in the torrent.
 *
 * @param {Object}  opts                options object
 * @param {Number}  opts.interval       tell clients to announce on this interval (ms)
 * @param {Number}  opts.trustProxy     trust 'x-forwarded-for' header from reverse proxy
 * @param {boolean|Object} opts.http    start an http server?, or options for http.createServer (default: true)
 * @param {boolean|Object} opts.udp     start a udp server?, or extra options for dgram.createSocket (default: true)
 * @param {boolean|Object} opts.ws      start a websocket server?, or extra options for new WebSocketServer (default: true)
 * @param {boolean} opts.stats          enable web-based statistics? (default: true)
 * @param {function} opts.filter        black/whitelist fn for disallowing/allowing torrents
 */
class Server extends EventEmitter {
  constructor (opts = {}) {
    super()
    debug('new server %s', JSON.stringify(opts))

    this.intervalMs = opts.interval
      ? opts.interval
      : 10 * 60 * 1000 // 10 min

    this._trustProxy = !!opts.trustProxy
    if (typeof opts.filter === 'function') this._filter = opts.filter

    this.peersCacheLength = opts.peersCacheLength
    this.peersCacheTtl = opts.peersCacheTtl

    this._listenCalled = false
    this.listening = false
    this.destroyed = false
    this.torrents = {}

    this.http = null
    this.udp4 = null
    this.udp6 = null
    this.ws = null

    // start an http tracker unless the user explicitly says no
    if (opts.http !== false) {
      this.http = http.createServer(isObject(opts.http) ? opts.http : undefined)
      this.http.on('error', err => { this._onError(err) })
      this.http.on('listening', onListening)

      // Add default http request handler on next tick to give user the chance to add
      // their own handler first. Handle requests untouched by user's handler.
      process.nextTick(() => {
        this.http.on('request', (req, res) => {
          if (res.headersSent) return
          this.onHttpRequest(req, res)
        })
      })
    }

    // start a udp tracker unless the user explicitly says no
    if (opts.udp !== false) {
      this.udp4 = this.udp = dgram.createSocket({
        type: 'udp4',
        reuseAddr: true,
        ...(isObject(opts.udp) ? opts.udp : undefined)
      })
      this.udp4.on('message', (msg, rinfo) => { this.onUdpRequest(msg, rinfo) })
      this.udp4.on('error', err => { this._onError(err) })
      this.udp4.on('listening', onListening)

      this.udp6 = dgram.createSocket({
        type: 'udp6',
        reuseAddr: true,
        ...(isObject(opts.udp) ? opts.udp : undefined)
      })
      this.udp6.on('message', (msg, rinfo) => { this.onUdpRequest(msg, rinfo) })
      this.udp6.on('error', err => { this._onError(err) })
      this.udp6.on('listening', onListening)
    }

    // start a websocket tracker (for WebTorrent) unless the user explicitly says no
    if (opts.ws !== false) {
      const noServer = isObject(opts.ws) && opts.ws.noServer
      if (!this.http && !noServer) {
        this.http = http.createServer()
        this.http.on('error', err => { this._onError(err) })
        this.http.on('listening', onListening)

        // Add default http request handler on next tick to give user the chance to add
        // their own handler first. Handle requests untouched by user's handler.
        process.nextTick(() => {
          this.http.on('request', (req, res) => {
            if (res.headersSent) return
            // For websocket trackers, we only need to handle the UPGRADE http method.
            // Return 404 for all other request types.
            res.statusCode = 404
            res.end('404 Not Found')
          })
        })
      }
      this.ws = new WebSocketServer({
        server: noServer ? undefined : this.http,
        perMessageDeflate: false,
        clientTracking: false,
        ...(isObject(opts.ws) ? opts.ws : undefined)
      })

      this.ws.address = () => {
        if (noServer) {
          throw new Error('address() unavailable with { noServer: true }')
        }
        return this.http.address()
      }

      this.ws.on('error', err => { this._onError(err) })
      this.ws.on('connection', (socket, req) => {
        // Note: socket.upgradeReq was removed in ws@3.0.0, so re-add it.
        // https://github.com/websockets/ws/pull/1099
        socket.upgradeReq = req
        this.onWebSocketConnection(socket)
      })
    }

    if (opts.stats !== false) {
      if (!this.http) {
        this.http = http.createServer()
        this.http.on('error', err => { this._onError(err) })
        this.http.on('listening', onListening)
      }

      // Http handler for '/stats' route
      this.http.on('request', (req, res) => {
        if (res.headersSent) return

        const infoHashes = Object.keys(this.torrents)
        let activeTorrents = 0
        const allPeers = {}

        function countPeers (filterFunction) {
          let count = 0
          let key

          for (key in allPeers) {
            if (hasOwnProperty.call(allPeers, key) && filterFunction(allPeers[key])) {
              count++
            }
          }

          return count
        }

        function groupByClient () {
          const clients = {}
          for (const key in allPeers) {
            if (hasOwnProperty.call(allPeers, key)) {
              const peer = allPeers[key]

              if (!clients[peer.client.client]) {
                clients[peer.client.client] = {}
              }
              const client = clients[peer.client.client]
              // If the client is not known show 8 chars from peerId as version
              const version = peer.client.version || Buffer.from(peer.peerId, 'hex').toString().substring(0, 8)
              if (!client[version]) {
                client[version] = 0
              }
              client[version]++
            }
          }
          return clients
        }

        function printClients (clients) {
          let html = '<ul>\n'
          for (const name in clients) {
            if (hasOwnProperty.call(clients, name)) {
              const client = clients[name]
              for (const version in client) {
                if (hasOwnProperty.call(client, version)) {
                  html += `<li><strong>${name}</strong> ${version} : ${client[version]}</li>\n`
                }
              }
            }
          }
          html += '</ul>'
          return html
        }

        if (req.method === 'GET' && (req.url === '/stats' || req.url === '/stats.json')) {
          infoHashes.forEach(infoHash => {
            const peers = this.torrents[infoHash].peers
            const keys = peers.keys
            if (keys.length > 0) activeTorrents++

            keys.forEach(peerId => {
              // Don't mark the peer as most recently used for stats
              const peer = peers.peek(peerId)
              if (peer == null) return // peers.peek() can evict the peer

              if (!hasOwnProperty.call(allPeers, peerId)) {
                allPeers[peerId] = {
                  ipv4: false,
                  ipv6: false,
                  seeder: false,
                  leecher: false
                }
              }

              if (peer.ip.includes(':')) {
                allPeers[peerId].ipv6 = true
              } else {
                allPeers[peerId].ipv4 = true
              }

              if (peer.complete) {
                allPeers[peerId].seeder = true
              } else {
                allPeers[peerId].leecher = true
              }

              allPeers[peerId].peerId = peer.peerId
              allPeers[peerId].client = peerid(peer.peerId)
            })
          })

          const isSeederOnly = peer => peer.seeder && peer.leecher === false
          const isLeecherOnly = peer => peer.leecher && peer.seeder === false
          const isSeederAndLeecher = peer => peer.seeder && peer.leecher
          const isIPv4 = peer => peer.ipv4
          const isIPv6 = peer => peer.ipv6

          const stats = {
            torrents: infoHashes.length,
            activeTorrents,
            peersAll: Object.keys(allPeers).length,
            peersSeederOnly: countPeers(isSeederOnly),
            peersLeecherOnly: countPeers(isLeecherOnly),
            peersSeederAndLeecher: countPeers(isSeederAndLeecher),
            peersIPv4: countPeers(isIPv4),
            peersIPv6: countPeers(isIPv6),
            clients: groupByClient()
          }

          if (req.url === '/stats.json' || req.headers.accept === 'application/json') {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(stats))
          } else if (req.url === '/stats') {
            res.setHeader('Content-Type', 'text/html')
            res.end(`
              <h1>${stats.torrents} torrents (${stats.activeTorrents} active)</h1>
              <h2>Connected Peers: ${stats.peersAll}</h2>
              <h3>Peers Seeding Only: ${stats.peersSeederOnly}</h3>
              <h3>Peers Leeching Only: ${stats.peersLeecherOnly}</h3>
              <h3>Peers Seeding & Leeching: ${stats.peersSeederAndLeecher}</h3>
              <h3>IPv4 Peers: ${stats.peersIPv4}</h3>
              <h3>IPv6 Peers: ${stats.peersIPv6}</h3>
              <h3>Clients:</h3>
              ${printClients(stats.clients)}
            `.replace(/^\s+/gm, '')) // trim left
          }
        }
      })
    }

    let num = !!this.http + !!this.udp4 + !!this.udp6
    const self = this
    function onListening () {
      num -= 1
      if (num === 0) {
        self.listening = true
        debug('listening')
        self.emit('listening')
      }
    }
  }

  _onError (err) {
    this.emit('error', err)
  }

  listen (...args) /* port, hostname, onlistening */{
    if (this._listenCalled || this.listening) throw new Error('server already listening')
    this._listenCalled = true

    const lastArg = args[args.length - 1]
    if (typeof lastArg === 'function') this.once('listening', lastArg)

    const port = toNumber(args[0]) || args[0] || 0
    const hostname = typeof args[1] !== 'function' ? args[1] : undefined

    debug('listen (port: %o hostname: %o)', port, hostname)

    const httpPort = isObject(port) ? (port.http || 0) : port
    const udpPort = isObject(port) ? (port.udp || 0) : port

    // binding to :: only receives IPv4 connections if the bindv6only sysctl is set 0,
    // which is the default on many operating systems
    const httpHostname = isObject(hostname) ? hostname.http : hostname
    const udp4Hostname = isObject(hostname) ? hostname.udp : hostname
    const udp6Hostname = isObject(hostname) ? hostname.udp6 : hostname

    if (this.http) this.http.listen(httpPort, httpHostname)
    if (this.udp4) this.udp4.bind(udpPort, udp4Hostname)
    if (this.udp6) this.udp6.bind(udpPort, udp6Hostname)
  }

  close (cb = noop) {
    debug('close')

    this.listening = false
    this.destroyed = true

    if (this.udp4) {
      try {
        this.udp4.close()
      } catch (err) {}
    }

    if (this.udp6) {
      try {
        this.udp6.close()
      } catch (err) {}
    }

    if (this.ws) {
      try {
        this.ws.close()
      } catch (err) {}
    }

    if (this.http) this.http.close(cb)
    else cb(null)
  }

  createSwarm (infoHash, cb) {
    if (ArrayBuffer.isView(infoHash)) infoHash = infoHash.toString('hex')

    process.nextTick(() => {
      const swarm = this.torrents[infoHash] = new Server.Swarm(infoHash, this)
      cb(null, swarm)
    })
  }

  getSwarm (infoHash, cb) {
    if (ArrayBuffer.isView(infoHash)) infoHash = infoHash.toString('hex')

    process.nextTick(() => {
      cb(null, this.torrents[infoHash])
    })
  }

  onHttpRequest (req, res, opts = {}) {
    opts.trustProxy = opts.trustProxy || this._trustProxy

    let params
    try {
      params = parseHttpRequest(req, opts)
      params.httpReq = req
      params.httpRes = res
    } catch (err) {
      res.end(bencode.encode({
        'failure reason': err.message
      }))

      // even though it's an error for the client, it's just a warning for the server.
      // don't crash the server because a client sent bad data :)
      this.emit('warning', err)
      return
    }

    this._onRequest(params, (err, response) => {
      if (err) {
        this.emit('warning', err)
        response = {
          'failure reason': err.message
        }
      }
      if (this.destroyed) return res.end()

      delete response.action // only needed for UDP encoding
      res.end(bencode.encode(response))

      if (params.action === common.ACTIONS.ANNOUNCE) {
        this.emit(common.EVENT_NAMES[params.event], params.addr, params)
      }
    })
  }

  onUdpRequest (msg, rinfo) {
    let params
    try {
      params = parseUdpRequest(msg, rinfo)
    } catch (err) {
      this.emit('warning', err)
      // Do not reply for parsing errors
      return
    }

    this._onRequest(params, (err, response) => {
      if (err) {
        this.emit('warning', err)
        response = {
          action: common.ACTIONS.ERROR,
          'failure reason': err.message
        }
      }
      if (this.destroyed) return

      response.transactionId = params.transactionId
      response.connectionId = params.connectionId

      const buf = makeUdpPacket(response)

      try {
        const udp = (rinfo.family === 'IPv4') ? this.udp4 : this.udp6
        udp.send(buf, 0, buf.length, rinfo.port, rinfo.address)
      } catch (err) {
        this.emit('warning', err)
      }

      if (params.action === common.ACTIONS.ANNOUNCE) {
        this.emit(common.EVENT_NAMES[params.event], params.addr, params)
      }
    })
  }

  onWebSocketConnection (socket, opts = {}) {
    opts.trustProxy = opts.trustProxy || this._trustProxy

    socket.peerId = null // as hex
    socket.infoHashes = [] // swarms that this socket is participating in
    socket.onSend = err => {
      this._onWebSocketSend(socket, err)
    }

    socket.onMessageBound = params => {
      this._onWebSocketRequest(socket, opts, params)
    }
    socket.on('message', socket.onMessageBound)

    socket.onErrorBound = err => {
      this._onWebSocketError(socket, err)
    }
    socket.on('error', socket.onErrorBound)

    socket.onCloseBound = () => {
      this._onWebSocketClose(socket)
    }
    socket.on('close', socket.onCloseBound)
  }

  _onWebSocketRequest (socket, opts, params) {
    try {
      params = parseWebSocketRequest(socket, opts, params)
    } catch (err) {
      socket.send(JSON.stringify({
        'failure reason': err.message
      }), socket.onSend)

      // even though it's an error for the client, it's just a warning for the server.
      // don't crash the server because a client sent bad data :)
      this.emit('warning', err)
      return
    }

    if (!socket.peerId) socket.peerId = params.peer_id // as hex

    this._onRequest(params, (err, response) => {
      if (this.destroyed || socket.destroyed) return
      if (err) {
        socket.send(JSON.stringify({
          action: params.action === common.ACTIONS.ANNOUNCE ? 'announce' : 'scrape',
          'failure reason': err.message,
          info_hash: hex2bin(params.info_hash)
        }), socket.onSend)

        this.emit('warning', err)
        return
      }

      response.action = params.action === common.ACTIONS.ANNOUNCE ? 'announce' : 'scrape'

      let peers
      if (response.action === 'announce') {
        peers = response.peers
        delete response.peers

        if (!socket.infoHashes.includes(params.info_hash)) {
          socket.infoHashes.push(params.info_hash)
        }

        response.info_hash = hex2bin(params.info_hash)

        // WebSocket tracker should have a shorter interval – default: 2 minutes
        response.interval = Math.ceil(this.intervalMs / 1000 / 5)
      }

      // Skip sending update back for 'answer' announce messages – not needed
      if (!params.answer) {
        socket.send(JSON.stringify(response), socket.onSend)
        debug('sent response %s to %s', JSON.stringify(response), params.peer_id)
      }

      if (Array.isArray(params.offers)) {
        debug('got %s offers from %s', params.offers.length, params.peer_id)
        debug('got %s peers from swarm %s', peers.length, params.info_hash)
        peers.forEach((peer, i) => {
          peer.socket.send(JSON.stringify({
            action: 'announce',
            offer: params.offers[i].offer,
            offer_id: params.offers[i].offer_id,
            peer_id: hex2bin(params.peer_id),
            info_hash: hex2bin(params.info_hash)
          }), peer.socket.onSend)
          debug('sent offer to %s from %s', peer.peerId, params.peer_id)
        })
      }

      const done = () => {
        // emit event once the announce is fully "processed"
        if (params.action === common.ACTIONS.ANNOUNCE) {
          this.emit(common.EVENT_NAMES[params.event], params.peer_id, params)
        }
      }

      if (params.answer) {
        debug('got answer %s from %s', JSON.stringify(params.answer), params.peer_id)

        this.getSwarm(params.info_hash, (err, swarm) => {
          if (this.destroyed) return
          if (err) return this.emit('warning', err)
          if (!swarm) {
            return this.emit('warning', new Error('no swarm with that `info_hash`'))
          }
          // Mark the destination peer as recently used in cache
          const toPeer = swarm.peers.get(params.to_peer_id)
          if (!toPeer) {
            return this.emit('warning', new Error('no peer with that `to_peer_id`'))
          }

          toPeer.socket.send(JSON.stringify({
            action: 'announce',
            answer: params.answer,
            offer_id: params.offer_id,
            peer_id: hex2bin(params.peer_id),
            info_hash: hex2bin(params.info_hash)
          }), toPeer.socket.onSend)
          debug('sent answer to %s from %s', toPeer.peerId, params.peer_id)

          done()
        })
      } else {
        done()
      }
    })
  }

  _onWebSocketSend (socket, err) {
    if (err) this._onWebSocketError(socket, err)
  }

  _onWebSocketClose (socket) {
    debug('websocket close %s', socket.peerId)
    socket.destroyed = true

    if (socket.peerId) {
      socket.infoHashes.slice(0).forEach(infoHash => {
        const swarm = this.torrents[infoHash]
        if (swarm) {
          swarm.announce({
            type: 'ws',
            event: 'stopped',
            numwant: 0,
            peer_id: socket.peerId
          })
        }
      })
    }

    // ignore all future errors
    socket.onSend = noop
    socket.on('error', noop)

    socket.peerId = null
    socket.infoHashes = null

    if (typeof socket.onMessageBound === 'function') {
      socket.removeListener('message', socket.onMessageBound)
    }
    socket.onMessageBound = null

    if (typeof socket.onErrorBound === 'function') {
      socket.removeListener('error', socket.onErrorBound)
    }
    socket.onErrorBound = null

    if (typeof socket.onCloseBound === 'function') {
      socket.removeListener('close', socket.onCloseBound)
    }
    socket.onCloseBound = null
  }

  _onWebSocketError (socket, err) {
    debug('websocket error %s', err.message || err)
    this.emit('warning', err)
    this._onWebSocketClose(socket)
  }

  _onRequest (params, cb) {
    if (params && params.action === common.ACTIONS.CONNECT) {
      cb(null, { action: common.ACTIONS.CONNECT })
    } else if (params && params.action === common.ACTIONS.ANNOUNCE) {
      this._onAnnounce(params, cb)
    } else if (params && params.action === common.ACTIONS.SCRAPE) {
      this._onScrape(params, cb)
    } else {
      cb(new Error('Invalid action'))
    }
  }

  _onAnnounce (params, cb) {
    const self = this

    if (this._filter) {
      this._filter(params.info_hash, params, err => {
        // Presence of `err` means that this announce request is disallowed
        if (err) return cb(err)

        getOrCreateSwarm((err, swarm) => {
          if (err) return cb(err)
          announce(swarm)
        })
      })
    } else {
      getOrCreateSwarm((err, swarm) => {
        if (err) return cb(err)
        announce(swarm)
      })
    }

    // Get existing swarm, or create one if one does not exist
    function getOrCreateSwarm (cb) {
      self.getSwarm(params.info_hash, (err, swarm) => {
        if (err) return cb(err)
        if (swarm) return cb(null, swarm)
        self.createSwarm(params.info_hash, (err, swarm) => {
          if (err) return cb(err)
          cb(null, swarm)
        })
      })
    }

    function announce (swarm) {
      if (!params.event || params.event === 'empty') params.event = 'update'
      swarm.announce(params, (err, response) => {
        if (err) return cb(err)

        if (!response.action) response.action = common.ACTIONS.ANNOUNCE
        if (!response.interval) response.interval = Math.ceil(self.intervalMs / 1000)

        if (params.compact === 1) {
          const peers = response.peers

          // Find IPv4 peers
          response.peers = string2compact(peers.filter(peer => common.IPV4_RE.test(peer.ip)).map(peer => `${peer.ip}:${peer.port}`))
          // Find IPv6 peers
          response.peers6 = string2compact(peers.filter(peer => common.IPV6_RE.test(peer.ip)).map(peer => `[${peer.ip}]:${peer.port}`))
        } else if (params.compact === 0) {
          // IPv6 peers are not separate for non-compact responses
          response.peers = response.peers.map(peer => ({
            'peer id': hex2bin(peer.peerId),
            ip: peer.ip,
            port: peer.port
          }))
        } // else, return full peer objects (used for websocket responses)

        cb(null, response)
      })
    }
  }

  _onScrape (params, cb) {
    if (params.info_hash == null) {
      // if info_hash param is omitted, stats for all torrents are returned
      // TODO: make this configurable!
      params.info_hash = Object.keys(this.torrents)
    }

    series(params.info_hash.map(infoHash => cb => {
      this.getSwarm(infoHash, (err, swarm) => {
        if (err) return cb(err)
        if (swarm) {
          swarm.scrape(params, (err, scrapeInfo) => {
            if (err) return cb(err)
            cb(null, {
              infoHash,
              complete: (scrapeInfo && scrapeInfo.complete) || 0,
              incomplete: (scrapeInfo && scrapeInfo.incomplete) || 0
            })
          })
        } else {
          cb(null, { infoHash, complete: 0, incomplete: 0 })
        }
      })
    }), (err, results) => {
      if (err) return cb(err)

      const response = {
        action: common.ACTIONS.SCRAPE,
        files: {},
        flags: { min_request_interval: Math.ceil(this.intervalMs / 1000) }
      }

      results.forEach(result => {
        response.files[hex2bin(result.infoHash)] = {
          complete: result.complete || 0,
          incomplete: result.incomplete || 0,
          downloaded: result.complete || 0 // TODO: this only provides a lower-bound
        }
      })

      cb(null, response)
    })
  }
}

Server.Swarm = Swarm

function makeUdpPacket (params) {
  let packet
  switch (params.action) {
    case common.ACTIONS.CONNECT: {
      packet = Buffer.concat([
        common.toUInt32(common.ACTIONS.CONNECT),
        common.toUInt32(params.transactionId),
        params.connectionId
      ])
      break
    }
    case common.ACTIONS.ANNOUNCE: {
      packet = Buffer.concat([
        common.toUInt32(common.ACTIONS.ANNOUNCE),
        common.toUInt32(params.transactionId),
        common.toUInt32(params.interval),
        common.toUInt32(params.incomplete),
        common.toUInt32(params.complete),
        params.peers
      ])
      break
    }
    case common.ACTIONS.SCRAPE: {
      const scrapeResponse = [
        common.toUInt32(common.ACTIONS.SCRAPE),
        common.toUInt32(params.transactionId)
      ]
      for (const infoHash in params.files) {
        const file = params.files[infoHash]
        scrapeResponse.push(
          common.toUInt32(file.complete),
          common.toUInt32(file.downloaded), // TODO: this only provides a lower-bound
          common.toUInt32(file.incomplete)
        )
      }
      packet = Buffer.concat(scrapeResponse)
      break
    }
    case common.ACTIONS.ERROR: {
      packet = Buffer.concat([
        common.toUInt32(common.ACTIONS.ERROR),
        common.toUInt32(params.transactionId || 0),
        Buffer.from(String(params['failure reason']))
      ])
      break
    }
    default:
      throw new Error(`Action not implemented: ${params.action}`)
  }
  return packet
}

function isObject (obj) {
  return typeof obj === 'object' && obj !== null
}

function toNumber (x) {
  x = Number(x)
  return x >= 0 ? x : false
}

function noop () {}

export default Server

```

---

## Arquivo: `docs/bittorrent-tracker/server_test.js`

```js
import Client from '../index.js'
import common from './common.js'
import test from 'tape'
import wrtc from 'webrtc-polyfill'

const infoHash = '4cb67059ed6bd08362da625b3ae77f6f4a075705'
const peerId = Buffer.from('01234567890123456789')
const peerId2 = Buffer.from('12345678901234567890')
const peerId3 = Buffer.from('23456789012345678901')

function serverTest (t, serverType, serverFamily) {
  t.plan(40)

  const hostname = serverFamily === 'inet6'
    ? '[::1]'
    : '127.0.0.1'
  const clientIp = serverFamily === 'inet6'
    ? '::1'
    : '127.0.0.1'

  const opts = {
    serverType
  }

  common.createServer(t, opts, server => {
    // Not using announceUrl param from `common.createServer()` since we
    // want to control IPv4 vs IPv6.
    const port = server[serverType].address().port
    const announceUrl = `${serverType}://${hostname}:${port}/announce`

    const client1 = new Client({
      infoHash,
      announce: [announceUrl],
      peerId,
      port: 6881,
      wrtc
    })
    if (serverType === 'ws') common.mockWebsocketTracker(client1)

    client1.start()

    server.once('start', () => {
      t.pass('got start message from client1')
    })

    client1.once('update', data => {
      t.equal(data.announce, announceUrl)
      t.equal(data.complete, 0)
      t.equal(data.incomplete, 1)

      server.getSwarm(infoHash, (err, swarm) => {
        t.error(err)

        t.equal(Object.keys(server.torrents).length, 1)
        t.equal(swarm.complete, 0)
        t.equal(swarm.incomplete, 1)
        t.equal(swarm.peers.length, 1)

        const id = serverType === 'ws'
          ? peerId.toString('hex')
          : `${hostname}:6881`

        const peer = swarm.peers.peek(id)
        t.equal(peer.type, serverType)
        t.equal(peer.ip, clientIp)
        t.equal(peer.peerId, peerId.toString('hex'))
        t.equal(peer.complete, false)
        if (serverType === 'ws') {
          t.equal(typeof peer.port, 'number')
          t.ok(peer.socket)
        } else {
          t.equal(peer.port, 6881)
          t.notOk(peer.socket)
        }

        client1.complete()

        client1.once('update', data => {
          t.equal(data.announce, announceUrl)
          t.equal(data.complete, 1)
          t.equal(data.incomplete, 0)

          client1.scrape()

          client1.once('scrape', data => {
            t.equal(data.announce, announceUrl)
            t.equal(data.complete, 1)
            t.equal(data.incomplete, 0)
            t.equal(typeof data.downloaded, 'number')

            const client2 = new Client({
              infoHash,
              announce: [announceUrl],
              peerId: peerId2,
              port: 6882,
              wrtc
            })
            if (serverType === 'ws') common.mockWebsocketTracker(client2)

            client2.start()

            server.once('start', () => {
              t.pass('got start message from client2')
            })

            client2.once('update', data => {
              t.equal(data.announce, announceUrl)
              t.equal(data.complete, 1)
              t.equal(data.incomplete, 1)

              const client3 = new Client({
                infoHash,
                announce: [announceUrl],
                peerId: peerId3,
                port: 6880,
                wrtc
              })
              if (serverType === 'ws') common.mockWebsocketTracker(client3)

              client3.start()

              server.once('start', () => {
                t.pass('got start message from client3')
              })

              client3.once('update', data => {
                t.equal(data.announce, announceUrl)
                t.equal(data.complete, 1)
                t.equal(data.incomplete, 2)

                client2.stop()
                client2.once('update', data => {
                  t.equal(data.announce, announceUrl)
                  t.equal(data.complete, 1)
                  t.equal(data.incomplete, 1)

                  client2.destroy(() => {
                    t.pass('client2 destroyed')
                    client3.stop()
                    client3.once('update', data => {
                      t.equal(data.announce, announceUrl)
                      t.equal(data.complete, 1)
                      t.equal(data.incomplete, 0)

                      client1.destroy(() => {
                        t.pass('client1 destroyed')
                      })

                      client3.destroy(() => {
                        t.pass('client3 destroyed')
                      })

                      server.close(() => {
                        t.pass('server destroyed')
                      })
                    })
                  })
                })
              })
            })
          })
        })
      })
    })
  })
}

test('http ipv4 server', t => {
  serverTest(t, 'http', 'inet')
})

test('http ipv6 server', t => {
  serverTest(t, 'http', 'inet6')
})

test('udp server', t => {
  serverTest(t, 'udp', 'inet')
})

test('ws server', t => {
  serverTest(t, 'ws', 'inet')
})

```

---

## Arquivo: `docs/bittorrent-tracker/swarm.js`

```js
import arrayRemove from 'unordered-array-remove'
import Debug from 'debug'
import LRU from 'lru'
import randomIterate from 'random-iterate'

const debug = Debug('bittorrent-tracker:swarm')

// Regard this as the default implementation of an interface that you
// need to support when overriding Server.createSwarm() and Server.getSwarm()
class Swarm {
  constructor (infoHash, server) {
    const self = this
    self.infoHash = infoHash
    self.complete = 0
    self.incomplete = 0

    self.peers = new LRU({
      max: server.peersCacheLength || 1000,
      maxAge: server.peersCacheTtl || 20 * 60 * 1000 // 20 minutes
    })

    // When a peer is evicted from the LRU store, send a synthetic 'stopped' event
    // so the stats get updated correctly.
    self.peers.on('evict', data => {
      const peer = data.value
      const params = {
        type: peer.type,
        event: 'stopped',
        numwant: 0,
        peer_id: peer.peerId
      }
      self._onAnnounceStopped(params, peer, peer.peerId)
      peer.socket = null
    })
  }

  announce (params, cb) {
    const self = this
    const id = params.type === 'ws' ? params.peer_id : params.addr
    // Mark the source peer as recently used in cache
    const peer = self.peers.get(id)

    if (params.event === 'started') {
      self._onAnnounceStarted(params, peer, id)
    } else if (params.event === 'stopped') {
      self._onAnnounceStopped(params, peer, id)
      if (!cb) return // when websocket is closed
    } else if (params.event === 'completed') {
      self._onAnnounceCompleted(params, peer, id)
    } else if (params.event === 'update') {
      self._onAnnounceUpdate(params, peer, id)
    } else if (params.event === 'paused') {
      self._onAnnouncePaused(params, peer, id)
    } else {
      cb(new Error('invalid event'))
      return
    }
    cb(null, {
      complete: self.complete,
      incomplete: self.incomplete,
      peers: self._getPeers(params.numwant, params.peer_id, !!params.socket)
    })
  }

  scrape (params, cb) {
    cb(null, {
      complete: this.complete,
      incomplete: this.incomplete
    })
  }

  _onAnnounceStarted (params, peer, id) {
    if (peer) {
      debug('unexpected `started` event from peer that is already in swarm')
      return this._onAnnounceUpdate(params, peer, id) // treat as an update
    }

    if (params.left === 0) this.complete += 1
    else this.incomplete += 1
    this.peers.set(id, {
      type: params.type,
      complete: params.left === 0,
      peerId: params.peer_id, // as hex
      ip: params.ip,
      port: params.port,
      socket: params.socket // only websocket
    })
  }

  _onAnnounceStopped (params, peer, id) {
    if (!peer) {
      debug('unexpected `stopped` event from peer that is not in swarm')
      return // do nothing
    }

    if (peer.complete) this.complete -= 1
    else this.incomplete -= 1

    // If it's a websocket, remove this swarm's infohash from the list of active
    // swarms that this peer is participating in.
    if (peer.socket && !peer.socket.destroyed) {
      const index = peer.socket.infoHashes.indexOf(this.infoHash)
      arrayRemove(peer.socket.infoHashes, index)
    }

    this.peers.remove(id)
  }

  _onAnnounceCompleted (params, peer, id) {
    if (!peer) {
      debug('unexpected `completed` event from peer that is not in swarm')
      return this._onAnnounceStarted(params, peer, id) // treat as a start
    }
    if (peer.complete) {
      debug('unexpected `completed` event from peer that is already completed')
      return this._onAnnounceUpdate(params, peer, id) // treat as an update
    }

    this.complete += 1
    this.incomplete -= 1
    peer.complete = true
    this.peers.set(id, peer)
  }

  _onAnnounceUpdate (params, peer, id) {
    if (!peer) {
      debug('unexpected `update` event from peer that is not in swarm')
      return this._onAnnounceStarted(params, peer, id) // treat as a start
    }

    if (!peer.complete && params.left === 0) {
      this.complete += 1
      this.incomplete -= 1
      peer.complete = true
    }
    this.peers.set(id, peer)
  }

  _onAnnouncePaused (params, peer, id) {
    if (!peer) {
      debug('unexpected `paused` event from peer that is not in swarm')
      return this._onAnnounceStarted(params, peer, id) // treat as a start
    }

    this._onAnnounceUpdate(params, peer, id)
  }

  _getPeers (numwant, ownPeerId, isWebRTC) {
    const peers = []
    const ite = randomIterate(this.peers.keys)
    let peerId
    while ((peerId = ite()) && peers.length < numwant) {
      // Don't mark the peer as most recently used on announce
      const peer = this.peers.peek(peerId)
      if (!peer) continue
      if (isWebRTC && peer.peerId === ownPeerId) continue // don't send peer to itself
      if ((isWebRTC && peer.type !== 'ws') || (!isWebRTC && peer.type === 'ws')) continue // send proper peer type
      peers.push(peer)
    }
    return peers
  }
}

export default Swarm

```

---

## Arquivo: `docs/bittorrent-tracker/websocket-tracker.js`

```js
import Debug from 'debug'
import Peer from '@thaunknown/simple-peer/lite.js'
import Socket from '@thaunknown/simple-websocket'
import { arr2text, arr2hex, hex2bin, bin2hex, randomBytes } from 'uint8-util'

import common from '../common.js'
import Tracker from './tracker.js'

const debug = Debug('bittorrent-tracker:websocket-tracker')

// Use a socket pool, so tracker clients share WebSocket objects for the same server.
// In practice, WebSockets are pretty slow to establish, so this gives a nice performance
// boost, and saves browser resources.
const socketPool = {}

const RECONNECT_MINIMUM = 10 * 1000
const RECONNECT_MAXIMUM = 60 * 60 * 1000
const RECONNECT_VARIANCE = 5 * 60 * 1000
const OFFER_TIMEOUT = 50 * 1000

class WebSocketTracker extends Tracker {
  constructor (client, announceUrl) {
    super(client, announceUrl)
    debug('new websocket tracker %s', announceUrl)

    this.peers = {} // peers (offer id -> peer)
    this.socket = null

    this.reconnecting = false
    this.retries = 0
    this.reconnectTimer = null

    // Simple boolean flag to track whether the socket has received data from
    // the websocket server since the last time socket.send() was called.
    this.expectingResponse = false

    this._openSocket()
  }

  announce (opts) {
    if (this.destroyed || this.reconnecting) return
    if (!this.socket.connected) {
      this.socket.once('connect', () => {
        this.announce(opts)
      })
      return
    }

    const params = Object.assign({}, opts, {
      action: 'announce',
      info_hash: this.client._infoHashBinary,
      peer_id: this.client._peerIdBinary
    })
    if (this._trackerId) params.trackerid = this._trackerId

    if (opts.event === 'stopped' || opts.event === 'completed') {
      // Don't include offers with 'stopped' or 'completed' event
      this._send(params)
    } else {
      // Limit the number of offers that are generated, since it can be slow
      const numwant = Math.min(opts.numwant, 5)

      this._generateOffers(numwant, offers => {
        params.numwant = numwant
        params.offers = offers
        this._send(params)
      })
    }
  }

  scrape (opts) {
    if (this.destroyed || this.reconnecting) return
    if (!this.socket.connected) {
      this.socket.once('connect', () => {
        this.scrape(opts)
      })
      return
    }

    const infoHashes = (Array.isArray(opts.infoHash) && opts.infoHash.length > 0)
      ? opts.infoHash.map(infoHash => hex2bin(infoHash))
      : (opts.infoHash && hex2bin(opts.infoHash)) || this.client._infoHashBinary
    const params = {
      action: 'scrape',
      info_hash: infoHashes
    }

    this._send(params)
  }

  destroy (cb = noop) {
    if (this.destroyed) return cb(null)

    this.destroyed = true

    clearInterval(this.interval)
    clearTimeout(this.reconnectTimer)

    // Destroy peers
    for (const peerId in this.peers) {
      const peer = this.peers[peerId]
      clearTimeout(peer.trackerTimeout)
      peer.destroy()
    }
    this.peers = null

    if (this.socket) {
      this.socket.removeListener('connect', this._onSocketConnectBound)
      this.socket.removeListener('data', this._onSocketDataBound)
      this.socket.removeListener('close', this._onSocketCloseBound)
      this.socket.removeListener('error', this._onSocketErrorBound)
      this.socket = null
    }

    this._onSocketConnectBound = null
    this._onSocketErrorBound = null
    this._onSocketDataBound = null
    this._onSocketCloseBound = null

    if (socketPool[this.announceUrl]) {
      socketPool[this.announceUrl].consumers -= 1
    }

    // Other instances are using the socket, so there's nothing left to do here
    if (socketPool[this.announceUrl].consumers > 0) return cb()

    let socket = socketPool[this.announceUrl]
    delete socketPool[this.announceUrl]
    socket.on('error', noop) // ignore all future errors
    socket.once('close', cb)

    let timeout

    // If there is no data response expected, destroy immediately.
    if (!this.expectingResponse) return destroyCleanup()

    // Otherwise, wait a short time for potential responses to come in from the
    // server, then force close the socket.
    timeout = setTimeout(destroyCleanup, common.DESTROY_TIMEOUT)

    // But, if a response comes from the server before the timeout fires, do cleanup
    // right away.
    socket.once('data', destroyCleanup)

    function destroyCleanup () {
      if (timeout) {
        clearTimeout(timeout)
        timeout = null
      }
      socket.removeListener('data', destroyCleanup)
      socket.destroy()
      socket = null
    }
  }

  _openSocket () {
    this.destroyed = false

    if (!this.peers) this.peers = {}

    this._onSocketConnectBound = () => {
      this._onSocketConnect()
    }
    this._onSocketErrorBound = err => {
      this._onSocketError(err)
    }
    this._onSocketDataBound = data => {
      this._onSocketData(data)
    }
    this._onSocketCloseBound = () => {
      this._onSocketClose()
    }

    this.socket = socketPool[this.announceUrl]
    if (this.socket) {
      socketPool[this.announceUrl].consumers += 1
      if (this.socket.connected) {
        this._onSocketConnectBound()
      }
    } else {
      const parsedUrl = new URL(this.announceUrl)
      let agent
      if (this.client._proxyOpts) {
        agent = parsedUrl.protocol === 'wss:' ? this.client._proxyOpts.httpsAgent : this.client._proxyOpts.httpAgent
        if (!agent && this.client._proxyOpts.socksProxy) {
          agent = this.client._proxyOpts.socksProxy
        }
      }
      this.socket = socketPool[this.announceUrl] = new Socket({ url: this.announceUrl, agent })
      this.socket.consumers = 1
      this.socket.once('connect', this._onSocketConnectBound)
    }

    this.socket.on('data', this._onSocketDataBound)
    this.socket.once('close', this._onSocketCloseBound)
    this.socket.once('error', this._onSocketErrorBound)
  }

  _onSocketConnect () {
    if (this.destroyed) return

    if (this.reconnecting) {
      this.reconnecting = false
      this.retries = 0
      this.announce(this.client._defaultAnnounceOpts())
    }
  }

  _onSocketData (data) {
    if (this.destroyed) return

    this.expectingResponse = false

    try {
      data = JSON.parse(arr2text(data))
    } catch (err) {
      this.client.emit('warning', new Error('Invalid tracker response'))
      return
    }

    if (data.action === 'announce') {
      this._onAnnounceResponse(data)
    } else if (data.action === 'scrape') {
      this._onScrapeResponse(data)
    } else {
      this._onSocketError(new Error(`invalid action in WS response: ${data.action}`))
    }
  }

  _onAnnounceResponse (data) {
    if (data.info_hash !== this.client._infoHashBinary) {
      debug(
        'ignoring websocket data from %s for %s (looking for %s: reused socket)',
        this.announceUrl, bin2hex(data.info_hash), this.client.infoHash
      )
      return
    }

    if (data.peer_id && data.peer_id === this.client._peerIdBinary) {
      // ignore offers/answers from this client
      return
    }

    debug(
      'received %s from %s for %s',
      JSON.stringify(data), this.announceUrl, this.client.infoHash
    )

    const failure = data['failure reason']
    if (failure) return this.client.emit('warning', new Error(failure))

    const warning = data['warning message']
    if (warning) this.client.emit('warning', new Error(warning))

    const interval = data.interval || data['min interval']
    if (interval) this.setInterval(interval * 1000)

    const trackerId = data['tracker id']
    if (trackerId) {
      // If absent, do not discard previous trackerId value
      this._trackerId = trackerId
    }

    if (data.complete != null) {
      const response = Object.assign({}, data, {
        announce: this.announceUrl,
        infoHash: bin2hex(data.info_hash)
      })
      this.client.emit('update', response)
    }

    let peer
    if (data.offer && data.peer_id) {
      debug('creating peer (from remote offer)')
      peer = this._createPeer()
      peer.id = bin2hex(data.peer_id)
      peer.once('signal', answer => {
        const params = {
          action: 'announce',
          info_hash: this.client._infoHashBinary,
          peer_id: this.client._peerIdBinary,
          to_peer_id: data.peer_id,
          answer,
          offer_id: data.offer_id
        }
        if (this._trackerId) params.trackerid = this._trackerId
        this._send(params)
      })
      this.client.emit('peer', peer)
      peer.signal(data.offer)
    }

    if (data.answer && data.peer_id) {
      const offerId = bin2hex(data.offer_id)
      peer = this.peers[offerId]
      if (peer) {
        peer.id = bin2hex(data.peer_id)
        this.client.emit('peer', peer)
        peer.signal(data.answer)

        clearTimeout(peer.trackerTimeout)
        peer.trackerTimeout = null
        delete this.peers[offerId]
      } else {
        debug(`got unexpected answer: ${JSON.stringify(data.answer)}`)
      }
    }
  }

  _onScrapeResponse (data) {
    data = data.files || {}

    const keys = Object.keys(data)
    if (keys.length === 0) {
      this.client.emit('warning', new Error('invalid scrape response'))
      return
    }

    keys.forEach(infoHash => {
      // TODO: optionally handle data.flags.min_request_interval
      // (separate from announce interval)
      const response = Object.assign(data[infoHash], {
        announce: this.announceUrl,
        infoHash: bin2hex(infoHash)
      })
      this.client.emit('scrape', response)
    })
  }

  _onSocketClose () {
    if (this.destroyed) return
    this.destroy()
    this._startReconnectTimer()
  }

  _onSocketError (err) {
    if (this.destroyed) return
    this.destroy()
    // errors will often happen if a tracker is offline, so don't treat it as fatal
    this.client.emit('warning', err)
    this._startReconnectTimer()
  }

  _startReconnectTimer () {
    const ms = Math.floor(Math.random() * RECONNECT_VARIANCE) + Math.min(Math.pow(2, this.retries) * RECONNECT_MINIMUM, RECONNECT_MAXIMUM)

    this.reconnecting = true
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => {
      this.retries++
      this._openSocket()
    }, ms)
    if (this.reconnectTimer.unref) this.reconnectTimer.unref()

    debug('reconnecting socket in %s ms', ms)
  }

  _send (params) {
    if (this.destroyed) return
    this.expectingResponse = true
    const message = JSON.stringify(params)
    debug('send %s', message)
    this.socket.send(message)
  }

  _generateOffers (numwant, cb) {
    const self = this
    const offers = []
    debug('generating %s offers', numwant)

    for (let i = 0; i < numwant; ++i) {
      generateOffer()
    }
    checkDone()

    function generateOffer () {
      const offerId = arr2hex(randomBytes(20))
      debug('creating peer (from _generateOffers)')
      const peer = self.peers[offerId] = self._createPeer({ initiator: true })
      peer.once('signal', offer => {
        offers.push({
          offer,
          offer_id: hex2bin(offerId)
        })
        checkDone()
      })
      peer.trackerTimeout = setTimeout(() => {
        debug('tracker timeout: destroying peer')
        peer.trackerTimeout = null
        delete self.peers[offerId]
        peer.destroy()
      }, OFFER_TIMEOUT)
      if (peer.trackerTimeout.unref) peer.trackerTimeout.unref()
    }

    function checkDone () {
      if (offers.length === numwant) {
        debug('generated %s offers', numwant)
        cb(offers)
      }
    }
  }

  _createPeer (opts) {
    const self = this

    opts = Object.assign({
      trickle: false,
      config: self.client._rtcConfig,
      wrtc: self.client._wrtc
    }, opts)

    const peer = new Peer(opts)

    peer.once('error', onError)
    peer.once('connect', onConnect)

    return peer

    // Handle peer 'error' events that are fired *before* the peer is emitted in
    // a 'peer' event.
    function onError (err) {
      self.client.emit('warning', new Error(`Connection error: ${err.message}`))
      peer.destroy()
    }

    // Once the peer is emitted in a 'peer' event, then it's the consumer's
    // responsibility to listen for errors, so the listeners are removed here.
    function onConnect () {
      peer.removeListener('error', onError)
      peer.removeListener('connect', onConnect)
    }
  }
}

WebSocketTracker.prototype.DEFAULT_ANNOUNCE_INTERVAL = 30 * 1000 // 30 seconds
// Normally this shouldn't be accessed but is occasionally useful
WebSocketTracker._socketPool = socketPool

function noop () {}

export default WebSocketTracker

```

---

