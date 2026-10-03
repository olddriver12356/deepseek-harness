"""Back up and repair over-escaped drive-letter project scopes only."""
import json
import re
import shutil
from datetime import datetime
from pathlib import Path
import os

root = Path(os.environ['USERPROFILE']) / '.dsh/personal-core'
backup = root / '.bok/backups' / ('project-scope-repair-' + datetime.now().strftime('%Y%m%dT%H%M%S'))
count = 0
for folder in ('Claims', 'Observations'):
    for path in (root / folder).glob('*.md'):
        text = path.read_text(encoding='utf-8')
        match = re.search(r'^scope_value: (".*")$', text, re.M)
        if not match:
            continue
        value = json.loads(match[1])
        if not re.match(r'^[A-Za-z]:\\', value) or not re.search(r'\\{2,}', value):
            continue
        fixed = re.sub(r'\\+', lambda _: '\\', value)
        target = backup / path.relative_to(root)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
        # Refuse to overwrite a concurrent change since the read.
        assert path.read_text(encoding='utf-8') == text, f'Concurrent change: {path}'
        path.write_text(text[:match.start(1)] + json.dumps(fixed, ensure_ascii=False) + text[match.end(1):], encoding='utf-8')
        count += 1
print(f'Repaired {count} project scopes; backup: {backup}')
