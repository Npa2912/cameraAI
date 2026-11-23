import assert from "node:assert/strict";
import { test } from "node:test";
import { bridgeOrigin } from "../src/adapters/Yiq6Preview";

test("bridge origin accepts private IPv4, loopback and an explicit port", () => {
  assert.equal(bridgeOrigin(" 192.168.50.10:8765 "), "http://192.168.50.10:8765");
  assert.equal(bridgeOrigin("172.31.0.5:8080"), "http://172.31.0.5:8080");
  assert.equal(bridgeOrigin("127.0.0.1:8765"), "http://127.0.0.1:8765");
});

test("bridge origin rejects external hosts, URL components and invalid ports", () => {
  for (const address of [
    "8.8.8.8:8765",
    "172.32.0.5:8765",
    "192.168.50.10:8765/stream",
    "192.168.50.10:0",
    "192.168.50.10:65536",
    "192.168.1.256:8765",
    "host.local:8765",
  ])
    assert.equal(bridgeOrigin(address), undefined);
});
