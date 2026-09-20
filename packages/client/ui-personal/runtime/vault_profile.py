"""Owner-controlled Markdown projections; Bok remains the claim/permission authority."""
import hashlib
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path


def digest(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def atomic(path, content):
    if path.is_symlink() or (hasattr(path, "is_junction") and path.is_junction()):
        raise ValueError("Linked profile files are not supported")
    fd, name = tempfile.mkstemp(prefix=".profile-", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as stream:
            stream.write(content)
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


class VaultProfile:
    def __init__(self, service, vault, runtime):
        self.service = service
        self.vault = Path(vault).absolute()
        self.folder = self.vault / "Memory/Semantic/profile"
        self.state_path = Path(runtime) / ("dsh-profile-" + digest(str(self.vault))[:16] + ".json")
        self.recovery = Path(runtime) / "dsh-profile-recovery"

    def paths(self, create=False):
        for path in [self.vault, self.vault / "Memory", self.vault / "Memory/Semantic", self.folder]:
            if path.is_symlink() or (hasattr(path, "is_junction") and path.is_junction()):
                raise ValueError("Profile directory must not use links")
            if create:
                path.mkdir(exist_ok=True)
            if path.exists() and not path.is_dir():
                raise ValueError("Invalid profile directory")

    def guard(self):
        self.paths()
        subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-File",
                        str(self.vault / "Workspace/Projects/Central Hub/Sync/Invoke-VaultSyncGuard.ps1"),
                        "-Mode", "Assert"], check=True, capture_output=True, timeout=30,
                       creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        self.paths(create=True)

    def state(self):
        if self.state_path.is_symlink():
            raise ValueError("Linked profile state is not supported")
        return json.loads(self.state_path.read_text(encoding="utf-8")) if self.state_path.exists() else {}

    def save_state(self, state):
        atomic(self.state_path, json.dumps(state, ensure_ascii=False, indent=2))

    def preserve_edit(self, key, text):
        if self.recovery.is_symlink() or (hasattr(self.recovery, "is_junction") and self.recovery.is_junction()):
            raise ValueError("Linked recovery directories are not supported")
        self.recovery.mkdir(exist_ok=True)
        atomic(self.recovery / (key + "-" + digest(text)[:16] + ".md"), text)

    @staticmethod
    def eligible(claim):
        return bool(claim and claim.get("effective") and claim.get("sensitivity") in {"none", "private"}
                    and claim.get("scope_kind") == "global" and "all-agents" in claim.get("access_scope", []))

    def file(self, claim_id):
        if not isinstance(claim_id, str) or not re.fullmatch(r"person-[0-9a-f]{32}", claim_id):
            raise ValueError("Invalid profile ID")
        path = self.folder / (claim_id + ".md")
        if path.is_symlink() or (hasattr(path, "is_junction") and path.is_junction()):
            raise ValueError("Linked profile file is not supported")
        return path

    def read(self, path):
        if path.stat().st_size > 32768:
            raise ValueError("Profile note is too large")
        return path.read_text(encoding="utf-8")

    @staticmethod
    def render(claim):
        fields = {"tags": ["memory", "profile"], "source": "bok-personal-core",
                  "claim_id": claim["id"], "core_version": claim["version"],
                  "claim_type": claim["claim_type"], "source_refs": claim.get("source_refs", [])}
        header = "---\n" + "\n".join(key + ": " + json.dumps(value, ensure_ascii=False) for key, value in fields.items()) + "\n---\n"
        return header + "\n# Personal profile\n\nEdit only the statement below, then preview and confirm the correction in DSH.\n\n<!-- statement:start -->\n" + claim["statement"] + "\n<!-- statement:end -->\n"

    @staticmethod
    def statement(content, original):
        pattern = r"\A(.*<!-- statement:start -->\n)([\s\S]*?)(\n<!-- statement:end -->\n)\Z"
        match = re.fullmatch(pattern, content, re.DOTALL)
        old = re.fullmatch(pattern, original, re.DOTALL)
        if not match or not old or match[1] != old[1] or match[3] != old[3]:
            raise ValueError("Only edit text between the statement markers")
        value = match[2].strip()
        if not value or len(value) > 1000 or "\x00" in value or "<!-- statement:" in value:
            raise ValueError("Statement must contain 1–1000 characters")
        return value

    def retract(self, state, claims):
        invalid = [key for key, entry in state.items() if not entry.get("withdrawn") and not self.eligible(claims.get(key))]
        if not invalid:
            return
        self.guard()
        for key in invalid:
            entry = state[key]
            path = self.file(key)
            if path.exists():
                text = self.read(path)
                # Preserve owner edits privately before removing the shared projection.
                if digest(text) != entry["hash"]:
                    self.preserve_edit(key, text)
                atomic(path, "---\ntags: [memory, profile]\nstatus: withdrawn\n---\n\n# Withdrawn profile\n\nThis record is no longer shared by Personal Core. It must not be imported or used as an active preference.\n")
            state[key] = {"withdrawn": True, "hash": digest(self.read(path)) if path.exists() else None}
        self.save_state(state)

    def reconcile(self):
        if not self.state_path.exists():
            return
        with self.service.person.lock:
            self.paths()
            state = self.state()
            claims = {item["id"]: item for item in self.service.person_claims(limit=10000)["items"]}
            self.retract(state, claims)

    def handle(self, payload):
        action = payload.get("action", "status")
        if action not in {"status", "export", "apply"}:
            raise ValueError("Unsupported profile action")
        with self.service.person.lock:
            self.paths()
            state = self.state()
            claims = {item["id"]: item for item in self.service.person_claims(limit=10000)["items"]}
            self.retract(state, claims)
            if action != "status":
                key = payload.get("id")
                path = self.file(key)
                claim = claims.get(key)
                if not self.eligible(claim):
                    raise ValueError("Only active, non-sensitive, global records shared with all Agents can be exported")
                if payload.get("version") != claim["version"]:
                    raise ValueError("Personal Core changed; refresh the preview")
                self.guard()
                current = self.read(path) if path.exists() else None
                entry = state.get(key)
                if action == "export":
                    if payload.get("confirm") is not True:
                        raise ValueError("Explicit approval to publish into the shared Vault is required")
                    if current is not None and (not entry or entry.get("withdrawn") or digest(current) != entry.get("hash")):
                        if not entry or (entry.get("withdrawn") and digest(current) != entry.get("hash")) or payload.get("confirm") is not True or payload.get("preview") != digest(current + ":" + str(claim["version"])):
                            raise ValueError("Existing Vault text is different; preview it instead of overwriting")
                        self.preserve_edit(key, current)
                else:
                    if payload.get("confirm") is not True:
                        raise ValueError("Explicit correction confirmation is required")
                    if not entry or entry.get("withdrawn") or entry["version"] != claim["version"] or current is None:
                        raise ValueError("Both sources changed or the export is missing; resolve the conflict first")
                    token = digest(current + ":" + str(claim["version"]))
                    if payload.get("preview") != token:
                        raise ValueError("Vault text changed; preview it again")
                    statement = self.statement(current, entry["content"])
                    if statement != claim["statement"]:
                        claim = self.service.correct_person_claim(key, statement=statement,
                            source_ref="vault:Memory/Semantic/profile/" + key + ".md")
                content = self.render(claim)
                # Never overwrite an edit made after the preview/read while the guard or API ran.
                if (self.read(path) if path.exists() else None) != current:
                    raise ValueError("Vault changed during synchronization; refresh to resolve")
                atomic(path, content)
                state[key] = {"version": claim["version"], "hash": digest(content), "content": content}
                self.save_state(state)
                claims[key] = claim
            rows = []
            for key, claim in claims.items():
                if not self.eligible(claim):
                    continue
                entry = state.get(key)
                path = self.file(key)
                row = {"id": key, "statement": claim["statement"], "version": claim["version"], "sensitivity": claim["sensitivity"], "status": "not_exported"}
                if entry and entry.get("withdrawn"):
                    row["status"] = "withdrawn"
                    if path.exists():
                        row["preview"] = digest(self.read(path) + ":" + str(claim["version"]))
                elif entry and path.exists():
                    try:
                        content = self.read(path)
                        changed = digest(content) != entry["hash"]
                        stale = entry["version"] != claim["version"]
                        row["status"] = "conflict" if changed and stale else "vault_changed" if changed else "core_changed" if stale else "synced"
                        if changed:
                            row["vaultStatement"] = self.statement(content, entry["content"])
                            row["preview"] = digest(content + ":" + str(claim["version"]))
                    except ValueError as error:
                        row.update(status="conflict", error=str(error))
                rows.append(row)
            return {"folder": "Memory/Semantic/profile", "items": rows,
                    "withdrawn": sum(bool(entry.get("withdrawn")) for entry in state.values())}
