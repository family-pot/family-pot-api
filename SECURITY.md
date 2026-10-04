# Security Policy

This is the backend repo — the one that will eventually touch Stellar transactions and hold
financial data. The org-wide security policy, vulnerability reporting process, and design
principles are in
[family-pot-docs/SECURITY.md](https://github.com/family-pot/family-pot-docs/blob/main/SECURITY.md) —
read that first. Also see
[family-pot-docs/THREAT_MODEL.md](https://github.com/family-pot/family-pot-docs/blob/main/THREAT_MODEL.md).

## This repo, specifically

- Never requests, stores, or logs a Stellar secret key, under any circumstances.
- A Stellar transfer is marked verified only after confirmation from Horizon — never
  optimistically marked complete.
- Any PR touching Stellar code (from milestone M4 onward) requires a security-focused review
  referencing `THREAT_MODEL.md` before merge.
- Report vulnerabilities privately via GitHub's advisory tool on this repo:
  <https://github.com/family-pot/family-pot-api/security/advisories/new>
