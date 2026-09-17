/**
 * Simple LRU Cache for peer management.
 * Optimized for small servers with minimal memory footprint.
 */

interface LRUNode<T,> {
  key: string;
  value: T;
  prev: LRUNode<T> | null;
  next: LRUNode<T> | null;
}

/**
 * LRU Cache implementation using a doubly-linked list + Map.
 * Provides O(1) get and put operations.
 */
export class LRUCache<T,> {
  private map: Map<string, LRUNode<T>>;
  private head: LRUNode<T> | null;
  private tail: LRUNode<T> | null;
  private readonly capacity: number;
  private size: number;

  constructor(capacity: number = 100,) {
    this.capacity = capacity;
    this.map = new Map();
    this.head = null;
    this.tail = null;
    this.size = 0;
  }

  /**
   * Get a value by key. Moves the accessed node to the front (most recently used).
   */
  get(key: string,): T | undefined {
    const node = this.map.get(key,);
    if (!node) return undefined;

    this.moveToFront(node,);
    return node.value;
  }

  /**
   * Put a value into the cache. Evicts the least recently used item if at capacity.
   */
  put(key: string, value: T,): void {
    const existing = this.map.get(key,);
    if (existing) {
      existing.value = value;
      this.moveToFront(existing,);
      return;
    }

    const newNode: LRUNode<T> = { key, value, prev: null, next: null, };

    if (this.size >= this.capacity) {
      this.evict();
    }

    this.addToFront(newNode,);
    this.map.set(key, newNode,);
    this.size++;
  }

  /**
   * Remove a value by key.
   */
  remove(key: string,): boolean {
    const node = this.map.get(key,);
    if (!node) return false;

    this.removeNode(node,);
    this.map.delete(key,);
    this.size--;
    return true;
  }

  /**
   * Check if a key exists in the cache.
   */
  has(key: string,): boolean {
    return this.map.has(key,);
  }

  /**
   * Get the current number of items in the cache.
   */
  getSize(): number {
    return this.size;
  }

  /**
   * Clear all items from the cache.
   */
  clear(): void {
    this.map.clear();
    this.head = null;
    this.tail = null;
    this.size = 0;
  }

  /**
   * Get all keys in order from most recently used to least recently used.
   */
  keys(): string[] {
    const keys: string[] = [];
    let current = this.head;
    while (current) {
      keys.push(current.key,);
      current = current.next;
    }
    return keys;
  }

  /**
   * Get all values in order from most recently used to least recently used.
   */
  values(): T[] {
    const values: T[] = [];
    let current = this.head;
    while (current) {
      values.push(current.value,);
      current = current.next;
    }
    return values;
  }

  /**
   * Get all entries as [key, value] pairs.
   */
  entries(): [string, T,][] {
    const entries: [string, T,][] = [];
    let current = this.head;
    while (current) {
      entries.push([current.key, current.value,],);
      current = current.next;
    }
    return entries;
  }

  private moveToFront(node: LRUNode<T>,): void {
    if (node === this.head) return;

    this.removeNode(node,);
    this.addToFront(node,);
  }

  private addToFront(node: LRUNode<T>,): void {
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

  private removeNode(node: LRUNode<T>,): void {
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

  private evict(): void {
    if (!this.tail) return;

    const key = this.tail.key;
    this.removeNode(this.tail,);
    this.map.delete(key,);
    this.size--;
  }
}
