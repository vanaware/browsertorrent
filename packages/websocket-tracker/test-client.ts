const ws = new WebSocket("ws://localhost:8000",);
ws.addEventListener("open", () => {
  ws.send(JSON.stringify({
    action: "announce",
    info_hash: "a".repeat(20,),
    peer_id: "b".repeat(20,),
    port: 6881,
    uploaded: 0,
    downloaded: 0,
    left: 100,
    event: "started",
  },),);
},);
ws.addEventListener("message", (e,) => {
  console.log("RECV:", e.data,);
  ws.close();
  Deno.exit(0,);
},);
ws.addEventListener("error", (e,) => {
  console.error("WS ERROR:", e,);
  Deno.exit(1,);
},);
setTimeout(() => {
  console.error("TIMEOUT",);
  Deno.exit(1,);
}, 3000,);
