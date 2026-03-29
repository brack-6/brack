#!/usr/bin/env python3
import sys

SWARM = 'swarm.js'
with open(SWARM, 'r') as f: src = f.read()

OLD = (
    'const HIGH_PRIORITY_PATTERNS = [\n'
    '  /ignores+(?:(?:all|your|both)s+)*(?:previouss+|priors+)?(?:instructions|rules|guidelines|constraints|systems+prompt)/i,\n'
    '  /###s*(?:system|instruction|override|prompt)/i,\n'
    '  /\x08DAN\x08.*(?:nos+restrictions?|ignore|bypass|disregard)/i,\n'
    '  /yous+ares+nows+(?:DAN|an?s+AIs+withs+nos+restrictions?|unrestricted|jailbroken)/i,\n'
    '  /<|system|>|<|im_start|>/i,\n'
    '  /STOP.s*News+tasks*:/i,\n'
    r'  /(?:developer|admin|administrator|operator)\s+override/i,' + '\n'
    r'  /(?:roleplay|role.play|pretend)\b[^.]{0,60}(?:no\s+restrictions?|without\s+restrictions?|ignore\s+(?:all\s+)?(?:safety|rules?|guidelines?))/i,' + '\n'
    '];'
)

NEW = (
    'const HIGH_PRIORITY_PATTERNS = [\n'
    r'  /ignore\s+(?:(?:all|your|both)\s+)*(?:previous\s+|prior\s+)?(?:instructions|rules|guidelines|constraints|system\s+prompt)/i,' + '\n'
    r'  /###\s*(?:system|instruction|override|prompt)/i,' + '\n'
    r'  /\bDAN\b.*(?:no\s+restrictions?|ignore|bypass|do\s+anything)/i,' + '\n'
    r'  /you\s+are\s+now\s+(?:DAN|an?\s+AI\s+with\s+no\s+restrictions?|unrestricted|jailbroken)/i,' + '\n'
    r'  /<\|system\|>|<\|im_start\|>/i,' + '\n'
    r'  /STOP\.\s*New\s+task\s*:/i,' + '\n'
    r'  /(?:developer|admin|administrator|operator)\s+override/i,' + '\n'
    r'  /(?:roleplay|role.play|pretend)\b[\s\S]{0,80}(?:no\s+restrictions?|without\s+restrictions?|ignore\s+(?:all\s+)?(?:safety|rules?|guidelines?))/i,' + '\n'
    '];'
)

if OLD not in src:
    # diagnose
    for i, line in enumerate(src.splitlines()[251:262], 252):
        print(f'{i}: {repr(line)}')
    sys.exit(1)

out = src.replace(OLD, NEW)
with open(SWARM, 'w') as f: f.write(out)
print('Patched. Run: pm2 restart brack && node brack-eval-v0.7.mjs')
