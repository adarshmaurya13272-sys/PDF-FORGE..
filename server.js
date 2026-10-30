const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const cors = require('cors');
const path = require('node:path');
const { PDFDocument, StandardFonts, degrees, rgb } = require('pdf-lib');

const app = express();
const port = Number(process.env.PORT || 3000);
const maxFileBytes = Number(process.env.MAX_FILE_BYTES || 25 * 1024 * 1024);
const allowedOrigin = process.env.ALLOWED_ORIGIN;
app.disable('x-powered-by');
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: { directives: {
    ...helmet.contentSecurityPolicy.getDefaultDirectives(),
    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    'font-src': ["'self'", 'https://fonts.gstatic.com'],
    'connect-src': ["'self'"],
    'img-src': ["'self'", 'data:', 'blob:']
  } }
}));
if (allowedOrigin) app.use(cors({ origin: allowedOrigin, methods: ['GET', 'POST'], allowedHeaders: ['Content-Type'] }));
app.get(['/', '/index.html'], (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get(['/styles.css', '/app.js'], (req, res) => res.sendFile(path.join(__dirname, path.basename(req.path))));
app.use('/api/', rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxFileBytes, files: 10, fields: 20, fieldSize: 4096 } });

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'PDF Forge processing API' }));

function pageIndexes(value, count) {
  if (!value) return Array.from({ length: count }, (_, i) => i);
  const selected = new Set();
  for (const part of String(value).split(',')) {
    const range = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!range) throw new Error('Enter pages as numbers or ranges, for example 1,3-5.');
    const start = Number(range[1]);
    const end = Number(range[2] || range[1]);
    if (start < 1 || end < start || end > count) throw new Error(`Page ranges must be between 1 and ${count}.`);
    for (let page = start; page <= end; page++) selected.add(page - 1);
  }
  return [...selected];
}

function assertPdf(file) {
  if (!file || !file.buffer || file.buffer.length < 8) throw new Error('Please select a non-empty PDF file.');
  if (file.buffer.subarray(0, 5).toString() !== '%PDF-') throw new Error(`${file.originalname}: the file content is not a valid PDF.`);
}

app.post('/api/process/:tool', upload.array('files', 10), async (req, res, next) => {
  try {
    const tool = req.params.tool;
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: 'Select at least one file to continue.' });
    const pdfTools = new Set(['Merge PDF', 'Split PDF', 'Rotate PDF', 'Organize PDF', 'Add Watermark', 'Page Numbers', 'Delete Pages', 'Reorder Pages']);
    if (tool === 'Compress PDF') return res.status(501).json({ error: 'PDF compression is unavailable: this server has no image/PDF optimizer configured. A simple rewrite would not reliably reduce file size, so no misleading output was created.' });
    if (!pdfTools.has(tool) && tool !== 'JPG to PDF') {
      return res.status(501).json({ error: `${tool} is not available yet. This installation has no office conversion, PDF rendering, or PDF encryption engine configured. Your files were not processed.` });
    }

    let output;
    let filename = 'pdf-forge-result.pdf';
    if (tool === 'JPG to PDF') {
      const doc = await PDFDocument.create();
      for (const file of files) {
        const type = file.mimetype;
        let image;
        try {
          if (type === 'image/jpeg' || file.originalname.toLowerCase().endsWith('.jpg') || file.originalname.toLowerCase().endsWith('.jpeg')) image = await doc.embedJpg(file.buffer);
          else if (type === 'image/png' || file.originalname.toLowerCase().endsWith('.png')) image = await doc.embedPng(file.buffer);
          else throw new Error(`${file.originalname}: only JPEG and PNG are supported for image-to-PDF.`);
        } catch (error) { throw new Error(`Could not read ${file.originalname} as an image. ${error.message}`); }
        const page = doc.addPage([image.width, image.height]);
        page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
      }
      output = await doc.save();
      filename = 'images.pdf';
    } else {
      for (const file of files) assertPdf(file);
      const documents = await Promise.all(files.map(async file => {
        try { return await PDFDocument.load(file.buffer); }
        catch { throw new Error(`Could not open ${file.originalname}. It may be damaged, encrypted, or unsupported.`); }
      }));
      let result;
      if (tool === 'Merge PDF') {
        if (documents.length < 2) throw new Error('Choose at least two PDF files to merge.');
        result = await PDFDocument.create();
        for (const doc of documents) for (const page of await result.copyPages(doc, doc.getPageIndices())) result.addPage(page);
        filename = 'merged.pdf';
      } else {
        if (documents.length !== 1) throw new Error('Choose one PDF for this action.');
        const source = documents[0];
        const count = source.getPageCount();
        if (!count) throw new Error('This PDF contains no pages.');
        if (['Delete Pages', 'Reorder Pages'].includes(tool) && !String(req.body.pages || '').trim()) throw new Error(tool === 'Delete Pages' ? 'Enter the page numbers to remove.' : 'Enter every page number in the order you want, for example 3,1,2.');
        const indexes = pageIndexes(req.body.pages, count);
        if (!indexes.length) throw new Error('Choose at least one page.');
        if (tool === 'Split PDF' || tool === 'Delete Pages' || tool === 'Organize PDF' || tool === 'Reorder Pages') {
          const order = tool === 'Delete Pages' ? source.getPageIndices().filter(i => !indexes.includes(i)) : tool === 'Reorder Pages' ? String(req.body.pages || '').split(',').map(v => Number(v.trim()) - 1) : indexes;
          if (!order.length || order.some(i => !Number.isInteger(i) || i < 0 || i >= count)) throw new Error(tool === 'Delete Pages' ? 'Deleting those pages would leave the PDF empty.' : 'Reorder pages by entering every page number in the desired order, separated by commas.');
          result = await PDFDocument.create();
          for (const page of await result.copyPages(source, order)) result.addPage(page);
          filename = tool === 'Split PDF' ? 'split-pages.pdf' : tool === 'Delete Pages' ? 'pages-removed.pdf' : tool === 'Reorder Pages' ? 'pages-reordered.pdf' : 'pages-organized.pdf';
        } else {
          result = source;
          if (tool === 'Rotate PDF') {
            const rotation = Number(req.body.rotation || 90);
            if (![90, 180, 270].includes(rotation)) throw new Error('Rotation must be 90, 180, or 270 degrees.');
            for (const index of indexes) result.getPage(index).setRotation(degrees((result.getPage(index).getRotation().angle + rotation) % 360));
            filename = 'rotated.pdf';
          } else if (tool === 'Add Watermark') {
            const text = String(req.body.text || '').trim().slice(0, 100);
            if (!text) throw new Error('Enter watermark text (up to 100 characters).');
            const font = await result.embedFont(StandardFonts.Helvetica);
            for (const index of indexes) {
              const page = result.getPage(index); const { width, height } = page.getSize();
              page.drawText(text, { x: width * .12, y: height * .48, size: Math.min(width, height) * .065, font, color: rgb(.55, .55, .58), opacity: .28, rotate: degrees(-35) });
            }
            filename = 'watermarked.pdf';
          } else if (tool === 'Page Numbers') {
            const font = await result.embedFont(StandardFonts.Helvetica);
            for (const [number, index] of indexes.entries()) {
              const page = result.getPage(index); const { width } = page.getSize();
              page.drawText(`${number + 1}`, { x: width / 2, y: 22, size: 10, font, color: rgb(.35, .35, .38) });
            }
            filename = 'numbered.pdf';
          } else if (tool === 'Compress PDF') {
            // pdf-lib can rewrite the PDF structure, but does not recompress embedded images.
            filename = 'optimized.pdf';
          }
        }
      }
      output = await result.save({ useObjectStreams: true });
    }

    const resultBuffer = Buffer.from(output || []);
    if (resultBuffer.length < 8 || resultBuffer.subarray(0, 5).toString() !== '%PDF-') throw new Error('Processing did not produce a valid PDF.');
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"`, 'Content-Length': String(resultBuffer.length), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.send(resultBuffer);
  } catch (error) { next(error); }
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? `Each file must be smaller than ${Math.round(maxFileBytes / 1024 / 1024)} MB.` : 'Upload limits exceeded. Select fewer files or smaller fields.' });
  const message = err.message || 'Processing failed. Please check the file and try again.';
  res.status(400).json({ error: message.slice(0, 300) });
});

if (require.main === module) app.listen(port, () => console.log(`PDF Forge listening on http://localhost:${port}`));
module.exports = app;
