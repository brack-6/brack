#!/usr/bin/env python3
import sys

SWARM = 'swarm.js'
with open(SWARM, 'r') as f: src = f.read()

# Print exact line 514 bytes for diagnosis
lines = src.splitlines()
print(f'Line 514: {repr(lines[513])}')

OLD = lines[513]  # exact line from file
NEW = OLD + "\n                                .replace(/xox[baprs]-[a-zA-Z0-9\\-]{10,}/gi, '[REDACTED_SLACK_TOKEN]')"

if OLD not in src:
    print('Cannot anchor on line 514 content'); sys.exit(1)
if src.count(OLD) > 1:
    print(f'Line appears {src.count(OLD)} times — not unique'); sys.exit(1)

out = src.replace(OLD, NEW)
with open(SWARM, 'w') as f: f.write(out)
print('Slack redaction added.')
