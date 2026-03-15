# Security Policy

## Reporting Vulnerabilities

Brack is a security tool. We take vulnerabilities seriously.

If you discover a security issue in Brack itself, please report it 
responsibly rather than opening a public issue.

**Contact:** Open a private GitHub Security Advisory via the 
Security tab on this repo.

We will respond within 72 hours.

## Scope

We're particularly interested in:

- Bypass techniques for the prompt injection detection layer
- Novel injection patterns not currently detected
- False negative cases (attacks that should be blocked but aren't)
- False positive cases (legitimate inputs incorrectly blocked)
- Vulnerabilities in the x402 payment handling
- Issues with the SQLite logging or HMAC implementation

## Attack Pattern Contributions

If you discover a prompt injection pattern, encoding technique, 
or tool manipulation attack that Brack misses, please share it.

Open a GitHub issue labelled `attack-pattern` with:
- The attack payload (sanitised if needed)
- What it attempts to do
- Whether current Brack detects it

Every contributed pattern makes the detection layer stronger 
for everyone.

## Out of Scope

- The Beelink N100 hardware itself
- Tailscale tunnel configuration
- Issues with third-party dependencies (report to them directly)

## Disclosure Policy

We follow responsible disclosure. Please give us reasonable time 
to patch before public disclosure.

## Recognition

Contributors who report genuine bypasses or new attack patterns 
will be credited in the README.

Build in public. Harden in public. 🦞
