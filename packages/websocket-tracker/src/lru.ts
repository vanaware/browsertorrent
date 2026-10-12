/**
 * @file lru.ts
 * @description In-memory Least-Recently-Used (LRU) cache implementation.
 * Used by the tracker for bounded, high-speed swarm and peer memory management.
 */

/**
 * Internal doubly-linked list node for the LRU cache.
 */
interface LRUNode<T> {
  key: string;
  value: T;
  prev: LRUNode<T> | null;
  next: LRUNode<T> | null;
}

/**
 * Least-Recently-Used (LRU) cache providing O(1) reads, insertions, and evictions.
 * Backed by a JavaScript `Map` and an internal doubly-linked list.
 *
 * @typeParam T - The type of value stored in each cache entry.
 *
 * @example
 * ```ts
 * import { LRUCache } from "jsr:@vanaware/browsertorrent-tracker";
 *
 * const cache = new LRUCache<string>(2);
 * cache.put("a", "alpha");
 * cache.put("b", "beta");
 * console.log(cache.get("a")); // "alpha"
 *
 * cache.put("c", "gamma"); // evicts "b"
 * console.log(cache.has("b")); // false
 * console.log(cache.getSize()); // 2
 * ```
 */
export class LRUCache<T> {
  private map: Map<string, LRUNode<T>>;
  private head: LRUNode<T> | null;
  private tail: LRUNode<T> | null;
  private readonly capacity: number;
  private size: number;

  /**
   * Constructs a new LRUCache with the specified maximum capacity.
   *
   * @param capacity - Maximum number of entries before eviction (defaults to 100).
   */
  constructor(capacity: number = 100) {
    this.capacity = capacity;
    this.map = new Map();
    this.head = null;
    this.tail = null;
    this.size = 0;
  }

  /**
   * Retrieves a cached value by key.
   * Moves the accessed node to the front (marking it as most recently used).
   *
   * @param key - The cache key to look up.
   * @returns The value associated with the key, or `undefined` if not present.
   */
  get(key: string): T | undefined {
    const node = this.map.get(key);
    if (!node) return undefined;

    this.moveToFront(node);
    return node.value;
  }

  /**
   * Inserts or updates a value in the cache.
   * Evicts the least recently used item if the cache reaches capacity.
   *
   * @param key - The unique cache key.
   * @param value - The value to store.
   */
  put(key: string, value: T): void {
    const existing = this.map.get(key);
    if (existing) {
      existing.value = value;
      this.moveToFront(existing);
      return;
    }

    const newNode: LRUNode<T> = { key, value, prev: null, next: null };

    if (this.size >= this.capacity) {
      this.evict();
    }

    this.addToFront(newNode);
    this.map.set(key, newNode);
    this.size++;
  }

  /**
   * Removes an item by key from the cache.
   *
   * @param key - The cache key to remove.
   * @returns `true` if the item was found and removed, `false` otherwise.
   */
  remove(key: string): boolean {
    const node = this.map.get(key);
    if (!node) return false;

    this.removeNode(node);
    this.map.delete(key);
    this.size--;
    return true;
  }

  /**
   * Checks whether a key exists in the cache without altering LRU order.
   *
   * @param key - The cache key to check.
   * @returns `true` if the key exists, `false` otherwise.
   */
  has(key: string): boolean {
    return this.map.has(key);
  }

  /**
   * Returns the current number of items stored in the cache.
   *
   * @returns The count of cached items.
   */
  getSize(): number {
    return this.size;
  }

  /**
   * Clears all items from the cache and resets internal pointers.
   */
  clear(): void {
    this.map.clear();
    this.head = null;
    this.tail = null;
    this.size = 0;
  }

  /**
   * Returns all keys in order from most recently used to least recently used.
   *
   * @returns An array of string keys.
   */
  keys(): string[] {
    const keys: string[] = [];
    let current = this.head;
    while (current) {
      keys.push(current.key);
      current = current.next;
    }
    return keys;
  }

  /**
   * Returns all values in order from most recently used to least recently used.
   *
   * @returns An array of cached values.
   */
  values(): T[] {
    const values: T[] = [];
    let current = this.head;
    while (current) {
      values.push(current.value);
      current = current.next;
    }
    return values;
  }

  /**
   * Returns all entries as `[key, value]` tuples in order from most to least recently used.
   *
   * @returns An array of key-value pairs.
   */
  entries(): [string, T][] {
    const entries: [string, T][] = [];
    let current = this.head;
    while (current) {
      entries.push([current.key, current.value]);
      current = current.next;
    }
    return entries;
  }

  /**
   * Moves an existing node to the head of the linked list.
   */
  private moveToFront(node: LRUNode<T>): void {
    if (node === this.head) return;

    this.removeNode(node);
    this.addToFront(node);
  }

  /**
   * Prepends a node to the head of the linked list.
   */
  private addToFront(node: LRUNode<T>): void {
    node.prev = null;
    node.next = this.head;

    if (this.head) {
      this.head.prev = node;
    }
    this.head = node;

    if (!this.tail) {
      this.tail = node;
    }
  }

  /**
   * Detaches a node from the linked list.
   */
  private removeNode(node: LRUNode<T>): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }

    node.prev = null;
    node.next = null;
  }

  /**
   * Removes the least recently used node from the tail of the linked list and map.
   */
  private evict(): void {
    if (!this.tail) return;

    const key = this.tail.key;
    this.removeNode(this.tail);
    this.map.delete(key);
    this.size--;
  }
}
