import assert from "node:assert/strict";
import { test } from "node:test";
import { gzipSync, deflateSync } from "node:zlib";
import express from "express";

test("compressed JSON rejects corrupt bodies and keeps serving subsequent requests", async () => {
  const app = express();
  app.use(express.json({ limit: "1kb" }));
  app.post("/json", (req, res) => res.json(req.body));
  app.use((error: any, _req: any, res: any, _next: any) => {
    res.status(error.status ?? 400).json({ rejected: true });
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/json`;
  try {
    for (const encoding of ["gzip", "deflate"]) {
      const compress = encoding === "gzip" ? gzipSync : deflateSync;
      const valid = compress(Buffer.from('{"ok":true}'));
      for (const body of [Buffer.from("invalid compressed body"), valid.subarray(0, 5)]) {
        const response = await fetch(url, {
          method: "POST", headers: { "content-type": "application/json", "content-encoding": encoding }, body,
        });
        assert.equal(response.status, 400);
        await response.arrayBuffer();
      }
      const oversized = await fetch(url, {
        method: "POST", headers: { "content-type": "application/json", "content-encoding": encoding },
        body: compress(Buffer.from(JSON.stringify({ text: "x".repeat(2048) }))),
      });
      assert.equal(oversized.status, 413);
      await oversized.arrayBuffer();
      const healthy = await fetch(url, {
        method: "POST", headers: { "content-type": "application/json", "content-encoding": encoding }, body: valid,
      });
      assert.equal(healthy.status, 200);
      assert.deepEqual(await healthy.json(), { ok: true });
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
