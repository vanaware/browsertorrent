const code = await Deno.readTextFile('packages/websocket-tracker/src/server.ts');
const newCode = code.replaceAll('const targetPeer = this.peers.get(message.to_peer_id,);', 'const targetPeer = Array.from(this.peers.values()).find(p => p.peerId === message.to_peer_id);');
await Deno.writeTextFile('packages/websocket-tracker/src/server.ts', newCode);
