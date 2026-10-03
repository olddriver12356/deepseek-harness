"""Regression checks for escaped Personal Core scopes and evidence references."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "vendor/bok/Bok"))
from bok_core.markdown import parse_frontmatter, render_frontmatter

values = {"scope_value": r"C:\SecondBrain\Knowledge\Psychology\Stress and Wellbeing\NURS180", "source_refs": [r"C:\SecondBrain\note.md"], "statement": '用户偏好“中文”与 "quoted" text'}
for _ in range(8):
    parsed, _ = parse_frontmatter(render_frontmatter(values))
    assert parsed == values, (parsed, values)
print("Frontmatter scalar and list roundtrips passed across eight saves")
