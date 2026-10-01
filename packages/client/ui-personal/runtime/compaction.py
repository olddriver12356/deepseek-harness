"""Owner-reviewed merging and Chinese rewriting of Personal Core claims.

The model only proposes. Every proposal is stored under the Personal Core state directory, and apply
reads statements from that stored proposal, never from the browser, so the owner approves exactly
what the model returned. Bok's own supersede, correct, expire and add_evidence operations perform
every write, so history, versions and backups keep their original Bok formats.
"""
import json
import re
import uuid
from pathlib import Path
from bok_core.util import atomic_write_json, utc_now

CLAIM_ID = re.compile(r"person-[0-9a-f]{32}")
GROUP_FIELDS = ("claim_type", "scope_kind", "scope_value", "sensitivity")


def is_chinese_statement(text):
    return isinstance(text, str) and text.startswith("用户") and 4 <= len(text) <= 1000


class Compaction:
    def __init__(self, service):
        self.person = service.person

    @property
    def directory(self):
        path = self.person.state_dir / "dsh-compaction"
        if path.is_symlink():
            raise ValueError("Compaction receipts cannot be linked")
        path.mkdir(parents=True, exist_ok=True)
        return path

    def _receipt(self, proposal_id, suffix):
        if not re.fullmatch(r"compaction-[0-9a-f]{32}", str(proposal_id)):
            raise ValueError("Invalid compaction id")
        return self.directory / f"{proposal_id}.{suffix}.json"

    def candidates(self):
        # Only effective claims are rewritten. Sensitive claims never leave Personal Core; private claims leave only after owner consent.
        return [item for item in self.person.list(status="all", limit=10000)["items"] if item["effective"] and item["sensitivity"] != "sensitive"]

    def prepare(self):
        items = self.candidates()
        return {
            "claims": [{"id": item["id"], **{key: item[key] for key in GROUP_FIELDS}, "statement": item["statement"]} for item in items],
            "private": sum(1 for item in items if item["sensitivity"] == "private"),
            "untranslated": sum(1 for item in items if not is_chinese_statement(item["statement"])),
        }

    def begin(self, request):
        proposal_id = f"compaction-{uuid.uuid4().hex}"
        atomic_write_json(self._receipt(proposal_id, "request"), {"id": proposal_id, "created_at": utc_now(), "request": request})
        return {"id": proposal_id}

    def propose(self, proposal_id, output):
        request_path = self._receipt(proposal_id, "request")
        if not request_path.is_file():
            raise ValueError("Unknown compaction request")
        claims = {item["id"]: item for item in self.candidates()}
        result = json.loads(re.sub(r"^\s*```(?:json)?\s*|\s*```\s*$", "", output))
        if not isinstance(result, dict) or set(result) != {"merges", "translations"} or not all(isinstance(result[key], list) for key in result):
            raise ValueError("Invalid compaction response")
        used = set()
        items = []

        def claim(claim_id):
            if not isinstance(claim_id, str) or not CLAIM_ID.fullmatch(claim_id) or claim_id not in claims or claim_id in used:
                raise ValueError("Compaction response references an unknown or repeated claim")
            used.add(claim_id)
            return claims[claim_id]

        for row in result["merges"]:
            if not isinstance(row, dict) or set(row) != {"ids", "statement"} or not isinstance(row["ids"], list) or len(row["ids"]) < 2:
                raise ValueError("Invalid compaction merge")
            if not is_chinese_statement(row["statement"]):
                raise ValueError("Merged statements must be Simplified Chinese starting with 用户")
            originals = [claim(claim_id) for claim_id in row["ids"]]
            if any(tuple(item[key] for key in GROUP_FIELDS) != tuple(originals[0][key] for key in GROUP_FIELDS) for item in originals):
                raise ValueError("Merged claims must share type, scope and sensitivity")
            items.append({"kind": "merge", "statement": row["statement"], "originals": [self._original(item) for item in originals]})
        for row in result["translations"]:
            if not isinstance(row, dict) or set(row) != {"id", "statement"}:
                raise ValueError("Invalid compaction translation")
            if not is_chinese_statement(row["statement"]):
                raise ValueError("Translated statements must be Simplified Chinese starting with 用户")
            original = claim(row["id"])
            if original["statement"] == row["statement"]:
                continue
            items.append({"kind": "translate", "statement": row["statement"], "originals": [self._original(original)]})
        proposal = {"id": proposal_id, "created_at": utc_now(), "output": output, "items": items}
        atomic_write_json(self._receipt(proposal_id, "proposal"), proposal)
        return {"id": proposal_id, "items": items}

    @staticmethod
    def _original(item):
        return {"id": item["id"], "version": item["version"], "statement": item["statement"], "claim_type": item["claim_type"], "sensitivity": item["sensitivity"]}

    def apply(self, proposal_id, accepted):
        proposal_path = self._receipt(proposal_id, "proposal")
        result_path = self._receipt(proposal_id, "result")
        if not proposal_path.is_file():
            raise ValueError("Unknown compaction proposal")
        if result_path.exists():
            raise ValueError("This compaction proposal was already applied")
        items = json.loads(proposal_path.read_text(encoding="utf-8"))["items"]
        if not isinstance(accepted, list) or len(set(accepted)) != len(accepted) or any(type(index) is not int or not 0 <= index < len(items) for index in accepted):
            raise ValueError("Invalid accepted compaction items")
        selected = [items[index] for index in sorted(accepted)]
        # Refuse the whole batch when any reviewed claim changed after the owner saw it.
        for item in selected:
            for original in item["originals"]:
                current = self.person.get(original["id"])
                if current["version"] != original["version"] or not current["effective"]:
                    raise ValueError("A reviewed claim changed after the proposal; create a new proposal")
        # Every applied batch can be restored from the Bok backup taken immediately before it.
        backup = self.person.create_backup()["backup_id"] if selected else ""
        source_ref = f"dsh-compaction:{proposal_id}"
        applied = []
        failure = ""
        for item in selected:
            try:
                first, *rest = item["originals"]
                if item["kind"] == "translate":
                    self.person.correct(first["id"], statement=item["statement"], source_ref=source_ref)
                    applied.append({"kind": "translate", "id": first["id"]})
                    continue
                replacement = self.person.supersede(first["id"], statement=item["statement"], source_ref=source_ref)["replacement"]["id"]
                references = list(self.person.get(replacement)["source_refs"])
                for original in rest:
                    for reference in self.person.get(original["id"])["source_refs"]:
                        if reference not in references and len(references) < 50:
                            references.append(reference)
                    self.person.expire(original["id"], reason=f"已合并到 {replacement}", confirm_important=True)
                self.person.add_evidence(replacement, source_refs=references)
                applied.append({"kind": "merge", "id": replacement, "merged": [original["id"] for original in item["originals"]]})
            except Exception as error:
                failure = str(error)
                break
        atomic_write_json(result_path, {"id": proposal_id, "applied_at": utc_now(), "backup_id": backup, "accepted": sorted(accepted), "applied": applied, "error": failure})
        return {"backup_id": backup, "applied": applied, "error": failure}

    def handle(self, request):
        action = request["action"]
        if action == "prepare":
            return self.prepare()
        if action == "begin":
            return self.begin(request["request"])
        if action == "propose":
            return self.propose(request["proposal"], request["output"])
        if action == "apply":
            return self.apply(request["proposal"], request["accepted"])
        raise ValueError("Unknown compaction action")
