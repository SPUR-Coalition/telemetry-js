#!/usr/bin/env python3
"""Check SDK output against an explicit checkout of the standard and its rules."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent.parent
STANDARD = Path(os.environ.get("CT_SPEC_DIR", ROOT / ".content-telemetry-standard"))
module_spec = importlib.util.spec_from_file_location("standard_validation", STANDARD / "tests/validate.py")
checks = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(checks)
session, event, batch, validator, _, registry = checks.load_schema(STANDARD / "telemetry-session.json")
documents = json.loads(subprocess.check_output(["node", "scripts/wire-examples.mjs"], cwd=ROOT))
failures = []
for name, document in documents.items():
    schema = {"event": event, "event_batch": batch, "session": session}[document["document_type"]]
    errors = list(checks.Draft202012Validator(
        schema, registry=registry, format_checker=checks.FORMAT_CHECKER,
    ).iter_errors(document))
    errors += checks.check_application_layer(document)
    # The standard's fixture runner deliberately leaves these level-dependent
    # requirements to integrations; all agent examples here supply this context.
    for field in ("session_id", "agent_id", "started_at"):
        if not document.get(field):
            errors.append(f"missing agent context: {field}")
    failures.extend(f"{name}: {error}" for error in errors)
if failures:
    raise SystemExit("\n".join(failures))
print(f"PASS: {len(documents)} SDK wire documents against standard schema and application rules")
