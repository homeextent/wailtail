#!/usr/bin/env python3
"""Read-only local recovery consistency and representative anonymous link checks."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import urllib.error
import urllib.parse
import urllib.request

SPEC = importlib.util.spec_from_file_location("preparer", Path(__file__).with_name("prepare_storage_cutover.py"))
C = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(C)


def require(condition, message):
    if not condition:
        raise C.Blocked(message)


def read_json(path):
    return json.loads(path.read_text())


def verify_backup(root, rows):
    root = root.expanduser().resolve()
    require(root != C.REPO and C.REPO not in root.parents, "Backup must be outside Git")
    evidence = root / "evidence"
    checksums = read_json(root / "backup-sha256.json")
    require(isinstance(checksums, dict) and checksums, "Missing backup checksums")
    require(not any(p.is_symlink() for p in evidence.rglob("*")), "Symlink in evidence")
    actual = {str(p.relative_to(evidence)) for p in evidence.rglob("*") if p.is_file()}
    require(actual == set(checksums), "Backup file set mismatch")
    for relative, expected in checksums.items():
        require(hashlib.sha256((evidence / relative).read_bytes()).hexdigest() == expected,
                "Backup checksum mismatch")
    summary = read_json(evidence / "shareable-summary.json")
    approved = [r for r in rows if r["publication_approved"] == "true"]
    require(summary.get("status") == "PREPARED_NOT_EXECUTED" and summary.get("cloud_write_requests") == 0
            and summary.get("manifest_sha256") == C.MANIFEST_SHA256
            and summary.get("validated_public_objects") == len(approved), "Unexpected preparation summary")
    documents = read_json(evidence / "private-firestore-snapshot.json")["documents"]
    commit, recovery = C.prepare_reference_writes(rows, documents)
    require(read_json(evidence / "private-proposed-reference-commit.json") == commit,
            "Reference proposals differ from snapshot/manifest")
    require(read_json(evidence / "private-recovery-template.json") == recovery,
            "Recovery fields differ from original snapshot")
    require(read_json(evidence / "proposed-copy-operations.json") ==
            {"executable": False, "operations": [C.copy_operation(r) for r in approved]},
            "Copy recipes differ from manifest")
    return documents, {"backup_files_verified": len(checksums),
                       "reference_documents_verified": len(commit["writes"]),
                       "recovery_template_consistent": True, "restore_executed": False,
                       "cloud_write_requests": 0}


def strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for child in value.values():
            yield from strings(child)
    elif isinstance(value, list):
        for child in value:
            yield from strings(child)


def probe(opener, url):
    # URLs are constructed below for one fixed Firebase bucket, never arbitrary backup hosts.
    request = urllib.request.Request(url, headers={"Range": "bytes=0-0"}, method="GET")
    try:
        with opener.open(request, timeout=15) as response:
            response.read(1)
            return response.status
    except urllib.error.HTTPError as error:
        status = error.code
        error.close()
        return status
    except Exception:
        raise C.Blocked("Anonymous link request failed; no URL or token displayed") from None


def check_links(rows, documents, opener):
    candidates = [r for r in rows if r["publication_approved"] == "true"
                  and r["source_content_type"] == "application/pdf"]
    results = []
    for index, row in enumerate(candidates, 1):
        tokens = set()
        for value in strings(documents):
            if C.storage_path(value) == row["source_path"]:
                parsed = urllib.parse.urlsplit(value)
                if parsed.scheme == "https" and parsed.hostname == "firebasestorage.googleapis.com":
                    tokens.update(t for t in urllib.parse.parse_qs(parsed.query).get("token", []) if t)
        require(len(tokens) == 1, "Expected one original token per representative PDF in private snapshot")
        base = (f"https://firebasestorage.googleapis.com/v0/b/{C.BUCKET}/o/"
                + urllib.parse.quote(row["source_path"], safe="") + "?alt=media")
        results.append({"sample": f"approved_public_pdf_{index}",
                        "without_token_http": probe(opener, base),
                        "original_token_http": probe(opener, base + "&" + urllib.parse.urlencode({"token": next(iter(tokens))}))})
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backup", required=True, type=Path)
    parser.add_argument("--check-original-links", action="store_true", help="GET one byte per representative URL; no authentication headers")
    args = parser.parse_args()
    try:
        rows = C.load_manifest(C.REPO / "docs/storage-cutover-inventory-2026-11-13.csv")
        documents, report = verify_backup(args.backup, rows)
        if args.check_original_links:
            opener = urllib.request.build_opener(C.NoRedirect(), C.IPv4HTTPSHandler())
            report["representative_public_pdf_links"] = check_links(rows, documents, opener)
        report["limitations"] = "Local consistency only, not restore/off-device backup. Representative public PDFs only; not private-path denial or proof of token revocation. Current open rules remain."
        print(json.dumps(report, indent=2))
        return 0
    except KeyboardInterrupt:
        print("CANCELLED: no writes performed", file=sys.stderr)
        return 130
    except Exception as error:
        message = str(error) if isinstance(error, C.Blocked) else "Local evidence review failed (" + type(error).__name__ + ")"
        print("BLOCKED: " + message, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
