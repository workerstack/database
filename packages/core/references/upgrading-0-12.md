---
description: Upgrading to 0.12
order: 320
---

# Upgrading to 0.12

0.12 makes the cursor seal's two packages peers. It is a breaking minor; what changes for a project on 0.11:

**Install** `@noble/ciphers` and `@noble/hashes` (`>=2.4.0 <3`) beside comb. From 0.12 they are required peers, which seal and key the cursors, so the app and comb share one copy.
