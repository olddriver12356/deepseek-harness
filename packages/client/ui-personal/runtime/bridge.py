"""DSH adapter for the pinned, unmodified Bok Personal Core and MCP handlers."""
import json
import sys
from pathlib import Path
from urllib.request import Request
from urllib.error import HTTPError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "vendor/bok/Bok"))
from bok_core.ui_bridge import BokUIBridge
from bok_core.mcp import MCPServer, TOOLS
from vault_profile import VaultProfile
from observer import Observer

PERSONAL_TOOLS = {"bok_person_context", "bok_observe_conversation", "bok_record_person_impact", "bok_record_person_outcome"}
TOOL_ROUTES = {"bok_person_context": "/v1/person/context", "bok_observe_conversation": "/v1/conversations/observe", "bok_record_person_impact": "/v1/person/impacts", "bok_record_person_outcome": "/v1/person/outcomes"}


def main():
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    vault = Path(sys.argv[1])
    vault.mkdir(parents=True, exist_ok=True)
    bridge = BokUIBridge(vault, config_overrides={"personal_core_root": sys.argv[2]})
    try:
        bridge._ensure_started()
        service = bridge._server.service
        # The configured path is deployment-owned. Bok still validates the root and marker.
        service.setup_personal_core(sys.argv[2], confirm=True)
        profile = VaultProfile(service, sys.argv[3], vault) if len(sys.argv) > 3 else None
        existing = next((item for item in service.list_agent_credentials()["items"] if item["agent_id"] == "dsh"), None)
        # A revoked integration stays revoked across restart. Plaintext stays in this process only.
        token = None if existing and existing["status"] == "revoked" else service.issue_agent_credential("dsh", scopes=["context:read", "conversation:observe", "impact:write", "outcome:write"])["token"]
        tools = json.loads(json.dumps([tool for tool in TOOLS if tool["name"] in PERSONAL_TOOLS]))
        for tool in tools:
            tool["inputSchema"]["properties"]["agent"] = {"type": "string", "const": "dsh", "description": "This integration's authenticated local Agent identity."}
        def call_tool(name, arguments):
            if token is None:
                return {"isError": True, "structuredContent": {}, "content": [{"text": "DSH Personal Core access has been revoked"}]}
            payload = {**arguments, "agent": "dsh"}
            outbound = Request(bridge._base_url + TOOL_ROUTES[name], data=json.dumps(payload).encode("utf-8"), headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"}, method="POST")
            try:
                with bridge._opener.open(outbound, timeout=30) as response:
                    result = json.loads(response.read(8 * 1024 * 1024 + 1))
                return {"isError": False, "structuredContent": MCPServer._tool_result(name, result), "content": [], "learning": result.get("personal_learning")}
            except HTTPError as error:
                result = json.loads(error.read())
                return {"isError": True, "structuredContent": result, "content": [{"text": result.get("error", {}).get("message", "Bok request failed")}]}
        signal_schema = next(tool for tool in tools if tool["name"] == "bok_observe_conversation")["inputSchema"]["properties"]["personal_signals"]["items"]
        observer = Observer(service, vault, token, call_tool, signal_schema)
        print(json.dumps({"ready": True, "tools": tools}), flush=True)
        for line in sys.stdin:
            request = json.loads(line)
            try:
                if request["kind"] == "ui":
                    response = bridge.forward(request["method"], request["target"], body=request.get("body", "").encode("utf-8"), headers=request.get("headers", {}))
                    value = {"status": response.status, "body": response.body.decode("utf-8"), "contentType": response.content_type}
                    if profile and request["method"] == "POST" and response.status < 300:
                        try:
                            profile.reconcile()
                        except Exception:
                            # Core succeeded. Never report it as failed and invite a duplicate operation.
                            value["profileWarning"] = "Vault projection cleanup is pending; open Vault connection to retry."
                elif request["kind"] == "profile" and profile:
                    value = profile.handle(request["payload"])
                elif request["kind"] == "observer":
                    value = observer.handle(request)
                elif request["kind"] == "tool" and request["name"] in PERSONAL_TOOLS:
                    value = call_tool(request["name"], request["arguments"])
                else:
                    raise ValueError("Unsupported Personal Core operation")
                print(json.dumps({"id": request["id"], "value": value}, ensure_ascii=False), flush=True)
            except Exception as error:
                print(json.dumps({"id": request["id"], "error": str(error)}, ensure_ascii=False), flush=True)
    finally:
        bridge.close()


if __name__ == "__main__":
    main()
