const http = require("http");

const PORT = process.env.PORT || 8080;
const TOKEN = process.env.CAM_TOKEN || "19012";
const BOUND = "--csframe";

let latestFrame = null;
let frameSeq = 0;
let pendingCmd = "none";
const viewers = new Set();

function broadcast(jpg) {
  latestFrame = jpg;
  frameSeq++;
  for (const res of viewers) {
    try {
      res.write(
        `\r\n${BOUND}\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpg.length}\r\n\r\n`
      );
      res.write(jpg);
    } catch {
      viewers.delete(res);
    }
  }
}

const server = http.createServer((req, res) => {
  const urlPath = (req.url || "/").split("?")[0];
  const prefix = "/" + TOKEN;

  if (urlPath === "/") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("CamStream Relay OK\n");
  }

  if (!urlPath.startsWith(prefix)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    return res.end("404");
  }

  const sub = urlPath.slice(prefix.length);

  if (sub === "") {
    res.writeHead(302, { Location: prefix + "/" });
    return res.end();
  }

  if (sub === "/" && req.method === "GET") {
    const html = `<!doctype html><html><head><meta charset='utf-8'>
<meta name='viewport' content='width=device-width,initial-scale=1'>
<title>CamStream</title><style>
html,body{margin:0;background:#000;color:#7ef;font-family:monospace}
#v{width:100%;display:block;background:#111;min-height:140px}
.bar{display:flex;gap:8px;padding:8px;flex-wrap:wrap}
a.b{background:#0a1a26;color:#7ef;border:1px solid #2a5;padding:9px 14px;text-decoration:none;border-radius:6px;font-size:14px}
</style></head><body>
<img id='v' src='stream' onerror="setTimeout(function(){document.getElementById('v').src='stream?x='+Date.now()},1200)">
<div class='bar'>
<a class='b' href='switch'>Switch cam</a>
<a class='b' href='snap' target='_blank'>Snapshot</a>
<a class='b' href='javascript:document.getElementById("v").requestFullscreen()'>Full</a>
</div></body></html>`;
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    return res.end(html);
  }

  if (sub === "/push" && req.method === "POST") {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const buf = Buffer.concat(chunks);
      if (buf.length > 0) broadcast(buf);
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
    });
    return;
  }

  if (sub === "/cmd" && req.method === "GET") {
    const out = pendingCmd;
    pendingCmd = "none";
    res.writeHead(200, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
    return res.end(out);
  }

  if (sub === "/switch" && req.method === "GET") {
    pendingCmd = "switch";
    res.writeHead(302, { Location: prefix + "/" });
    return res.end();
  }

  if (sub === "/snap" && req.method === "GET") {
    if (!latestFrame) {
      res.writeHead(503, { "Content-Type": "text/plain" });
      return res.end("no frame yet");
    }
    res.writeHead(200, {
      "Content-Type": "image/jpeg",
      "Content-Length": latestFrame.length,
      "Cache-Control": "no-store",
    });
    return res.end(latestFrame);
  }

  if (sub === "/stream" && req.method === "GET") {
    res.writeHead(200, {
      "Content-Type": `multipart/x-mixed-replace; boundary=${BOUND}`,
      "Cache-Control": "no-store",
      Pragma: "no-cache",
      Connection: "close",
    });
    viewers.add(res);
    if (latestFrame) {
      try {
        res.write(
          `\r\n${BOUND}\r\nContent-Type: image/jpeg\r\nContent-Length: ${latestFrame.length}\r\n\r\n`
        );
        res.write(latestFrame);
      } catch {}
    }
    req.on("close", () => viewers.delete(res));
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("404");
});

server.listen(PORT, () => {
  console.log(`CamStream Relay listening on port ${PORT} (token: ${TOKEN})`);
});
