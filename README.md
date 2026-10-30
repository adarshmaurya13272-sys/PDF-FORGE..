# PDF Forge

PDF Forge is a small, same-origin Node.js application that serves the existing responsive frontend and provides temporary in-memory PDF processing. It does not persist uploaded documents.

## Run locally

Requirements: Node.js 20 or later and npm.

```sh
npm ci
npm start
```

Open <http://localhost:3000>. `npm run dev` enables Node's watch mode. `GET /api/health` is the health check. Copy `.env.example` to `.env` and set `PORT`, `MAX_FILE_BYTES`, or `ALLOWED_ORIGIN` if required (the app does not automatically load `.env`; provide variables in the process environment or deployment configuration).

## Current processing support

- **Working:** Merge PDF; extract a page selection as a new PDF (Split PDF); rotate selected pages; reorder pages; delete pages; add text watermark; add page numbers; convert JPEG/PNG images to PDF.
- **Explicitly unavailable:** Word/Excel/PowerPoint conversion, PDF-to-Word, PDF-to-JPG, image/PDF compression, password protection and password removal. These require office conversion, PDF rendering, optimization or encryption/decryption engines that are not part of this install. Requests return an error and do not generate a pretend result.
- PDF operations use `pdf-lib`. Text extraction/layout preservation, encrypted PDFs, advanced PDF constructs, and image recompression are not supported. Image-to-PDF places each selected image on its own page at its source dimensions.

## Limits and security

- Uploads are capped at 25 MiB each by default, with at most 10 files per request; set `MAX_FILE_BYTES` to adjust the per-file limit.
- Upload data is held in process memory only and released after the request. There is no file persistence, job queue, database, or user account system.
- PDF signature is checked before parsing; parsed and generated documents are validated by `pdf-lib` and generated output is checked for a PDF signature.
- Helmet security headers, a same-origin policy by default, optional exact-origin CORS, and an API rate limit (20 requests per minute per client IP) are configured.
- Do not deploy behind a proxy without correctly configuring Express `trust proxy` for your deployment, or rate limiting may group clients incorrectly. Use HTTPS at the deployment edge. Large/concurrent documents can consume significant memory; use a queue/worker and isolated temporary storage before raising limits or scaling.

## Test

```sh
npm test
```

The tests exercise the HTTP API with generated PDFs and validate that output PDFs can be reopened and have the expected pages/content metadata. They do not certify every browser/device or office conversion (which is unavailable).

## Deployment

Deploy as a Node.js 20+ service, run `npm ci --omit=dev`, set `PORT` and optionally `MAX_FILE_BYTES` / `ALLOWED_ORIGIN`, and start with `npm start`. Route HTTPS traffic to the service and expose `/api/health` to the platform health checker. No database or secrets are currently required. This repository is not deployed by these instructions.
