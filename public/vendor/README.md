# Vendored Three.js

- **Version:** `three@0.169.0` (REVISION `169`)
- **File:** `three.module.js` — single ESM build, committed as-is, unmodified
- **Source URL:** https://unpkg.com/three@0.169.0/build/three.module.js
- **Why vendored (not an npm runtime dependency):** architecture §5.2 — no bundler for Phase 1; the browser loads this file directly via the import map in `index.html` (`"three": "/vendor/three.module.js"`). Not listed in `package.json` since it is a browser asset, not a Node dependency.

Do not float this version. If a future phase bumps Three, update this file and this README together.
