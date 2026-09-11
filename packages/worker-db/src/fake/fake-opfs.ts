export class FakeOPFSFileHandle {
  public kind: 'file' | 'directory' = 'file';

  constructor(
    private fullPath: string,
    private storage: Map<string, Uint8Array>,
  ) {}

  async createWritable() {
    const self = this;
    let content: Uint8Array = new Uint8Array();
    return {
      async write(data: Uint8Array | string | Blob | ArrayBuffer,) {
        if (data instanceof Uint8Array) {
          content = data;
        } else if (data instanceof ArrayBuffer) {
          content = new Uint8Array(data,);
        } else if (data instanceof Blob) {
          content = new Uint8Array(await data.arrayBuffer(),);
        } else {
          content = new TextEncoder().encode(String(data,),);
        }
      },
      async close() {
        self.storage.set(self.fullPath, content,);
      },
    };
  }

  async getFile(): Promise<File> {
    const content = this.storage.get(this.fullPath,);
    if (content === undefined) {
      throw new Error(`File ${this.fullPath} not found in Fake OPFS`,);
    }
    const fileName = this.fullPath.split('/',).pop() || 'file';
    return new File([content as any,], fileName, {
      type: 'application/octet-stream',
      lastModified: Date.now(),
    },);
  }
}

export class FakeOPFSDirectory {
  private static sharedStorage = new Map<string, Uint8Array>();

  constructor(private path: string = '',) {}

  async getDirectoryHandle(name: string, options?: { create?: boolean },) {
    return new FakeOPFSDirectory(this.path ? `${this.path}/${name}` : name,);
  }

  async getFileHandle(name: string, options?: { create?: boolean },) {
    const fullPath = this.path ? `${this.path}/${name}` : name;
    if (!options?.create && !FakeOPFSDirectory.sharedStorage.has(fullPath,)) {
      throw new Error(`File ${fullPath} not found in Fake OPFS`,);
    }
    return new FakeOPFSFileHandle(fullPath, FakeOPFSDirectory.sharedStorage,);
  }

  async removeEntry(name: string,) {
    const fullPath = this.path ? `${this.path}/${name}` : name;
    FakeOPFSDirectory.sharedStorage.delete(fullPath,);
  }

  async *keys() {
    for (const key of FakeOPFSDirectory.sharedStorage.keys()) {
      if (this.path && key.startsWith(`${this.path}/`,)) {
        const localName = key.slice(this.path.length + 1,);
        if (!localName.includes('/',)) yield localName;
      } else if (!this.path && !key.includes('/',)) {
        yield key;
      }
    }
  }

  async *entries() {
    for (const key of FakeOPFSDirectory.sharedStorage.keys()) {
      if (this.path && key.startsWith(`${this.path}/`,)) {
        const localName = key.slice(this.path.length + 1,);
        if (!localName.includes('/',)) {
          yield [
            localName,
            new FakeOPFSFileHandle(key, FakeOPFSDirectory.sharedStorage,),
          ] as const;
        }
      } else if (!this.path && !key.includes('/',)) {
        yield [key, new FakeOPFSFileHandle(key, FakeOPFSDirectory.sharedStorage,),] as const;
      }
    }
  }

  async *values() {
    for (const key of FakeOPFSDirectory.sharedStorage.keys()) {
      if (this.path && key.startsWith(`${this.path}/`,)) {
        const localName = key.slice(this.path.length + 1,);
        if (!localName.includes('/',)) {
          yield new FakeOPFSFileHandle(key, FakeOPFSDirectory.sharedStorage,);
        }
      } else if (!this.path && !key.includes('/',)) {
        yield new FakeOPFSFileHandle(key, FakeOPFSDirectory.sharedStorage,);
      }
    }
  }

  static clear() {
    FakeOPFSDirectory.sharedStorage.clear();
  }
}
