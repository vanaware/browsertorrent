const { chromium } = require('@playwright/test');

(async () => {
  console.log("===============================================================");
  console.log("BROWSERTORRENT ADVANCED E2E TEST SUITE");
  console.log("===============================================================");

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-web-security',
        '--disable-features=BlockInsecurePrivateNetworkRequests,WebRtcHideLocalIpsWithMdns',
        '--allow-loopback-in-peer-connection',
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream'
      ]
    });

    const results = {};

    async function runP2PTest({
      testId,
      testName,
      seederEngine,
      leecherEngine,
      trackers,
      localTracker = false,
      testStreaming = false
    }) {
      console.log(`\n---------------------------------------------------------------`);
      console.log(`RUNNING ${testId}: ${testName}`);
      console.log(`  Seeder: [${seederEngine}] | Leecher: [${leecherEngine}]`);
      console.log(`  Trackers: ${trackers.join(', ')}`);
      console.log(`---------------------------------------------------------------`);

      const contextA = await browser.newContext();
      const contextB = await browser.newContext();
      
      if (localTracker) {
        await contextA.grantPermissions(["camera", "microphone"]);
        await contextB.grantPermissions(["camera", "microphone"]);
      }

      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();

      pageA.on('console', msg => {
        const text = msg.text();
        if (text.includes('[sw]') || text.includes('[main]')) {
          // console.log(`[${seederEngine} Seeder A]`, text);
        }
      });
      pageB.on('console', msg => {
        const text = msg.text();
        if (text.includes('[sw]') || text.includes('[main]')) {
           // console.log(`[${leecherEngine} Leecher B]`, text);
        }
      });

      await pageA.goto('http://127.0.0.1:3000');
      await pageB.goto('http://127.0.0.1:3000');

      await pageA.waitForLoadState('networkidle');
      await pageB.waitForLoadState('networkidle');

      const PAYLOAD = `TEST_${testId}_${seederEngine}_TO_${leecherEngine}_${Date.now()}`;

      // Step 1: Start Seeder
      const seedResult = await pageA.evaluate(async ({ engine, trackers, payload, localTracker }) => {
        const encoder = new TextEncoder();
        const fileData = encoder.encode(payload);

        let client;
        if (engine === 'browsertorrent') {
          const { Client } = window.BrowserTorrentTest;
          client = new Client({
            useOPFS: false,
            rtcConfig: localTracker ? { iceServers: [] } : undefined
          });
        } else {
          const WT = window.WebTorrent;
          client = new WT({
            maxConns: 55,
            tracker: {
              rtcConfig: localTracker ? { iceServers: [] } : undefined
            }
          });
        }
        window.seederClient = client;

        let torrent;
        if (engine === 'browsertorrent') {
          torrent = await client.seed({
            name: "test-file.txt",
            length: fileData.length,
            data: fileData
          }, {
            announce: trackers,
            pieceSize: 16384
          });
        } else {
          const file = new File([fileData], "test-file.txt", { type: "text/plain" });
          torrent = await new Promise((resolve) => {
            const t = client.seed(file, { announce: trackers });
            if (t.ready) resolve(t);
            else t.on('ready', () => resolve(t));
          });
        }
        window.seederTorrent = torrent;

        return {
          magnetURI: torrent.magnetURI,
          infoHash: torrent.infoHash,
          length: fileData.length
        };
      }, { engine: seederEngine, trackers, payload: PAYLOAD, localTracker });

      console.log(`Seeder ready. InfoHash: ${seedResult.infoHash}`);

      // Step 2: Start Leecher
      await pageB.evaluate(async ({ engine, trackers, meta, localTracker }) => {
        let client;
        if (engine === 'browsertorrent') {
          const { Client } = window.BrowserTorrentTest;
          client = new Client({
            useOPFS: false,
            rtcConfig: localTracker ? { iceServers: [] } : undefined
          });
        } else {
          const WT = window.WebTorrent;
          client = new WT({
            maxConns: 55,
            tracker: {
              rtcConfig: localTracker ? { iceServers: [] } : undefined
            }
          });
        }
        window.leecherClient = client;
        window.downloadFinished = false;
        window.downloadedContent = null;

        let torrent;
        if (engine === 'browsertorrent') {
          torrent = await client.add(meta.magnetURI, { announce: trackers });
          window.leecherTorrent = torrent;
          torrent.on("done", async () => {
            const pieceBuf = await torrent.getPiece(0);
            if (pieceBuf) {
              const dec = new TextDecoder();
              window.downloadedContent = dec.decode(pieceBuf.subarray(0, meta.length));
              window.downloadFinished = true;
            }
          });
        } else {
          torrent = client.add(meta.magnetURI, { announce: trackers });
          window.leecherTorrent = torrent;
          torrent.on("done", () => {
            torrent.files[0].arrayBuffer().then(buf => {
              const dec = new TextDecoder();
              window.downloadedContent = dec.decode(new Uint8Array(buf));
              window.downloadFinished = true;
            });
          });
        }
      }, { engine: leecherEngine, trackers, meta: seedResult, localTracker });

      // Step 3: Wait and verify transfer
      let transferSuccess = false;
      const maxAttempts = 60; // 60 seconds
      for (let i = 0; i < maxAttempts; i++) {
        const status = await pageB.evaluate(() => ({
          finished: window.downloadFinished,
          content: window.downloadedContent,
          peers: window.leecherTorrent ? (window.leecherTorrent.numPeers ?? window.leecherTorrent.wires?.length ?? 0) : 0,
          downloaded: window.leecherTorrent ? window.leecherTorrent.downloaded : 0,
          length: window.leecherTorrent ? window.leecherTorrent.length : 0
        }));

        if (i % 10 === 0 && !status.finished) {
          console.log(`  [Progress] Peers: ${status.peers}, Downloaded: ${status.downloaded}/${status.length}`);
        }

        if (status.finished && status.content === PAYLOAD) {
          transferSuccess = true;
          console.log(`✅ DATA SUCCESS! Verification passed.`);
          break;
        }
        await new Promise(r => setTimeout(r, 1000));
      }

      if (!transferSuccess) {
        console.log(`❌ DATA FAILED: Timeout after ${maxAttempts}s`);
      }

      // Step 4: Test SW Streaming if requested
      let streamingSuccess = false;
      if (transferSuccess && testStreaming && leecherEngine === 'browsertorrent') {
        console.log("Testing Service Worker Streaming...");
        const streamUrl = `http://127.0.0.1:3000/webtorrent/${seedResult.infoHash}/test-file.txt`;
        
        try {
          const response = await pageB.evaluate(async (url) => {
            const res = await fetch(url);
            const text = await res.text();
            return {
              status: res.status,
              headers: Object.fromEntries(res.headers.entries()),
              content: text
            };
          }, streamUrl);

          if (response.status === 200 && response.content === PAYLOAD && response.headers['accept-ranges'] === 'bytes') {
            streamingSuccess = true;
            console.log(`✅ STREAMING SUCCESS! SW intercepted and served data.`);
          } else {
            console.log(`❌ STREAMING FAILED: Status ${response.status}, Content Match: ${response.content === PAYLOAD}`);
            console.log("Headers:", response.headers);
          }
        } catch (err) {
          console.error("Streaming test error:", err);
        }
      } else if (testStreaming) {
        streamingSuccess = transferSuccess; // Fallback for WT if we don't have a specific SW test for it yet
      }

      await contextA.close();
      await contextB.close();

      const finalSuccess = testStreaming ? (transferSuccess && streamingSuccess) : transferSuccess;
      results[testId] = finalSuccess;
      return finalSuccess;
    }

    const publicTrackers = ["wss://tracker.webtorrent.dev"];
    const localDenoTracker = ["ws://127.0.0.1:3000/tracker"];

    // 1. WebTorrent ↔ WebTorrent (Deno Tracker)
    await runP2PTest({
      testId: "SCENARIO_A",
      testName: "WebTorrent ↔ WebTorrent (Deno Tracker)",
      seederEngine: "webtorrent",
      leecherEngine: "webtorrent",
      trackers: localDenoTracker,
      localTracker: true
    });

    // 2. WebTorrent ↔ BrowserTorrent (Cross-Client, Deno Tracker)
    await runP2PTest({
      testId: "SCENARIO_B_LOCAL",
      testName: "WebTorrent ➔ BrowserTorrent (Deno Tracker)",
      seederEngine: "webtorrent",
      leecherEngine: "browsertorrent",
      trackers: localDenoTracker,
      localTracker: true
    });

    // 3. WebTorrent ↔ BrowserTorrent (Cross-Client, Public Trackers)
    await runP2PTest({
      testId: "SCENARIO_B_PUBLIC",
      testName: "BrowserTorrent ➔ WebTorrent (Public Trackers)",
      seederEngine: "browsertorrent",
      leecherEngine: "webtorrent",
      trackers: publicTrackers,
      localTracker: false
    });

    // 4. BrowserTorrent ↔ BrowserTorrent (Public Trackers)
    await runP2PTest({
      testId: "SCENARIO_C",
      testName: "BrowserTorrent ↔ BrowserTorrent (Public Trackers)",
      seederEngine: "browsertorrent",
      leecherEngine: "browsertorrent",
      trackers: publicTrackers,
      localTracker: false
    });

    // 5. BrowserTorrent SW Streaming
    await runP2PTest({
      testId: "SCENARIO_D",
      testName: "BrowserTorrent SW Streaming",
      seederEngine: "browsertorrent",
      leecherEngine: "browsertorrent",
      trackers: localDenoTracker,
      localTracker: true,
      testStreaming: true
    });

    // 6. WebTorrent SW Streaming Comparison
    await runP2PTest({
      testId: "SCENARIO_E",
      testName: "WebTorrent ➔ SW Streaming (Compatibility Test)",
      seederEngine: "webtorrent",
      leecherEngine: "browsertorrent",
      trackers: localDenoTracker,
      localTracker: true,
      testStreaming: true
    });

    console.log("\n===============================================================");
    console.log("FINAL TEST RESULTS");
    console.log("===============================================================");
    for (const [id, passed] of Object.entries(results)) {
      console.log(`[${passed ? "PASSED ✅" : "FAILED ❌"}] ${id}`);
    }

  } catch (err) {
    console.error("Suite execution error:", err);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
