const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { PDFDocument } = require('pdf-lib');
const app = require('../server');

let server;
let baseUrl;
before(async () => {
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => new Promise(resolve => server.close(resolve)));

async function pdfWithPages(count) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < count; i++) doc.addPage([300, 400]);
  return Buffer.from(await doc.save());
}
async function processPdf(tool, fileBuffers, options = {}) {
  const form = new FormData();
  for (const [i, bytes] of fileBuffers.entries()) form.append('files', new Blob([bytes], { type: 'application/pdf' }), `doc-${i}.pdf`);
  for (const [key, value] of Object.entries(options)) form.append(key, String(value));
  return fetch(`${baseUrl}/api/process/${encodeURIComponent(tool)}`, { method: 'POST', body: form });
}

test('health endpoint responds', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'ok');
});

test('serves frontend without exposing project or environment files', async () => {
  assert.equal((await fetch(`${baseUrl}/`)).status, 200);
  assert.equal((await fetch(`${baseUrl}/package.json`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/server.js`)).status, 404);
});

test('merge combines valid PDFs and generated result reopens', async () => {
  const response = await processPdf('Merge PDF', [await pdfWithPages(2), await pdfWithPages(1)]);
  assert.equal(response.status, 200);
  const result = await PDFDocument.load(await response.arrayBuffer());
  assert.equal(result.getPageCount(), 3);
});

test('split extracts selected pages', async () => {
  const response = await processPdf('Split PDF', [await pdfWithPages(4)], { pages: '2-3' });
  assert.equal(response.status, 200);
  assert.equal((await PDFDocument.load(await response.arrayBuffer())).getPageCount(), 2);
});

test('delete removes selected pages and page order is applied', async () => {
  const source = await pdfWithPages(3);
  const deleted = await processPdf('Delete Pages', [source], { pages: '2' });
  assert.equal(deleted.status, 200);
  assert.equal((await PDFDocument.load(await deleted.arrayBuffer())).getPageCount(), 2);
  const reordered = await processPdf('Reorder Pages', [source], { pages: '3,1,2' });
  assert.equal(reordered.status, 200);
  assert.equal((await PDFDocument.load(await reordered.arrayBuffer())).getPageCount(), 3);
});

test('rotation and watermark produce parseable PDFs', async () => {
  const source = await pdfWithPages(2);
  const rotated = await processPdf('Rotate PDF', [source], { pages: '1', rotation: 90 });
  assert.equal((await PDFDocument.load(await rotated.arrayBuffer())).getPage(0).getRotation().angle, 90);
  const marked = await processPdf('Add Watermark', [source], { text: 'Test watermark' });
  assert.equal(marked.status, 200);
  assert.equal((await PDFDocument.load(await marked.arrayBuffer())).getPageCount(), 2);
  const numbered = await processPdf('Page Numbers', [source]);
  assert.equal(numbered.status, 200);
  assert.equal((await PDFDocument.load(await numbered.arrayBuffer())).getPageCount(), 2);
});

test('converts PNG image to a valid one-page PDF', async () => {
  const form = new FormData();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jY5kAAAAASUVORK5CYII=', 'base64');
  form.append('files', new Blob([png], { type: 'image/png' }), 'pixel.png');
  const response = await fetch(`${baseUrl}/api/process/JPG%20to%20PDF`, { method: 'POST', body: form });
  assert.equal(response.status, 200);
  const result = await PDFDocument.load(await response.arrayBuffer());
  assert.equal(result.getPageCount(), 1);
});

test('rejects empty, invalid, missing and unsupported operations without fake output', async () => {
  const missing = await processPdf('Merge PDF', []);
  assert.equal(missing.status, 400);
  const invalid = await processPdf('Rotate PDF', [Buffer.from('not a pdf')]);
  assert.equal(invalid.status, 400);
  const unavailable = await processPdf('Word to PDF', [await pdfWithPages(1)]);
  assert.equal(unavailable.status, 501);
  assert.match((await unavailable.json()).error, /not available/i);
  const compression = await processPdf('Compress PDF', [await pdfWithPages(1)]);
  assert.equal(compression.status, 501);
});
