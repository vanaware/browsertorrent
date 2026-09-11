import { sha1 } from '~/src/util/hash.ts'

const DEFAULT_ROTATION_INTERVAL_MS = 5 * 60 * 1000
const SECRET_LENGTH = 32
const textEncoder = new TextEncoder()

type TokenManagerOptions = {
  rotationIntervalMs?: number
  now?: () => number
  secretFactory?: () => Uint8Array
}

/** Issues short-lived BEP 5 announce tokens bound to the requester's IP address. */
export default class TokenManager {
  #currentSecret: Uint8Array
  #previousSecret?: Uint8Array
  #rotatedAt: number
  readonly #rotationIntervalMs: number
  readonly #now: () => number
  readonly #secretFactory: () => Uint8Array

  constructor(options: TokenManagerOptions = {}) {
    this.#rotationIntervalMs = options.rotationIntervalMs ?? DEFAULT_ROTATION_INTERVAL_MS
    if (!Number.isFinite(this.#rotationIntervalMs) || this.#rotationIntervalMs <= 0) {
      throw new RangeError('rotationIntervalMs must be greater than zero')
    }

    this.#now = options.now ?? Date.now
    this.#secretFactory = options.secretFactory ?? (() => crypto.getRandomValues(new Uint8Array(SECRET_LENGTH)))
    this.#currentSecret = this.#newSecret()
    this.#rotatedAt = this.#now()
  }

  /** Issue a token that can only be used by the supplied IP address. */
  issue(address: string): Uint8Array {
    this.#rotateIfNeeded()
    return this.#tokenFor(address, this.#currentSecret)
  }

  /** Validate a token against the current or immediately previous secret. */
  validate(token: Uint8Array, address: string): boolean {
    this.#rotateIfNeeded()
    if (constantTimeEqual(token, this.#tokenFor(address, this.#currentSecret))) return true
    return this.#previousSecret !== undefined &&
      constantTimeEqual(token, this.#tokenFor(address, this.#previousSecret))
  }

  #newSecret(): Uint8Array {
    const secret = this.#secretFactory()
    if (secret.length < 16) throw new RangeError('token secrets must contain at least 16 bytes')
    return new Uint8Array(secret)
  }

  #rotateIfNeeded(): void {
    const now = this.#now()
    const elapsed = now - this.#rotatedAt
    if (elapsed < this.#rotationIntervalMs) return

    this.#previousSecret = elapsed < this.#rotationIntervalMs * 2 ? this.#currentSecret : undefined
    this.#currentSecret = this.#newSecret()
    this.#rotatedAt = now
  }

  #tokenFor(address: string, secret: Uint8Array): Uint8Array {
    const addressBytes = textEncoder.encode(address)
    const input = new Uint8Array(secret.length + addressBytes.length)
    input.set(secret)
    input.set(addressBytes, secret.length)
    return sha1(input)
  }
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.length ^ right.length
  const length = Math.max(left.length, right.length)

  for (let index = 0; index < length; index++) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0)
  }

  return difference === 0
}
