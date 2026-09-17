const fs = require('fs');
let code = fs.readFileSync('packages/websocket-tracker/src/server.ts', 'utf8');

code = code.replace(
  'const targetPeer = this.peers.get(message.to_peer_id,);',
  'const targetPeer = Array.from(this.peers.values()).find(p => p.peerId === message.to_peer_id);'
);

code = code.replace(
  'const targetPeer = this.peers.get(message.to_peer_id,);',
  'const targetPeer = Array.from(this.peers.values()).find(p => p.peerId === message.to_peer_id);'
);

fs.writeFileSync('packages/websocket-tracker/src/server.ts', code);
