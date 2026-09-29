const assert = require('node:assert/strict');
const test = require('node:test');
const { Readable, Writable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const {
  createDownloadProgressMeter,
  parseContentLength
} = require('../dist/main/update-progress.js');

test('parses positive Content-Length values only', () => {
  assert.equal(parseContentLength('1024'), 1024);
  assert.equal(parseContentLength('0'), undefined);
  assert.equal(parseContentLength('-1'), undefined);
  assert.equal(parseContentLength('nope'), undefined);
  assert.equal(parseContentLength(null), undefined);
});

test('measures download bytes and reports deterministic percentage progress', async () => {
  const snapshots = [];
  const meter = createDownloadProgressMeter(100, progress => snapshots.push(progress));
  const sink = new Writable({ write(_chunk, _encoding, callback) { callback(); } });

  await pipeline(
    Readable.from([Buffer.alloc(25), Buffer.alloc(25), Buffer.alloc(50)]),
    meter.stream,
    sink
  );
  assert.equal(meter.downloadedBytes(), 100);
  assert.deepEqual(snapshots.map(item => item.percent), [25, 50, 100]);
  assert.deepEqual(snapshots.map(item => item.downloadedBytes), [25, 50, 100]);
  assert.ok(snapshots.every(item => item.totalBytes === 100));
});

test('reports byte progress when total size is unknown', async () => {
  const snapshots = [];
  const meter = createDownloadProgressMeter(undefined, progress => snapshots.push(progress));
  const sink = new Writable({ write(_chunk, _encoding, callback) { callback(); } });

  await pipeline(Readable.from([Buffer.alloc(16)]), meter.stream, sink);

  assert.equal(meter.downloadedBytes(), 16);
  assert.equal(snapshots.at(-1).downloadedBytes, 16);
  assert.equal(snapshots.at(-1).percent, undefined);
  assert.equal(snapshots.at(-1).totalBytes, undefined);
});