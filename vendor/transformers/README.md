# Vendored: @huggingface/transformers 3.3.3

Self-hosted so DockEcho's opt-in semantic echoes need **no third-party CDN**. Served
same-origin from `dockecho.com`; the strict CSP allows `script-src 'self'
'wasm-unsafe-eval'` and same-origin `connect-src`.

| File | Source | Size | Notes |
|------|--------|------|-------|
| `transformers.min.js` | `cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3/dist/transformers.min.js` | ~820 KB | ESM bundle; version banner prepended, sourcemap ref stripped. Exposes `env`, `pipeline`. |
| `wasm/ort-wasm-simd-threaded.jsep.wasm` | same package `dist/` | ~23 MB | onnxruntime-web WASM/JSEP backend (bundles ORT `1.21.0-dev.20250206-d981b153d3`). |
| `wasm/ort-wasm-simd-threaded.jsep.mjs` | same package `dist/` | ~49 KB | ORT wasm loader glue. |

`assets/semantic.js` imports `transformers.min.js` and sets
`env.backends.onnx.wasm.wasmPaths = "/vendor/transformers/wasm/"`.

**Model weights are NOT here** — the quantized ONNX is >100 MB (over GitHub's file
limit) and is served from `models.dockecho.com` (Cloudflare R2). See `models/` in
`.gitignore` and `SEMANTIC_MODEL_HOST` in `assets/semantic.js`.

License: Apache-2.0 (upstream). Regenerate by re-downloading the three files at the
pinned version above — do not hand-edit.
