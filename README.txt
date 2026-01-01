# Sunwoo Takbae - Stable Pack

## Deploy (GitHub -> Netlify)
1) Put all files in repo root (same level).
2) Netlify settings:
   - Publish directory: .
   - Functions directory: netlify/functions (from netlify.toml)
3) Deploy, then test:
   - /api/ping  -> {"ok":true,...}
   - /api/kv/get?key=DELIVERY_STORES_V1
   - /api/reservations

## Notes
- All data is stored in Netlify Blobs store: "sunwoo-takbae-v1"
- Works across devices as long as you use the same deployed domain.
