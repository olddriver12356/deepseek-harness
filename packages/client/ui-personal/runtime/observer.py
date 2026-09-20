"""Owner switch, privacy admission and evidence checks for DSH's automatic observer."""
import json
import math
import re
from pathlib import Path
from bok_core.util import atomic_write_json


class Observer:
    def __init__(self, service, vault, token, call_tool, signal_schema):
        self.service = service
        self.path = Path(vault) / "dsh-observer.json"
        self.token = token
        self.call_tool = call_tool
        self.schema = signal_schema

    def settings(self, enabled=None):
        if self.path.is_symlink():
            raise ValueError("Observer settings cannot be linked")
        if enabled is not None:
            if type(enabled) is not bool:
                raise ValueError("enabled must be boolean")
            atomic_write_json(self.path, {"enabled": enabled})
        value = json.loads(self.path.read_text(encoding="utf-8")) if self.path.exists() else {}
        if value and (set(value) != {"enabled"} or type(value["enabled"]) is not bool):
            raise ValueError("Invalid observer settings")
        return value

    def preflight(self, content):
        if self.settings().get("enabled") is not True:
            return {"allowed": False, "reason": "disabled"}
        # Read with the restricted credential before any model dispatch, including after revocation.
        checked = self.call_tool("bok_person_context", {"task": "Check personal memory access", "limit": 1})
        if checked["isError"]:
            return {"allowed": False, "reason": "access_revoked"}
        if not isinstance(content, list) or not content or len(content) > 100 or any(not isinstance(x, str) or len(x) > 40000 for x in content):
            raise ValueError("Invalid observer input")
        for text in content:
            if self.service.person_learning._looks_sensitive(text):
                return {"allowed": False, "reason": "excluded_sensitive"}
            if re.search(r"do[_ -]not[_ -]remember|session[_ -]only|external_content|don[’']?t\s+(?:remember|store|save)|do not\s+(?:remember|store|save)|off[ -]the[ -]record|不[要准必].{0,6}(?:记住|记录|保存)|别.{0,4}(?:记|存)|仅限本次|只在本次|不要长期", text, re.I):
                return {"allowed": False, "reason": "excluded_private"}
        return {"allowed": True, "reason": "ready"}

    def validate_signal(self, signal):
        if not isinstance(signal, dict) or set(signal) - set(self.schema["properties"]) or set(self.schema["required"]) - set(signal):
            raise ValueError("Invalid personal signal fields")
        for key, value in signal.items():
            field = self.schema["properties"][key]
            if field["type"] == "string":
                if not isinstance(value, str) or len(value) < field.get("minLength", 0) or len(value) > field.get("maxLength", 1000):
                    raise ValueError("Invalid personal signal string")
                if "enum" in field and value not in field["enum"]:
                    raise ValueError("Invalid personal signal enum")
                if "pattern" in field and not re.fullmatch(field["pattern"], value):
                    raise ValueError("Invalid personal signal pattern")
            elif field["type"] == "number":
                if type(value) not in (float, int) or not math.isfinite(value) or not field.get("minimum", 0) <= value <= field.get("maximum", 1):
                    raise ValueError("Invalid personal signal confidence")
        if signal.get("claim_id"):
            raise ValueError("Automatic observations cannot target a claim")

    def handle(self, request):
        action = request["action"]
        if action == "settings":
            return self.settings(request.get("enabled"))
        content = request.get("content")
        admission = self.preflight(content)
        if action == "preflight":
            return admission
        if action != "commit":
            raise ValueError("Unknown observer action")
        if not admission["allowed"]:
            return {"status": admission["reason"], "observations": 0}
        result = json.loads(request["output"])
        if not isinstance(result, dict) or set(result) != {"observations"} or not isinstance(result["observations"], list) or len(result["observations"]) > 8:
            raise ValueError("Invalid observation response")
        grouped = {}
        for row in result["observations"]:
            if not isinstance(row, dict) or set(row) != {"message_index", "evidence", "signal"}:
                raise ValueError("Invalid observation entry")
            index, quote, signal = row["message_index"], row["evidence"], row["signal"]
            if type(index) is not int or not 0 <= index < len(content) or not isinstance(quote, str) or not quote.strip() or len(quote) > 240 or quote not in content[index]:
                raise ValueError("Observation evidence does not match its human message")
            self.validate_signal(signal)
            if signal.get("sensitivity", "none") != "none" or self.service.person_learning._looks_sensitive(signal["candidate_statement"]):
                continue
            if signal["scope_kind"] != "global":
                signal = {**signal, "scope_kind": "project", "scope_value": request.get("project", "")}
                if not signal["scope_value"]:
                    continue
            grouped.setdefault(index, []).append(signal)
        count = 0
        # Each row has a stable conversation/turn identity; Bok rejects mismatched retries.
        for index, signals in grouped.items():
            response = self.call_tool("bok_observe_conversation", {
                "conversation_id": request["conversation_id"], "turn_id": request["turn_id"] + "-" + str(index),
                "role": "user", "content": content[index], "project": request.get("project", ""),
                "personal_signals": signals, "client": "dsh-auto-observer",
            })
            if response["isError"]:
                raise ValueError("Personal Core rejected automatic observation")
            learning = response.get("learning") or {}
            if learning.get("rejected_signals"):
                raise ValueError("Personal Core rejected automatic signal quality")
            count += len(learning.get("observations", []))
        # Preserve Bok's quiet-learning and protected-claim review policy.
        if count:
            self.service.process_person_learning(limit=count)
        return {"status": "observed" if count else "no_signal", "observations": count}
