// monorepo/worker-db/src/fake/fake-db.ts

// 1. Injeta o IndexedDB Fake no escopo global (self) do Worker
import 'fake-indexeddb/auto';

import { FakeOPFSDirectory, } from './fake-opfs.ts';

const _self = self as any;

// 2. Injeta OPFS Fake no escopo do Worker
if (!_self.navigator) _self.navigator = {};
if (!_self.navigator.storage) _self.navigator.storage = {};
if (!_self.navigator.storage.getDirectory) {
  _self.navigator.storage.getDirectory = async () => new FakeOPFSDirectory();
}

// 3. Agora que o ambiente do Worker está perfeitamente simulado,
// importamos a lógica real do banco de dados. O db.ts vai rodar
// achando que está em um browser de verdade!
import '../worker.ts';
