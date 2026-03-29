#!/usr/bin/env python3
"""Fixes only HIGH_PRIORITY_PATTERNS (S4) in swarm.js"""
import sys

SWARM = 'swarm.js'
with open(SWARM, 'r') as f: src = f.read()

OLD = r"""const HIGH_PRIORITY_PATTERNS = [
  /ignores+(?:(?:all|your|both)s+)*(?:previouss+|priors+)?(?:instructions|rules|guidelines|constraints|systems+prompt)/i,
  /###s*(?:system|instruction|override|prompt)/i,
  DA.*(?:nos+restrictions?|ignore|bypass|disregard)/i,
  /yous+ares+nows+(?:DAN|an?s+AIs+withs+nos+restrictions?|unrestricted|jailbroken)/i,
  /<|system|>|<|im_start|>/i,
  /STOP.s*News+tasks*:/i,
  /(?:developer|admin|administrator|operator)\s+override/i,
  /(?:roleplay|role.play|pretend)\b[^.]{0,60}(?:no\s+restrictions?|without\s+restrictions?|ignore\s+(?:all\s+)?(?:safety|rules?|guidelines?))/i,
];"""

NEW = r"""const HIGH_PRIORITY_PATTERNS = [
  /ignore\s+(?:(?:all|your|both)\s+)*(?:previous\s+|prior\s+)?(?:instructions|rules|guidelines|constraints|system\s+prompt)/i,
  /###\s*(?:system|instruction|override|prompt)/i,
  /\bDAN\b.*(?:no\s+restrictions?|ignore|bypass|do\s+anything)/i,
  /you\s+are\s+now\s+(?:DAN|an?\s+AI\s+with\s+no\s+restrictions?|unrestricted|jailbroken)/i,
  /<\|system\|>|<\|im_start\|>/i,
  /STOP\.\s*New\s+task\s*:/i,
  /(?:developer|admin|administrator|operator)\s+override/i,
  /(?:roleplay|role.play|pretend)\b[\s\S]{0,80}(?:no\s+restrictions?|without\s+restrictions?|ignore\s+(?:all\s+)?(?:safety|rules?|guidelines?))/i,
];"""

if OLD not in src:
    print('ANCHOR NOT FOUND — dumping lines 252-261 for inspection:')
    for i, line in enumerate(src.splitlines()[251:261], 252):
        print(f'  {i}: {repr(line)}')
    sys.exit(1)

if src.count(OLD) > 1:
    print('ANCHOR NOT UNIQUE'); sys.exit(1)

out = src.replace(OLD, NEW)
with open(SWARM, 'w') as f: f.write(out)
print('S4 patched. Run: pm2 restart brack && node brack-eval-v0.7.mjs')
