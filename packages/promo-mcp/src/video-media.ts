import { createHash } from "node:crypto";
import { open } from "node:fs/promises";
import { isAbsolute, extname } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

const verifiedFiles = new Map<string, string>();

/** Only a server-resolved, registered preview may enter this function. No client paths. */
export async function serveVideoMedia(request: IncomingMessage, response: ServerResponse, preview: { locator: string; sha256: string }): Promise<void> {
  const types: Record<string, string> = { ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".m4v": "video/mp4" };
  const type = types[extname(preview.locator).toLowerCase()];
  if (!isAbsolute(preview.locator) || !type || !/^[a-f0-9]{64}$/i.test(preview.sha256)) { response.writeHead(400); response.end("Invalid registered video."); return; }
  const file = await open(preview.locator, "r");
  try {
    const info = await file.stat();
    if (!info.isFile() || !info.size) { response.writeHead(404); response.end(); return; }
    // Hash and serve through the same handle. Replaced files cannot silently masquerade as an old version.
    const fingerprint = `${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
    const cacheKey = `${preview.locator}:${preview.sha256.toLowerCase()}`;
    if (verifiedFiles.get(cacheKey) !== fingerprint) {
      const hash = createHash("sha256");
      for await (const chunk of file.createReadStream({ start: 0, autoClose: false })) hash.update(chunk);
      const after = await file.stat();
      if (hash.digest("hex") !== preview.sha256.toLowerCase() || after.size !== info.size || after.mtimeMs !== info.mtimeMs || after.ctimeMs !== info.ctimeMs) { response.writeHead(409); response.end("Preview bytes changed; register a new version."); return; }
      if (verifiedFiles.size >= 128) verifiedFiles.clear();
      verifiedFiles.set(cacheKey, fingerprint);
    }
    let start = 0, end = info.size - 1;
    const range = request.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) { response.writeHead(416, { "content-range": `bytes */${info.size}` }); response.end(); return; }
      if (!match[1]) start = Math.max(0, info.size - Number(match[2]));
      else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= info.size) { response.writeHead(416, { "content-range": `bytes */${info.size}` }); response.end(); return; }
    }
    response.writeHead(range ? 206 : 200, { "content-type": type, "content-length": end - start + 1, "accept-ranges": "bytes", "cache-control": "no-store", "x-content-type-options": "nosniff", ...(range ? { "content-range": `bytes ${start}-${end}/${info.size}` } : {}) });
    if (request.method === "HEAD") { response.end(); return; }
    await new Promise<void>((done, reject) => {
      const stream = file.createReadStream({ start, end, autoClose: false });
      const close = (): void => { stream.destroy(); done(); };
      response.once("close", close);
      stream.once("error", reject);
      stream.once("end", () => { response.off("close", close); done(); });
      stream.pipe(response);
    });
  } finally { await file.close(); }
}
