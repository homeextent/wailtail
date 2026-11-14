#!/usr/bin/env python3
"""Private execution package. Default prepare reads cloud only; apply needs exact plan approval."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
import shutil
from pathlib import Path
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

import prepare_storage_cutover as C
import review_storage_cutover_evidence as R

TOKEN_KEY = "firebaseStorageDownloadTokens"
RELEASE_FILES = ("firestore.rules", "firestore.indexes.json", "storage.cutover.rules", "firebase.cutover.json", "storage.cutover-freeze.rules", "firebase.cutover-freeze.json", "vercel.json")


def check(ok, message):
    if not ok:
        raise C.Blocked(message)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def file_hash(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def object_url(name):
    return C.GCS + "/o/" + urllib.parse.quote(name, safe="")


def public_url(name):
    return (f"https://firebasestorage.googleapis.com/v0/b/{C.BUCKET}/o/"
            + urllib.parse.quote(name, safe="") + "?alt=media")


class Cloud(C.ReadOnlyCloud):
    """Writes have no automatic retries; an uncertain result requires reconciliation."""
    def rules_read(self, resource):
        prefix = f"projects/{C.PROJECT}/"
        allowed = {prefix + "releases/cloud.firestore/" + C.DATABASE,
                   prefix + "releases/firebase.storage/" + C.BUCKET}
        check(resource in allowed or (resource.startswith(prefix + "rulesets/")
              and resource[len(prefix + "rulesets/"):].replace("-", "").replace("_", "").isalnum()),
              "Unexpected rules backup resource")
        for attempt in range(2):
            request = urllib.request.Request("https://firebaserules.googleapis.com/v1/" + resource,
                headers={"Authorization": "Bearer " + self.token, "X-Goog-User-Project": C.PROJECT}, method="GET")
            try:
                with self.opener.open(request, timeout=60) as response:
                    data = response.read(16 * 1024 * 1024 + 1)
                    check(len(data) <= 16 * 1024 * 1024, "Rules backup too large")
                    return json.loads(data)
            except urllib.error.HTTPError as error:
                if error.code == 401 and attempt == 0 and self.refresh_token:
                    self.token = self.refresh_token()
                    continue
                raise C.Blocked(f"Deployed rules backup rejected ({error.code}); stop before execution") from None

    def write(self, method, url, body):
        parsed = urllib.parse.urlsplit(url)
        check(method in {"POST", "PATCH"} and parsed.scheme == "https"
              and parsed.hostname in {"storage.googleapis.com", "firestore.googleapis.com"}, "Unexpected write target")
        request = urllib.request.Request(url, data=json.dumps(body).encode(), method=method,
            headers={"Authorization": "Bearer " + self.token, "Content-Type": "application/json"})
        try:
            with self.opener.open(request, timeout=60) as response:
                data = response.read(40 * 1024 * 1024 + 1)
                check(len(data) <= 40 * 1024 * 1024, "Write response too large")
                return json.loads(data)
        except Exception:
            raise C.Blocked("Write result uncertain/rejected; stop and reconcile private journal before retry") from None


def anonymous_status(url):
    return R.probe(urllib.request.build_opener(C.NoRedirect(), C.IPv4HTTPSHandler()), url)


def fresh_metadata(cloud, rows, destinations=()):
    listed = cloud.listed(C.GCS + "/o", "items", {"projection": "noAcl", "maxResults": "1000"})
    expected = {r["source_path"] for r in rows} | set(destinations)
    check(len(listed) == len(expected) and {m["name"] for m in listed} == expected, "Source/destination inventory drift")
    by_name = {m["name"]: m for m in listed}
    for row in rows:
        C.check_metadata(row, by_name[row["source_path"]])
    return by_name


def documents(cloud):
    result = []
    for collection in ("auctions", "settings", "mediaConfig", "media"):
        result.extend(cloud.listed(C.FS + "/" + collection, "documents", {"pageSize": "100"}))
    for doc in list(result):
        if "/documents/auctions/" in doc["name"]:
            result.extend(cloud.listed("https://firestore.googleapis.com/v1/" + doc["name"] + "/media", "documents", {"pageSize": "100"}))
    return result


def prepare(backup, output, cloud, rows):
    backup = backup.expanduser().resolve()
    R.verify_backup(backup, rows)
    source_copy = output / "verified-source-evidence"
    source_copy.mkdir(mode=0o700)
    shutil.copytree(backup / "evidence", source_copy / "evidence")
    shutil.copy2(backup / "backup-sha256.json", source_copy / "backup-sha256.json")
    R.verify_backup(source_copy, rows)
    check(not subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=no"], cwd=C.REPO, text=True).strip(), "Tracked worktree must be clean")
    releases = []
    for name in (f"projects/{C.PROJECT}/releases/cloud.firestore/{C.DATABASE}",
                 f"projects/{C.PROJECT}/releases/firebase.storage/{C.BUCKET}"):
        release = cloud.rules_read(name)
        check(release.get("name") == name and release.get("rulesetName"), "Missing deployed release binding")
        ruleset = cloud.rules_read(release["rulesetName"])
        check(ruleset.get("name") == release["rulesetName"] and ruleset.get("source", {}).get("files"), "Missing deployed rules source")
        releases.append({"release": release, "ruleset": ruleset})
    C.private_json(output / "private-deployed-rules.json", releases)
    fresh_metadata(cloud, rows)
    originals = []
    for row in rows:
        # Full metadata/ACL private backup, including token values; never print it.
        current = cloud.get(object_url(row["source_path"]) + "?projection=full")
        C.check_metadata(row, current)
        check(not current.get("contexts"), "Source object contexts require explicit review")
        check(isinstance(current.get("acl"), list), "Object ACL inspection unavailable")
        check(current.get("metadata", {}).get(TOKEN_KEY), "Missing original-token metadata backup")
        check(not any(a.get("entity") in {"allUsers", "allAuthenticatedUsers"} for a in current.get("acl", [])),
              "Public object ACL requires review")
        originals.append(current)
    index_endpoint = f"https://firestore.googleapis.com/v1/projects/{C.PROJECT}/databases/{C.DATABASE}/collectionGroups/-/indexes"
    indexes = cloud.listed(index_endpoint, "indexes", {"pageSize": "100"})
    C.private_json(output / "private-index-snapshot.json", indexes)
    docs = documents(cloud)
    workload = {name: cloud.listed(C.FS + "/" + name, "documents", {"pageSize": "100"})
                for name in ("auctionReviewQueue", "auctionNotificationOutbox")}
    C.private_json(output / "private-worker-snapshot.json", workload)
    commit, recovery = C.prepare_reference_writes(rows, docs)
    for row in rows:
        if row["publication_approved"] == "true":
            check(cloud.get(object_url(row["destination_path"]), absent_ok=True) is None, "Destination collision")
    fresh_metadata(cloud, rows)
    for doc in docs:
        current = cloud.get("https://firestore.googleapis.com/v1/" + doc["name"])
        check(current.get("updateTime") == doc.get("updateTime"), "Document drift during capture")
    C.private_json(output / "private-original-metadata.json", originals)
    C.private_json(output / "private-original-documents.json", {"documents": docs})
    plan = {"schema": 1, "project": C.PROJECT, "database": C.DATABASE, "bucket": C.BUCKET,
        "manifest_sha256": C.MANIFEST_SHA256, "prepared_at": datetime.now(timezone.utc).isoformat(),
        "candidate_sha": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=C.REPO, text=True).strip(),
        "candidate_tree": subprocess.check_output(["git", "rev-parse", "HEAD^{tree}"], cwd=C.REPO, text=True).strip(),
        "release_hashes": {p: file_hash(C.REPO / p) for p in RELEASE_FILES},
        "tool_hashes": {p: file_hash(C.REPO / "scripts" / p) for p in
                        ("storage_cutover_execution.py", "prepare_storage_cutover.py", "review_storage_cutover_evidence.py")},
        "backup_hashes": {p: file_hash(output / p) for p in ("private-original-metadata.json", "private-original-documents.json", "private-worker-snapshot.json", "private-deployed-rules.json", "private-index-snapshot.json")},
        "copies": [C.copy_operation(r) for r in rows if r["publication_approved"] == "true"],
        "reference_commit": commit, "recovery": recovery,
        "revoke_sources": [r["source_path"] for r in rows], "source_deletion": False}
    C.private_json(output / "private-plan.json", plan)
    report = {"status": "PREPARED_NOT_EXECUTED", "plan_sha256": digest(plan), "candidate_sha": plan["candidate_sha"],
        "copies": len(plan["copies"]), "reference_documents": len(commit["writes"]),
        "original_metadata_backed_up": len(originals), "token_removals_proposed": len(rows), "cloud_write_requests": 0,
        "deployed_rule_sources_backed_up": len(releases), "observed_composite_indexes": len(indexes),
        "worker_document_counts": {k: len(v) for k, v in workload.items()},
        "live_status_auction_count": sum(d.get("fields", {}).get("status", {}).get("stringValue") in
                                          {"active", "live", "ending_soon"} for d in docs if "/documents/auctions/" in d["name"]),
        "approval": "One exact-plan approval may cover phased copies, reference commit, conditional recovery and token removal plus the coordinated runbook. No live approval has been granted.",
        "remaining": ["verified off-device package copy", "release/environment/index/worker readiness evidence",
                      "exact plan and production revision approval", "controlled write freeze", "post-copy verification", "post-restriction denial"]}
    C.private_json(output / "approval-summary.json", report)
    integrity = {str(p.relative_to(output)): file_hash(p) for p in output.rglob("*") if p.is_file()}
    C.private_json(output / "integrity-sha256.json", integrity)
    return report


class Journal:
    def __init__(self, path, plan_hash, mirror=None):
        self.path, self.plan_hash, self.mirror = path, plan_hash, mirror
        if mirror:
            check((path.read_bytes() if path.exists() else b"") == (mirror.read_bytes() if mirror.exists() else b""), "Journal mirror mismatch; reconcile")
        self.events = []
        if path.exists():
            self.events = [json.loads(line) for line in path.read_text().splitlines()]
            check(all(e.get("plan_sha256") == plan_hash for e in self.events), "Journal plan mismatch")
        states = {}
        for event in self.events:
            states[event["operation"]] = event["state"]
        check(all(s == "done" for s in states.values()), "Uncertain interrupted operation; reconcile before resume")

    def result(self, operation):
        for event in reversed(self.events):
            if event["operation"] == operation and event["state"] == "done":
                return event["result"]
        return None

    def append(self, operation, state, result=None):
        event = {"plan_sha256": self.plan_hash, "operation": operation, "state": state,
                 "result": result, "at": datetime.now(timezone.utc).isoformat()}
        for path in [self.path] + ([self.mirror] if self.mirror else []):
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
            with os.fdopen(fd, "w") as stream:
                stream.write(json.dumps(event) + "\n")
                stream.flush()
                os.fsync(stream.fileno())
        self.events.append(event)

    def perform(self, operation, action):
        check(self.result(operation) is None, "Operation already completed")
        self.append(operation, "started")
        result = action()
        self.append(operation, "done", result)
        return result


def load_package(root, approved_hash, rows):
    plan = R.read_json(root / "private-plan.json")
    check(digest(plan) == approved_hash, "Exact approved plan hash required")
    check((plan.get("project"), plan.get("database"), plan.get("bucket"), plan.get("manifest_sha256")) ==
          (C.PROJECT, C.DATABASE, C.BUCKET, C.MANIFEST_SHA256), "Wrong plan target")
    check(plan.get("source_deletion") is False, "Deletion is never permitted")
    check(subprocess.check_output(["git", "rev-parse", "HEAD^{tree}"], cwd=C.REPO, text=True).strip() == plan.get("candidate_tree"), "Candidate tree changed")
    check(not subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=no"], cwd=C.REPO, text=True).strip(), "Tracked worktree must be clean")
    for p, expected in plan["release_hashes"].items():
        check(p in RELEASE_FILES and file_hash(C.REPO / p) == expected, "Release file drift")
    check(set(plan["release_hashes"]) == set(RELEASE_FILES), "Missing release pins")
    for p in ("storage_cutover_execution.py", "prepare_storage_cutover.py", "review_storage_cutover_evidence.py"):
        check(file_hash(C.REPO / "scripts" / p) == plan["tool_hashes"].get(p), "Execution tool drift")
    for p in ("private-original-metadata.json", "private-original-documents.json", "private-worker-snapshot.json", "private-deployed-rules.json", "private-index-snapshot.json"):
        check(file_hash(root / p) == plan["backup_hashes"].get(p), "Private backup drift")
    original = R.read_json(root / "private-original-documents.json")["documents"]
    commit, recovery = C.prepare_reference_writes(rows, original)
    check(plan["reference_commit"] == commit and plan["recovery"] == recovery, "Reference/recovery scope drift")
    check(plan["copies"] == [C.copy_operation(r) for r in rows if r["publication_approved"] == "true"], "Copy scope drift")
    check(plan["revoke_sources"] == [r["source_path"] for r in rows], "Revocation scope drift")
    return plan


def verify_destination(cloud, row, receipt):
    current = cloud.get(object_url(row["destination_path"]) + "?projection=full")
    check(str(current.get("generation")) == str(receipt["generation"])
          and str(current.get("metageneration")) == str(receipt["metageneration"]), "Destination revision drift")
    expected = dict(row, source_path=row["destination_path"], source_generation=str(receipt["generation"]),
                    source_metageneration=str(receipt["metageneration"]), source_content_type=row["destination_content_type"])
    C.check_metadata(expected, current)
    check(not current.get("metadata") and not current.get("contexts"), "Destination has unexpected custom metadata/tokens/contexts")
    check(isinstance(current.get("acl"), list), "Destination ACL inspection unavailable")
    check(not any(a.get("entity") in {"allUsers", "allAuthenticatedUsers"} for a in current.get("acl", [])), "Unexpected destination ACL")
    query = urllib.parse.urlencode({"alt": "media", "generation": receipt["generation"],
                                   "ifGenerationMatch": receipt["generation"], "ifMetagenerationMatch": receipt["metageneration"]})
    C.validate_file(row, cloud.get(object_url(row["destination_path"]) + "?" + query, binary=True))
    check(anonymous_status(row["destination_url"]) in {200, 206}, "Public destination not readable")


def copy_public(plan, rows, cloud, journal):
    for row, recipe in zip([r for r in rows if r["publication_approved"] == "true"], plan["copies"]):
        operation = "copy:" + row["destination_path"]
        receipt = journal.result(operation)
        if receipt is None:
            C.check_metadata(row, cloud.get(object_url(row["source_path"])))
            check(cloud.get(object_url(row["destination_path"]), absent_ok=True) is None, "Destination collision")
            def action():
                response = cloud.write("POST", recipe["url"], recipe["body"])
                # Continue only an explicit server-issued rewrite token, retaining identical guards/body.
                for _ in range(100):
                    if response.get("done") is True:
                        resource = response.get("resource", {})
                        check(resource.get("name") == row["destination_path"] and resource.get("generation")
                              and resource.get("metageneration"), "Invalid rewrite receipt")
                        return {"generation": str(resource["generation"]), "metageneration": str(resource["metageneration"])}
                    check(isinstance(response.get("rewriteToken"), str) and response["rewriteToken"], "Missing rewrite continuation")
                    response = cloud.write("POST", recipe["url"] + "&" + urllib.parse.urlencode({"rewriteToken": response["rewriteToken"]}), recipe["body"])
                raise C.Blocked("Rewrite continuation limit; reconcile journal")
            receipt = journal.perform(operation, action)
        verify_destination(cloud, row, receipt)
    return {"public_copies_verified": len(plan["copies"])}


def references(plan, rows, cloud, journal):
    check(journal.result("recover-references") is None, "References were recovered; new plan required")
    if journal.result("commit-references") is not None:
        raise C.Blocked("Reference commit already completed; inspect receipt, do not replay")
    # All destinations must pass full fresh verification before the single atomic commit.
    for row in [r for r in rows if r["publication_approved"] == "true"]:
        receipt = journal.result("copy:" + row["destination_path"])
        check(receipt is not None, "Missing copy receipt")
        verify_destination(cloud, row, receipt)
    fresh_metadata(cloud, rows, [recipe["destination_path"] for recipe in plan["copies"]])
    current_commit, _ = C.prepare_reference_writes(rows, documents(cloud))
    check(current_commit == plan["reference_commit"], "Fresh reference revision/field drift")
    def action():
        response = cloud.write("POST", C.FS + ":commit", plan["reference_commit"])
        results = response.get("writeResults", [])
        check(len(results) == len(plan["reference_commit"]["writes"])
              and all(r.get("updateTime") for r in results), "Invalid commit receipt; reconcile")
        return {"update_times": [r["updateTime"] for r in results]}
    receipt = journal.perform("commit-references", action)
    for write, revision in zip(plan["reference_commit"]["writes"], receipt["update_times"]):
        current = cloud.get("https://firestore.googleapis.com/v1/" + write["update"]["name"])
        check(current.get("updateTime") == revision and all(current.get("fields", {}).get(k) == v
              for k, v in write["update"]["fields"].items()), "Post-commit verification drift")
    return {"reference_documents_updated": len(receipt["update_times"])}


def recover_references(plan, cloud, journal):
    check(not any(e["operation"].startswith("revoke:") for e in journal.events), "No automatic recovery after token revocation")
    receipt = journal.result("commit-references")
    check(receipt is not None, "No committed reference receipt")
    check(len(receipt["update_times"]) == len(plan["recovery"]["documents"]), "Recovery receipt count mismatch")
    writes = []
    for original, revision in zip(plan["recovery"]["documents"], receipt["update_times"]):
        current = cloud.get("https://firestore.googleapis.com/v1/" + original["name"])
        check(current.get("updateTime") == revision, "Newer edits prevent recovery")
        # Every original media URL being restored must still work anonymously.
        for url in R.strings(original["original_fields"]):
            if C.storage_path(url):
                check(urllib.parse.urlsplit(url).scheme == "https" and urllib.parse.urlsplit(url).hostname == "firebasestorage.googleapis.com",
                      "Unsupported recovery media URL")
                check(anonymous_status(url) in {200, 206}, "Original URL not usable; forward repair required")
        writes.append({"update": {"name": original["name"], "fields": original["original_fields"]},
                       "updateMask": {"fieldPaths": original["field_paths"]}, "currentDocument": {"updateTime": revision}})
    def action():
        response = cloud.write("POST", C.FS + ":commit", {"writes": writes})
        results = response.get("writeResults", [])
        check(len(results) == len(writes) and all(r.get("updateTime") for r in results), "Invalid recovery receipt; reconcile")
        return {"update_times": [r["updateTime"] for r in results]}
    recovered = journal.perform("recover-references", action)
    for write, revision in zip(writes, recovered["update_times"]):
        current = cloud.get("https://firestore.googleapis.com/v1/" + write["update"]["name"])
        check(current.get("updateTime") == revision and all(current.get("fields", {}).get(k) == v
              for k, v in write["update"]["fields"].items()), "Post-recovery verification drift")
    return {"recovery_committed": True, "requires_post_recovery_QA": True}


def revoke(plan, rows, cloud, journal, root):
    check(journal.result("commit-references") is not None and journal.result("recover-references") is None, "Reference phase incomplete/recovered")
    for row in [r for r in rows if r["publication_approved"] == "true"]:
        receipt = journal.result("copy:" + row["destination_path"])
        check(receipt is not None, "Missing destination receipt")
        verify_destination(cloud, row, receipt)
    committed = journal.result("commit-references")["update_times"]
    check(len(committed) == len(plan["reference_commit"]["writes"]), "Commit receipt count mismatch")
    for write, revision in zip(plan["reference_commit"]["writes"], committed):
        check(cloud.get("https://firestore.googleapis.com/v1/" + write["update"]["name"]).get("updateTime") == revision,
              "Reference document changed before revocation; reconcile")
    originals = {m["name"]: m for m in R.read_json(root / "private-original-metadata.json")}
    # Require strict legacy-read denial for every original, including the former two exceptions.
    for row in rows:
        check(anonymous_status(public_url(row["source_path"])) in {401, 403}, "Legacy token-free access still allowed/uncertain; restrict rules first")
    for row in rows:
        original = originals[row["source_path"]]
        tokens = [t for t in original.get("metadata", {}).get(TOKEN_KEY, "").split(",") if t]
        check(tokens, "Missing original-token backup")
        op = "revoke:" + row["source_path"]
        if journal.result(op) is None:
            current = cloud.get(object_url(row["source_path"]))
            C.check_metadata(row, current)
            check(current.get("metadata", {}) == original.get("metadata", {}), "Original metadata drift")
            query = urllib.parse.urlencode({"generation": row["source_generation"], "ifGenerationMatch": row["source_generation"],
                                           "ifMetagenerationMatch": row["source_metageneration"]})
            journal.perform(op, lambda: cloud.write("PATCH", object_url(row["source_path"]) + "?" + query,
                                                   {"metadata": {TOKEN_KEY: None}}))
        current = cloud.get(object_url(row["source_path"]))
        check(current.get("generation") == original.get("generation") and TOKEN_KEY not in current.get("metadata", {})
              and {k: v for k, v in current.get("metadata", {}).items() if k != TOKEN_KEY} ==
                  {k: v for k, v in original.get("metadata", {}).items() if k != TOKEN_KEY}, "Token removal verification failed")
        for token in tokens:
            url = public_url(row["source_path"]) + "&" + urllib.parse.urlencode({"token": token})
            check(anonymous_status(url) in {401, 403}, "Original token still readable/uncertain after revocation")
    return {"original_token_paths_revoked_and_denied": len(rows)}


def verify_package_backup(root, backup):
    backup = backup.expanduser().resolve()
    check(backup != C.REPO and C.REPO not in backup.parents, "Package backup must be outside Git")
    check(backup != root and root not in backup.parents and backup not in root.parents,
          "Independent package backup path required")
    check(all(directory.stat().st_mode & 0o077 == 0 for directory in (root, backup)), "Private package directory permissions required")
    expected = R.read_json(root / "integrity-sha256.json")
    check(R.read_json(backup / "integrity-sha256.json") == expected, "Package backup manifest mismatch")
    for name, checksum in expected.items():
        check(not Path(name).is_absolute() and ".." not in Path(name).parts, "Unsafe integrity path")
        for directory in (root, backup):
            path = directory / name
            check(not path.is_symlink() and path.resolve().is_relative_to(directory)
                  and path.stat().st_mode & 0o077 == 0 and file_hash(path) == checksum,
                  "Package backup checksum mismatch")
    return backup


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=("prepare", "copy", "references", "recover-references", "revoke"))
    parser.add_argument("--backup", type=Path)
    parser.add_argument("--package", type=Path, required=True, help="Private new output (prepare) or approved package (apply)")
    parser.add_argument("--approved-plan-sha256", help="Exact plan hash from separately granted owner approval")
    parser.add_argument("--execute-approved-live-operation", action="store_true")
    parser.add_argument("--controlled-window-confirmed", action="store_true")
    parser.add_argument("--verified-package-backup", type=Path, help="Independent private copy of complete package")
    parser.add_argument("--off-device-backup-confirmed", action="store_true", help="Operator confirms independent off-device durability; path checks cannot prove this")
    args = parser.parse_args()
    os.umask(0o077)
    lock = None
    own_lock = False
    try:
        rows = C.load_manifest(C.REPO / "docs/storage-cutover-inventory-2026-11-13.csv")
        root = args.package.expanduser().resolve()
        check(root != C.REPO and C.REPO not in root.parents, "Private package must be outside Git")
        if args.phase == "prepare":
            check(args.backup and not args.execute_approved_live_operation, "Prepare requires backup; never live-write flags")
            root = C.make_output(root)
        else:
            check(args.execute_approved_live_operation and args.controlled_window_confirmed and args.approved_plan_sha256
                  and args.verified_package_backup and args.off_device_backup_confirmed,
                  "Separate exact-plan approval and controlled window acknowledgments required")
            plan = load_package(root, args.approved_plan_sha256, rows)
            mirror = verify_package_backup(root, args.verified_package_backup)
            lock = root / ".execution-lock"
            fd = os.open(lock, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            os.close(fd)
            own_lock = True
            journal = Journal(root / "private-journal.jsonl", digest(plan), mirror / "private-journal.jsonl")
        cloud = Cloud(C.obtain_token(), refresh_token=C.obtain_token, ipv4_only=True)
        if args.phase == "prepare":
            report = prepare(args.backup, root, cloud, rows)
        elif args.phase == "copy":
            report = copy_public(plan, rows, cloud, journal)
        elif args.phase == "references":
            report = references(plan, rows, cloud, journal)
        elif args.phase == "recover-references":
            report = recover_references(plan, cloud, journal)
        else:
            report = revoke(plan, rows, cloud, journal, root)
        print(json.dumps(report, indent=2))
        return 0
    except KeyboardInterrupt:
        print("CANCELLED: retain private package/journal; reconcile any started operation before resume", file=sys.stderr)
        return 130
    except Exception as error:
        message = str(error) if isinstance(error, (C.Blocked, R.C.Blocked)) else "Cutover stopped (" + type(error).__name__ + ")"
        print("BLOCKED: " + message, file=sys.stderr)
        return 1
    finally:
        if own_lock and lock and lock.exists():
            lock.unlink()


if __name__ == "__main__":
    sys.exit(main())
