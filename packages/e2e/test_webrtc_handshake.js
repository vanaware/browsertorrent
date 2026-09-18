const { chromium } = require('@playwright/test');
const { spawn } = require('child_process');

(async () => {
  console.log("Starting services...");
  // 1. Start Tracker
  const trackerProcess = spawn('deno', ['run', '-A', '../websocket-tracker/server.ts', '--port', '8000'], { stdio: 'pipe' });
  
  // 2. Start Web Server
  const serverProcess = spawn('deno', ['run', '-A', '../server/src/main.ts', '--port', '3000'], { stdio: 'pipe' });

  // Wait for servers to start
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log("Servers started. Launching browsers...");

  try {
    const browser = await chromium.launch({ headless: true });
    
    // Create two isolated contexts
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    // Catch console logs for debugging
    pageA.on('console', msg => console.log('[A]', msg.text()));
    pageB.on('console', msg => console.log('[B]', msg.text()));

    console.log("Navigating to local server...");
    await pageA.goto('http://localhost:3000');
    await pageB.goto('http://localhost:3000');
    
    await pageA.waitForLoadState('networkidle');
    await pageB.waitForLoadState('networkidle');

    console.log("Injecting test logic...");

    // Setup Seeder (Peer A)
    await pageA.evaluate(async () => {
      const { Torrent, Swarm } = window.BrowserTorrentTest;
      window.testLogs = [];
      const log = (msg) => { console.log(msg); window.testLogs.push(msg); };
      
      log("Initializing Swarm A...");
      
      const infoHash = new Uint8Array(20).fill(7); // Fake infohash
      const peerId = new Uint8Array(20).fill(10); // Peer A ID
      
      window.swarmA = new Swarm({
         infoHash,
         peerId,
         announce: ["ws://localhost:8000"], // local tracker
         wrtc: window.RTCPeerConnection
      });
      
      window.swarmA.on('peer', (e) => {
         log("A: Peer event fired! Connected to: " + e.detail.peer.id);
         window.peerConnected = true;
      });
      
      window.swarmA.on('wire', (e) => {
         log("A: Wire event fired!");
         window.wireConnected = true;
      });

      await window.swarmA.start();
      log("Swarm A started.");
    });

    // Setup Leecher (Peer B)
    await pageB.evaluate(async () => {
      const { Swarm } = window.BrowserTorrentTest;
      window.testLogs = [];
      const log = (msg) => { console.log(msg); window.testLogs.push(msg); };
      
      log("Initializing Swarm B...");
      
      const infoHash = new Uint8Array(20).fill(7); // Must match A
      const peerId = new Uint8Array(20).fill(20); // Peer B ID
      
      window.swarmB = new Swarm({
         infoHash,
         peerId,
         announce: ["ws://localhost:8000"], 
         wrtc: window.RTCPeerConnection
      });
      
      window.swarmB.on('peer', (e) => {
         log("B: Peer event fired! Connected to: " + e.detail.peer.id);
         window.peerConnected = true;
      });

      window.swarmB.on('wire', (e) => {
         log("B: Wire event fired!");
         window.wireConnected = true;
      });

      await window.swarmB.start();
      log("Swarm B started.");
    });

    // Wait for the WebRTC connection to establish (up to 10 seconds)
    console.log("Waiting for WebRTC connection to establish between A and B via Tracker...");
    
    let success = false;
    for(let i=0; i<10; i++) {
       const aConnected = await pageA.evaluate(() => window.peerConnected === true && window.wireConnected === true);
       const bConnected = await pageB.evaluate(() => window.peerConnected === true && window.wireConnected === true);
       
       if (aConnected && bConnected) {
          success = true;
          console.log("SUCCESS! WebRTC P2P Data Channel established between Chromium instances!");
          break;
       }
       await new Promise(r => setTimeout(r, 1000));
    }
    
    if (!success) {
       console.error("FAILED to establish WebRTC connection.");
    }

    await browser.close();

    // Cleanup
    trackerProcess.kill();
    serverProcess.kill();

    if (!success) process.exit(1);

  } catch (err) {
    console.error("Test error:", err);
    trackerProcess.kill();
    serverProcess.kill();
    process.exit(1);
  }
})();
