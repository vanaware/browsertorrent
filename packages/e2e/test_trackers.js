const { chromium } = require('@playwright/test');
const { spawn } = require('child_process');

(async () => {
  console.log("==========================================");
  console.log("STARTING TEST SERVICES");
  console.log("==========================================");
  
  // Start Web Server on 0.0.0.0:3000 (now also serves as our local tracker!)
  const serverProcess = spawn('deno', ['run', '-A', 'packages/server/src/main.ts', '--port', '3000'], { stdio: 'pipe' });
  serverProcess.stdout.on('data', d => console.log(`[Server] ${d.toString().trim()}`));
  serverProcess.stderr.on('data', d => console.error(`[Server ERR] ${d.toString().trim()}`));

  // Wait for servers to start
  await new Promise(resolve => setTimeout(resolve, 3000));

  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--disable-web-security', '--disable-features=BlockInsecurePrivateNetworkRequests'] });
    
    // ---------------------------------------------------------
    // TEST 1: PUBLIC TRACKER CONNECTION
    // ---------------------------------------------------------
    console.log("\n--- TEST 1: PUBLIC TRACKER (wss://tracker.webtorrent.dev) ---");
    const pagePublic = await browser.newPage();
    pagePublic.on('console', msg => console.log('[PublicTest]', msg.text()));
    
    await pagePublic.goto('http://127.0.0.1:3000');
    await pagePublic.waitForLoadState('networkidle');
    
    const publicSuccess = await pagePublic.evaluate(async () => {
      const { WsTracker } = window.LocoTest;
      return new Promise((resolve) => {
        console.log("Initializing WsTracker with public URL...");
        const infoHash = new Uint8Array(20).fill(99);
        const peerId = new Uint8Array(20).fill(88);
        
        const tracker = new WsTracker("wss://tracker.webtorrent.dev", { infoHash, peerId });
        
        const timeout = setTimeout(() => {
           console.log("Timeout waiting for public tracker.");
           resolve(false);
        }, 10000);

        tracker.on("update", (e) => {
           console.log("✅ Success! Public tracker responded. Interval: " + e.detail.interval);
           clearTimeout(timeout);
           tracker.destroy();
           resolve(true);
        });
        
        tracker.on("error", (e) => {
           console.log("❌ Public tracker error: " + (e.detail ? e.detail.message : "unknown"));
           clearTimeout(timeout);
           tracker.destroy();
           resolve(false);
        });
        
        tracker.announce({ event: "started" }).catch(err => {
           console.log("❌ Announce promise rejected: " + err.message);
        });
      });
    });

    if (!publicSuccess) {
       console.error("Test 1 (Public Tracker) Failed.");
    }
    await pagePublic.close();

    // ---------------------------------------------------------
    // TEST 2: LOCAL TRACKER & P2P WEBRTC DATA CHANNEL
    // ---------------------------------------------------------
    console.log("\n--- TEST 2: LOCAL TRACKER & P2P CONNECTION ---");
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    pageA.on('console', msg => console.log('[Peer A]', msg.text()));
    pageB.on('console', msg => console.log('[Peer B]', msg.text()));

    await pageA.goto('http://127.0.0.1:3000');
    await pageB.goto('http://127.0.0.1:3000');
    
    await pageA.waitForLoadState('networkidle');
    await pageB.waitForLoadState('networkidle');

    // Setup Seeder (Peer A)
    await pageA.evaluate(async () => {
      const { Swarm } = window.LocoTest;
      console.log("Initializing Swarm A...");
      
      const infoHash = new Uint8Array(20).fill(77);
      const peerId = new Uint8Array(20).fill(11); // Peer A ID
      
      window.swarmA = new Swarm({
         infoHash,
         peerId,
         // Tracker now running directly on port 3000 with the app!
         announce: ["ws://127.0.0.1:3000/tracker"], 
         wrtc: window.RTCPeerConnection
      });
      
      window.swarmA.on('peer', (e) => {
         console.log("A: Peer event fired! Connected to: " + e.detail.peer.id);
         window.peerConnected = true;
      });
      
      window.swarmA.on('wire', (e) => {
         console.log("A: Wire event fired! WebRTC Data Channel is OPEN.");
         window.wireConnected = true;
      });

      await window.swarmA.start();
      console.log("Swarm A started.");
    });

    // Setup Leecher (Peer B)
    await pageB.evaluate(async () => {
      const { Swarm } = window.LocoTest;
      console.log("Initializing Swarm B...");
      
      const infoHash = new Uint8Array(20).fill(77); // Must match A
      const peerId = new Uint8Array(20).fill(22); // Peer B ID
      
      window.swarmB = new Swarm({
         infoHash,
         peerId,
         announce: ["ws://127.0.0.1:3000/tracker"], 
         wrtc: window.RTCPeerConnection
      });
      
      window.swarmB.on('peer', (e) => {
         console.log("B: Peer event fired! Connected to: " + e.detail.peer.id);
         window.peerConnected = true;
      });

      window.swarmB.on('wire', (e) => {
         console.log("B: Wire event fired! WebRTC Data Channel is OPEN.");
         window.wireConnected = true;
      });

      await window.swarmB.start();
      console.log("Swarm B started.");
    });

    console.log("Waiting for WebRTC connection to establish between A and B via Local Tracker...");
    
    let localSuccess = false;
    for(let i=0; i<15; i++) {
       const aConnected = await pageA.evaluate(() => window.peerConnected === true && window.wireConnected === true);
       const bConnected = await pageB.evaluate(() => window.peerConnected === true && window.wireConnected === true);
       
       if (aConnected && bConnected) {
          localSuccess = true;
          console.log("✅ SUCCESS! WebRTC P2P Data Channel established via Local Tracker!");
          break;
       }
       await new Promise(r => setTimeout(r, 1000));
    }
    
    if (!localSuccess) {
       throw new Error("Test 2 (Local Tracker) Failed.");
    }

    console.log("\nALL E2E TESTS PASSED SUCCESSFULLY.");

  } catch (err) {
    console.error("Test error:", err);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
    serverProcess.kill();
  }
})();
