#!/usr/bin/env python3
"""Read-only live validation and private operation preparation. No apply mode."""
import argparse
import base64
import csv
from datetime import datetime, timezone
import hashlib
import io
import http.client
import json
import os
from pathlib import Path
import re
import subprocess
import socket
import time
import sys
import urllib.error
import urllib.parse
import urllib.request
import warnings
import xml.etree.ElementTree as ET

PROJECT = "studio-apps-483721"
DATABASE = "ai-studio-wailtailauction-c952df6d-bb0b-4072-915f-2c67e5ee2b6e"
BUCKET = "studio-apps-483721.firebasestorage.app"
MANIFEST_SHA256 = "4aff72cb53516faffd392f37888a602690439c8e2acc2b08495d6f665a0d7ab0"
REPO = Path(__file__).resolve().parents[1]
GCS = f"https://storage.googleapis.com/storage/v1/b/{BUCKET}"
FS = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/{DATABASE}/documents"
PUBLIC_STATUSES = {"preview", "upcoming", "active", "live", "ending_soon", "ended", "sold", "reserve_not_met"}
PDF_APPROVALS = {
    "42985ae6ff9e060806f519a5013f468af4f46999ca95d6598634086b85c880ab": 14,
    "75f5753afb85384fb76bfd90be1bdb7b51cd5bacc31bbd506f18fc601c7468ea": 4,
}


class Blocked(Exception):
    """Safe diagnostic only; never include raw document data or HTTP bodies."""


def digest64(data, algorithm):
    return base64.b64encode(hashlib.new(algorithm, data).digest()).decode()


def crc32c64(data):
    crc = 0xFFFFFFFF
    for byte in data:
        crc ^= byte
        for _ in range(8):
            crc = (crc >> 1) ^ (0x82F63B78 if crc & 1 else 0)
    return base64.b64encode((crc ^ 0xFFFFFFFF).to_bytes(4, "big")).decode()


def load_manifest(path):
    raw = Path(path).read_bytes()
    if hashlib.sha256(raw).hexdigest() != MANIFEST_SHA256:
        raise Blocked("Manifest does not match the reviewed inventory hash")
    rows = list(csv.DictReader(io.StringIO(raw.decode())))
    approved = [r for r in rows if r["publication_approved"] == "true"]
    if len(rows) != 226 or len(approved) != 163:
        raise Blocked("Inventory counts changed")
    if len({r["source_path"] for r in rows}) != 226:
        raise Blocked("Duplicate source")
    if len({r["destination_path"] for r in approved}) != 163:
        raise Blocked("Destination collision")
    if sum(r["owner_preserve"] == "true" for r in rows) != 5:
        raise Blocked("Protected asset count changed")
    for r in rows:
        if not re.fullmatch(r"auctions/[A-Za-z0-9_/-]+\.[A-Za-z0-9]+", r["source_path"]):
            raise Blocked("Invalid source path")
        for key in ("source_generation", "source_metageneration", "source_bytes"):
            if not r[key].isdigit() or int(r[key]) <= 0:
                raise Blocked("Missing source version or size")
        if r["source_retention"] != "PRESERVE_NO_DELETION":
            raise Blocked("Source retention changed")
        if r["publication_approved"] == "true":
            if not re.fullmatch(r"auctionPublic/[A-Za-z0-9_-]+/[A-Za-z0-9_.-]+", r["destination_path"]):
                raise Blocked("Invalid destination")
            expected = (f"https://firebasestorage.googleapis.com/v0/b/{BUCKET}/o/"
                        + urllib.parse.quote(r["destination_path"], safe="") + "?alt=media")
            if r["destination_url"] != expected or r["destination_create_generation_match"] != "0":
                raise Blocked("Unsafe destination URL/precondition")
        elif r["destination_path"] or r["destination_url"]:
            raise Blocked("Held source has a destination")
    return rows


def check_metadata(row, metadata):
    fields = {"name": "source_path", "generation": "source_generation",
              "metageneration": "source_metageneration", "size": "source_bytes",
              "contentType": "source_content_type", "crc32c": "source_crc32c", "md5Hash": "source_md5"}
    if any(str(metadata.get(k, "")) != row[v] for k, v in fields.items()):
        raise Blocked("Source metadata drift: " + row["source_path"])


def validate_file(row, data):
    if len(data) != int(row["source_bytes"]) or len(data) > 40 * 1024 * 1024:
        raise Blocked("Source byte count mismatch")
    if digest64(data, "md5") != row["source_md5"] or crc32c64(data) != row["source_crc32c"]:
        raise Blocked("Source checksum mismatch")
    kind = row["source_content_type"]
    result = {"sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data), "content_type": kind}
    if kind == "image/jpeg":
        from PIL import Image
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as image:
                if image.format != "JPEG":
                    raise Blocked("JPEG content mismatch")
                image.verify()
            with Image.open(io.BytesIO(data)) as image:
                image.load()
                result.update(width=image.width, height=image.height,
                              exif_present=bool(image.info.get("exif")),
                              gps_metadata_present=34853 in image.getexif())
    elif kind == "application/pdf":
        import pymupdf
        if result["sha256"] not in PDF_APPROVALS or not data.startswith(b"%PDF-"):
            raise Blocked("PDF is not an approved reviewed version")
        with pymupdf.open(stream=data, filetype="pdf") as document:
            if document.needs_pass or len(document) != PDF_APPROVALS[result["sha256"]]:
                raise Blocked("PDF encryption/page count mismatch")
            if document.embfile_count() or re.search(rb"/(JavaScript|JS|Launch|RichMedia)\b", data):
                raise Blocked("PDF active/embedded content requires review")
            for page in document:
                page.get_pixmap(matrix=pymupdf.Matrix(0.5, 0.5), alpha=False)
                if list(page.widgets() or []):
                    raise Blocked("PDF form fields require review")
            result["pages_rendered"] = len(document)
    elif kind == "image/svg+xml":
        validate_svg(data)
        result["svg_static_validation"] = "passed"
    else:
        raise Blocked("Unsupported public file type")
    return result


def validate_svg(data):
    text = data.decode("utf-8-sig")
    if re.search(r"<!\s*(DOCTYPE|ENTITY)|<\?xml-stylesheet", text, re.I):
        raise Blocked("SVG declarations require review")
    root = ET.fromstring(text)
    allowed = {"svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
               "defs", "linearGradient", "radialGradient", "stop", "clipPath", "mask", "use",
               "title", "desc", "text", "tspan", "style", "symbol"}
    if root.tag != "{http://www.w3.org/2000/svg}svg":
        raise Blocked("SVG namespace/root mismatch")
    for element in root.iter():
        tag = element.tag.split("}")[-1]
        if tag not in allowed or (element.tag.startswith("{") and
                                  not element.tag.startswith("{http://www.w3.org/2000/svg}")):
            raise Blocked("Unsupported SVG element")
        for key, value in element.attrib.items():
            name = key.split("}")[-1].lower()
            if name.startswith("on") or (name == "href" and not re.fullmatch(r"#[A-Za-z_][\w:.-]*", value)):
                raise Blocked("SVG event/external reference")
            if re.search(r"javascript:|data:|https?:|@import|\\", value, re.I):
                raise Blocked("SVG active/external attribute")
            for target in re.findall(r"url\((.*?)\)", value, re.I):
                if not re.fullmatch(r"['\"]?#[\w:.-]+['\"]?", target.strip()):
                    raise Blocked("SVG external CSS URL")
        if tag == "style":
            css = "".join(element.itertext())
            if re.search(r"@|\\|javascript:|data:|https?:|expression\s*\(", css, re.I):
                raise Blocked("SVG CSS requires review")
            for target in re.findall(r"url\((.*?)\)", css, re.I):
                if not re.fullmatch(r"['\"]?#[\w:.-]+['\"]?", target.strip()):
                    raise Blocked("SVG external CSS URL")


def storage_path(value):
    if not isinstance(value, str):
        return None
    if value.startswith(f"gs://{BUCKET}/"):
        return value[len(f"gs://{BUCKET}/"):].split("?", 1)[0]
    if value.startswith(("auctions/", "auctionPublic/", "auctionDrafts/")):
        return value
    parsed = urllib.parse.urlsplit(value)
    match = re.fullmatch(r"/v0/b/([^/]+)/o/(.+)", parsed.path)
    if parsed.scheme in ("https", "http") and parsed.hostname == "firebasestorage.googleapis.com" and match:
        if match[1] == BUCKET:
            return urllib.parse.unquote(match[2])
    prefix = "/" + BUCKET + "/"
    if parsed.scheme == "https" and parsed.hostname == "storage.googleapis.com" and parsed.path.startswith(prefix):
        return urllib.parse.unquote(parsed.path[len(prefix):])
    return None


def reference_locations(value, location):
    result = {}
    if isinstance(value, dict):
        for key, child in value.items():
            for path, places in reference_locations(child, location + "." + key).items():
                result.setdefault(path, set()).update(places)
    elif isinstance(value, list):
        for i, child in enumerate(value):
            for path, places in reference_locations(child, location + f"[{i}]").items():
                result.setdefault(path, set()).update(places)
    elif isinstance(value, str):
        path = storage_path(value)
        if path:
            result[path] = {location}
    return result


def replace_references(value, mapping):
    if isinstance(value, dict):
        result = {k: replace_references(v, mapping) for k, v in value.items()}
        if isinstance(value.get("url"), dict):
            row = mapping.get(storage_path(value["url"].get("stringValue")))
            if row and row["source_content_type"] == "application/pdf":
                result["isPdf"] = {"booleanValue": True}
        return result
    if isinstance(value, list):
        return [replace_references(v, mapping) for v in value]
    if isinstance(value, str) and storage_path(value) in mapping:
        return mapping[storage_path(value)]["destination_url"]
    return value


def field_path(key):
    return key if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key) else "`" + key.replace("\\", "\\\\").replace("`", "\\`") + "`"


def prepare_reference_writes(rows, documents):
    expected = {r["source_path"]: set(filter(None, r["reference_locations"].split(" | "))) for r in rows}
    actual = {}
    for document in documents:
        name = document["name"].split("/documents/", 1)[1]
        for path, places in reference_locations(document.get("fields", {}), name).items():
            actual.setdefault(path, set()).update(places)
    if {k: v for k, v in expected.items() if v} != actual:
        raise Blocked("Firestore reference drift; inspect privately, do not reuse old mappings")
    mapping = {r["source_path"]: r for r in rows if r["publication_approved"] == "true"}
    for group in {r["destination_path"].split("/")[1] for r in mapping.values()} - {"common"}:
        auction = next((d for d in documents if d["name"].endswith("/documents/auctions/" + group)), None)
        if not auction or auction.get("fields", {}).get("status", {}).get("stringValue") not in PUBLIC_STATUSES:
            raise Blocked("Mapped listing is not currently public: " + group)
    writes, recovery = [], []
    for document in documents:
        before = document.get("fields", {})
        after = replace_references(before, mapping)
        changed = sorted(k for k in after if after[k] != before.get(k))
        if not changed:
            continue
        if not document.get("updateTime") or not document["name"].startswith(FS.split("/v1/", 1)[1] + "/"):
            raise Blocked("Missing document revision or wrong database")
        writes.append({"update": {"name": document["name"], "fields": {k: after[k] for k in changed}},
                       "updateMask": {"fieldPaths": [field_path(k) for k in changed]},
                       "currentDocument": {"updateTime": document["updateTime"]}})
        recovery.append({"name": document["name"], "original_fields": {k: before[k] for k in changed},
                         "field_paths": [field_path(k) for k in changed],
                         "required_post_cutover_update_time": None})
    if not writes or len(writes) > 400:
        raise Blocked("Reference commit outside bounded write count")
    return {"writes": writes}, {"executable": False, "documents": recovery}


def copy_operation(row):
    source, destination = (urllib.parse.quote(row[k], safe="") for k in ("source_path", "destination_path"))
    query = urllib.parse.urlencode({"sourceGeneration": row["source_generation"],
        "ifSourceGenerationMatch": row["source_generation"],
        "ifSourceMetagenerationMatch": row["source_metageneration"], "ifGenerationMatch": "0"})
    filename = row["destination_path"].split("/")[-1]
    return {"method": "POST", "url": f"{GCS}/o/{source}/rewriteTo/b/{BUCKET}/o/{destination}?{query}",
            "body": {"contentType": row["destination_content_type"], "cacheControl": "public, max-age=3600",
                     "contentDisposition": f'inline; filename="{filename}"', "metadata": {}},
            "source_path": row["source_path"], "destination_path": row["destination_path"],
            "expected_md5": row["source_md5"], "expected_crc32c": row["source_crc32c"],
            "expected_bytes": int(row["source_bytes"])}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def connect_ipv4(address, timeout=socket._GLOBAL_DEFAULT_TIMEOUT, source_address=None):
    """Resolve/connect IPv4 only for this HTTPS transport; leave global DNS untouched."""
    host, port = address
    last_error = None
    for family, kind, protocol, _, endpoint in socket.getaddrinfo(
            host, port, socket.AF_INET, socket.SOCK_STREAM):
        connection = socket.socket(family, kind, protocol)
        try:
            if timeout is not socket._GLOBAL_DEFAULT_TIMEOUT:
                connection.settimeout(timeout)
            if source_address:
                connection.bind(source_address)
            connection.connect(endpoint)
            return connection
        except OSError as error:
            last_error = error
            connection.close()
    if last_error:
        raise last_error
    raise OSError("No IPv4 address available")


class IPv4HTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._create_connection = connect_ipv4


class IPv4HTTPSHandler(urllib.request.HTTPSHandler):
    def https_open(self, request):
        return self.do_open(IPv4HTTPSConnection, request, context=self._context)


class ReadOnlyCloud:
    def __init__(self, token, refresh_token=None, ipv4_only=False):
        self.token = token
        self.refresh_token = refresh_token
        handlers = [NoRedirect()]
        if ipv4_only:
            handlers.append(IPv4HTTPSHandler())
        self.opener = urllib.request.build_opener(*handlers)

    def get(self, url, binary=False, absent_ok=False):
        parsed = urllib.parse.urlsplit(url)
        if parsed.scheme != "https" or parsed.hostname not in {"storage.googleapis.com", "firestore.googleapis.com"}:
            raise Blocked("Unexpected HTTP origin")
        for attempt in range(2):
            req = urllib.request.Request(url, headers={"Authorization": "Bearer " + self.token}, method="GET")
            started = time.monotonic()
            try:
                with self.opener.open(req, timeout=60) as response:
                    data = response.read(40 * 1024 * 1024 + 1)
                    if len(data) > 40 * 1024 * 1024:
                        raise Blocked("Response exceeds bounded size")
                    return data if binary else json.loads(data)
            except urllib.error.HTTPError as error:
                if absent_ok and error.code == 404:
                    return None
                if error.code == 401 and attempt == 0 and self.refresh_token:
                    print("Refreshing Google Cloud authentication after HTTP 401; retrying read once", flush=True)
                    self.token = self.refresh_token()
                    if not self.token:
                        raise Blocked("Authentication returned no token")
                    continue
                raise Blocked(f"Read-only HTTP request failed: {error.code}") from None
            finally:
                print(f"Read {parsed.hostname}: {time.monotonic() - started:.2f}s (attempt {attempt + 1})", flush=True)

    def listed(self, endpoint, item_key, extra=None):
        result, token, seen = [], "", set()
        for _ in range(100):
            query = dict(extra or {})
            if token:
                query["pageToken"] = token
            page = self.get(endpoint + "?" + urllib.parse.urlencode(query))
            result.extend(page.get(item_key, []))
            token = page.get("nextPageToken", "")
            if not token:
                return result
            if token in seen:
                raise Blocked("Repeated pagination token")
            seen.add(token)
        raise Blocked("Read exceeds bounded page count")


def private_json(path, data):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        json.dump(data, stream, indent=2, sort_keys=True)
        stream.write("\n")


def make_output(path):
    path = Path(path).expanduser().resolve()
    if path == REPO or REPO in path.parents:
        raise Blocked("Output must be outside the repository")
    path.mkdir(mode=0o700, parents=False, exist_ok=False)
    os.chmod(path, 0o700)
    (path / "files").mkdir(mode=0o700)
    return path


def prepare(rows, cloud, output):
    print("Checking source inventory and metadata (read-only)", flush=True)
    metadata = cloud.listed(GCS + "/o", "items", {"projection": "noAcl", "maxResults": "1000",
        "fields": "nextPageToken,items(name,generation,metageneration,size,contentType,crc32c,md5Hash)"})
    observed = {m["name"]: m for m in metadata}
    if len(metadata) != len(rows) or set(observed) != {r["source_path"] for r in rows}:
        raise Blocked("Bucket object set changed")
    for row in rows:
        check_metadata(row, observed[row["source_path"]])
    approved = [r for r in rows if r["publication_approved"] == "true"]
    validations = []
    for i, row in enumerate(approved, 1):
        destination = GCS + "/o/" + urllib.parse.quote(row["destination_path"], safe="")
        if cloud.get(destination + "?fields=name,generation", absent_ok=True) is not None:
            raise Blocked("Destination already exists: " + row["destination_path"])
        query = urllib.parse.urlencode({"alt": "media", "generation": row["source_generation"],
                                       "ifGenerationMatch": row["source_generation"],
                                       "ifMetagenerationMatch": row["source_metageneration"]})
        data = cloud.get(GCS + "/o/" + urllib.parse.quote(row["source_path"], safe="") + "?" + query, binary=True)
        try:
            result = validate_file(row, data)
        except Exception as error:
            detail = str(error) if isinstance(error, Blocked) else type(error).__name__
            raise Blocked("File validation blocked: " + row["source_path"] + " (" + detail + ")") from None
        suffix = {"image/jpeg": "jpg", "application/pdf": "pdf", "image/svg+xml": "svg"}[row["source_content_type"]]
        local = output / "files" / f"{i:03d}.{suffix}"
        descriptor = os.open(local, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(data)
        result.update(source_path=row["source_path"], destination_path=row["destination_path"], local_file=str(local))
        validations.append(result)
        print(f"Validated {i}/{len(approved)}", flush=True)
    documents = []
    print("Reading Firestore references and revisions (read-only)", flush=True)
    for collection in ("auctions", "settings", "mediaConfig", "media"):
        documents.extend(cloud.listed(FS + "/" + collection, "documents", {"pageSize": "100"}))
    for document in list(documents):
        relative = document["name"].split("/documents/", 1)[1]
        if relative.startswith("auctions/"):
            documents.extend(cloud.listed(FS + "/" + relative + "/media", "documents", {"pageSize": "100"}))
    private_json(output / "private-firestore-snapshot.json", {"documents": documents})
    commit, recovery = prepare_reference_writes(rows, documents)
    # Check for metadata drift after downloads; future execution must recheck again.
    final_metadata = cloud.listed(GCS + "/o", "items", {"projection": "noAcl", "maxResults": "1000",
        "fields": "nextPageToken,items(name,generation,metageneration,size,contentType,crc32c,md5Hash)"})
    if {m["name"] for m in final_metadata} != set(observed):
        raise Blocked("Bucket object set changed during validation")
    final = {m["name"]: m for m in final_metadata}
    for row in rows:
        check_metadata(row, final[row["source_path"]])
    for document in documents:
        current = cloud.get("https://firestore.googleapis.com/v1/" + document["name"])
        if current.get("updateTime") != document.get("updateTime"):
            raise Blocked("Firestore changed during preparation")
    private_json(output / "proposed-copy-operations.json", {"executable": False, "operations": [copy_operation(r) for r in approved]})
    private_json(output / "private-proposed-reference-commit.json", commit)
    private_json(output / "private-recovery-template.json", recovery)
    private_json(output / "private-file-validation.json", validations)
    report = {"status": "PREPARED_NOT_EXECUTED", "manifest_sha256": MANIFEST_SHA256,
              "prepared_at": datetime.now(timezone.utc).isoformat(),
              "project": PROJECT, "database": DATABASE, "bucket": BUCKET,
              "source_objects": len(rows), "validated_public_objects": len(validations),
              "held_objects": len(rows) - len(approved), "proposed_reference_documents": len(commit["writes"]),
              "protected_objects": sum(r["owner_preserve"] == "true" for r in rows),
              "cloud_write_requests": 0,
              "exif_objects_requiring_owner_review": [v["source_path"] for v in validations if v.get("exif_present")],
              "gps_metadata_objects": [v["source_path"] for v in validations if v.get("gps_metadata_present")],
              "remaining_gates": ["EXIF/privacy review where indicated", "inherited IAM and original token access",
                  "private backup verification and recovery result revisions", "fresh per-operation preconditions",
                  "post-copy verification before reference commit", "coordinated app/rules/index/environment rollout",
                  "explicit live-operation authorization"]}
    private_json(output / "shareable-summary.json", report)
    return report


def obtain_token():
    try:
        token = subprocess.check_output(
            ["gcloud", "auth", "print-access-token"], text=True,
            timeout=180, stderr=subprocess.DEVNULL).strip()
    except Exception:
        raise Blocked("Google Cloud authentication failed; check gcloud authentication locally") from None
    if not token:
        raise Blocked("Authentication returned no token")
    return token


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=REPO / "docs/storage-cutover-inventory-2026-11-13.csv")
    parser.add_argument("--output", required=True, type=Path, help="New private directory outside the repository")
    parser.add_argument("--ipv4-only", action="store_true", help="Use IPv4 for this script HTTPS transport only")
    args = parser.parse_args()
    os.umask(0o077)
    output = None
    try:
        rows = load_manifest(args.manifest)
        import PIL  # noqa: F401 -- fail before any network reads if dependencies are missing
        import pymupdf  # noqa: F401
        output = make_output(args.output)
        print("Obtaining Google Cloud authentication; token will not be displayed", flush=True)
        report = prepare(rows, ReadOnlyCloud(obtain_token(), refresh_token=obtain_token, ipv4_only=args.ipv4_only), output)
        print(json.dumps(report, indent=2))
        print(f"Only share {output / 'shareable-summary.json'}. Other outputs contain private data.")
        return 0
    except KeyboardInterrupt:
        if output:
            private_json(output / "cancelled-summary.json", {"status": "CANCELLED", "cloud_write_requests": 0})
        print("CANCELLED: No cloud writes performed; retain partial evidence privately.", file=sys.stderr)
        return 130
    except Exception as error:
        message = str(error) if isinstance(error, Blocked) else "Local/read-only preparation failed (" + type(error).__name__ + ")"
        if output:
            private_json(output / "blocked-summary.json", {"status": "BLOCKED", "reason": message, "cloud_write_requests": 0})
        print("BLOCKED: " + message, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
