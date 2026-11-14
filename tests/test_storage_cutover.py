import copy
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error
import urllib.parse

from PIL import Image

SPEC = importlib.util.spec_from_file_location("cutover", Path(__file__).resolve().parents[1] / "scripts/prepare_storage_cutover.py")
C = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(C)


def jpeg():
    output = io.BytesIO()
    Image.new("RGB", (3, 2), "red").save(output, format="JPEG")
    return output.getvalue()


def row(data=None, kind="image/jpeg"):
    data = jpeg() if data is None else data
    source = "auctions/vehicle/gallery/original.jpg"
    destination = "auctionPublic/vehicle/legacy-123-original." + ("pdf" if kind == "application/pdf" else "jpg")
    return {"source_path": source, "source_generation": "123", "source_metageneration": "1",
            "source_bytes": str(len(data)), "source_content_type": kind,
            "source_md5": C.digest64(data, "md5"), "source_crc32c": C.crc32c64(data),
            "destination_path": destination, "destination_content_type": kind,
            "destination_url": f"https://firebasestorage.googleapis.com/v0/b/{C.BUCKET}/o/" + urllib.parse.quote(destination, safe="") + "?alt=media",
            "publication_approved": "true", "owner_preserve": "true",
            "reference_locations": "settings/media-vehicle.fullGallery.arrayValue.values[0].mapValue.fields.url.stringValue"}


def docs(r):
    prefix = f"projects/{C.PROJECT}/databases/{C.DATABASE}/documents/"
    return [{"name": prefix + "auctions/vehicle", "updateTime": "2026-11-13T12:00:00Z",
             "fields": {"status": {"stringValue": "active"}, "sellerEmail": {"stringValue": "private@example.test"}}},
            {"name": prefix + "settings/media-vehicle", "updateTime": "2026-11-13T12:00:00Z", "fields": {
                "fullGallery": {"arrayValue": {"values": [{"mapValue": {"fields": {
                    "url": {"stringValue": f"https://firebasestorage.googleapis.com/v0/b/{C.BUCKET}/o/" + urllib.parse.quote(r["source_path"], safe="") + "?alt=media&token=PRIVATE-TOKEN"},
                    "caption": {"stringValue": "Keep caption"}}}}]}},
                "privateOther": {"stringValue": "not-in-write"}}}]


def metadata(r):
    return {"name": r["source_path"], "generation": r["source_generation"],
            "metageneration": r["source_metageneration"], "size": r["source_bytes"],
            "contentType": r["source_content_type"], "md5Hash": r["source_md5"], "crc32c": r["source_crc32c"]}


class FakeCloud:
    def __init__(self, r, data, occupied=False, drift=False):
        self.r, self.data = r, data
        self.documents = docs(r)
        self.occupied, self.drift = occupied, drift
        self.calls = []

    def listed(self, endpoint, key, extra=None):
        self.calls.append(("GET", endpoint))
        if key == "items":
            return [metadata(self.r)]
        if endpoint == C.FS + "/auctions":
            return [self.documents[0]]
        if endpoint == C.FS + "/settings":
            return [self.documents[1]]
        return []

    def get(self, url, binary=False, absent_ok=False):
        self.calls.append(("GET", url))
        if absent_ok:
            return {"name": self.r["destination_path"]} if self.occupied else None
        if binary:
            return self.data
        return {"updateTime": "changed" if self.drift else "2026-11-13T12:00:00Z"}


class CutoverTests(unittest.TestCase):
    def test_reviewed_manifest_counts_and_hash(self):
        rows = C.load_manifest(C.REPO / "docs/storage-cutover-inventory-2026-11-13.csv")
        self.assertEqual(len(rows), 226)
        self.assertEqual(sum(r["publication_approved"] == "true" for r in rows), 163)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "tampered.csv"
            path.write_bytes((C.REPO / "docs/storage-cutover-inventory-2026-11-13.csv").read_bytes() + b"\n")
            with self.assertRaises(C.Blocked):
                C.load_manifest(path)

    def test_known_crc32c_vector(self):
        self.assertEqual(C.crc32c64(b"123456789"), "4waSgw==")

    def test_metadata_drift_and_corrupt_bytes(self):
        r = row()
        C.check_metadata(r, metadata(r))
        for key in ("generation", "metageneration", "size", "contentType", "md5Hash", "crc32c"):
            changed = metadata(r)
            changed[key] = "changed"
            with self.assertRaises(C.Blocked):
                C.check_metadata(r, changed)
        with self.assertRaises(C.Blocked):
            C.validate_file(r, b"x" * int(r["source_bytes"]))

    def test_real_jpeg_decode_and_invalid_format(self):
        data = jpeg()
        self.assertEqual(C.validate_file(row(data), data)["width"], 3)
        data = b"not a jpeg"
        with self.assertRaises(Exception):
            C.validate_file(row(data), data)

    def test_unapproved_pdf_is_blocked(self):
        data = b"%PDF-1.4 not the reviewed document"
        with self.assertRaises(C.Blocked):
            C.validate_file(row(data, "application/pdf"), data)

    def test_synthetic_pdf_render_and_embedded_file_rejection(self):
        import pymupdf
        with pymupdf.open() as document:
            document.new_page().insert_text((30, 30), "Synthetic review fixture")
            data = document.tobytes()
        with patch.dict(C.PDF_APPROVALS, {C.hashlib.sha256(data).hexdigest(): 1}):
            self.assertEqual(C.validate_file(row(data, "application/pdf"), data)["pages_rendered"], 1)
        with pymupdf.open(stream=data, filetype="pdf") as document:
            document.embfile_add("attachment.txt", b"synthetic attachment")
            embedded = document.tobytes()
        with patch.dict(C.PDF_APPROVALS, {C.hashlib.sha256(embedded).hexdigest(): 1}):
            with self.assertRaises(C.Blocked):
                C.validate_file(row(embedded, "application/pdf"), embedded)

    def test_svg_active_content_and_external_css_blocked(self):
        C.validate_svg(b'<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>')
        for inside in ('<script>alert(1)</script>', '<path onclick="bad()"/>',
                       '<use href="https://example.test/pic"/>', '<foreignObject/>',
                       '<style>@import "https://example.test";</style>',
                       '<path fill="url(https://example.test)"/>'):
            with self.assertRaises(C.Blocked):
                C.validate_svg(('<svg xmlns="http://www.w3.org/2000/svg">' + inside + '</svg>').encode())
        with self.assertRaises(C.Blocked):
            C.validate_svg(b'<!DOCTYPE svg [<!ENTITY x "boom">]><svg xmlns="http://www.w3.org/2000/svg"/>')

    def test_private_fields_preserved_pdf_flag_and_guarded_mask(self):
        r = row(kind="application/pdf")
        original = docs(r)
        untouched = copy.deepcopy(original)
        commit, recovery = C.prepare_reference_writes([r], original)
        self.assertEqual(original, untouched)
        self.assertEqual(len(commit["writes"]), 1)
        write = commit["writes"][0]
        self.assertEqual(write["currentDocument"], {"updateTime": original[1]["updateTime"]})
        self.assertEqual(write["updateMask"], {"fieldPaths": ["fullGallery"]})
        self.assertEqual(set(write["update"]["fields"]), {"fullGallery"})
        fields = write["update"]["fields"]["fullGallery"]["arrayValue"]["values"][0]["mapValue"]["fields"]
        self.assertEqual(fields["isPdf"], {"booleanValue": True})
        self.assertEqual(fields["caption"], {"stringValue": "Keep caption"})
        self.assertNotIn("PRIVATE-TOKEN", json.dumps(commit))
        self.assertFalse(recovery["executable"])
        self.assertIsNone(recovery["documents"][0]["required_post_cutover_update_time"])

    def test_reference_drift_extra_reference_and_private_status_block(self):
        r = row()
        for scenario in ("removed", "extra", "draft"):
            documents = docs(r)
            if scenario == "removed":
                documents[1]["fields"].pop("fullGallery")
            elif scenario == "extra":
                documents[1]["fields"]["extra"] = {"stringValue": r["source_path"]}
            else:
                documents[0]["fields"]["status"]["stringValue"] = "draft"
            with self.assertRaises(C.Blocked):
                C.prepare_reference_writes([r], documents)

    def test_copy_native_preconditions_and_metadata_allowlist(self):
        op = C.copy_operation(row())
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(op["url"]).query)
        self.assertEqual(query["ifGenerationMatch"], ["0"])
        self.assertEqual(query["ifSourceGenerationMatch"], ["123"])
        self.assertEqual(query["ifSourceMetagenerationMatch"], ["1"])
        self.assertEqual(op["body"]["metadata"], {})
        self.assertNotIn("acl", op["body"])
        self.assertNotIn("token", json.dumps(op).lower())

    def test_output_rejects_repository_and_existing_paths(self):
        with self.assertRaises(C.Blocked):
            C.make_output(C.REPO / "private-evidence")
        with tempfile.TemporaryDirectory() as tmp:
            output = C.make_output(Path(tmp) / "evidence")
            self.assertEqual(output.stat().st_mode & 0o777, 0o700)
            with self.assertRaises(FileExistsError):
                C.make_output(output)
            C.private_json(output / "data.json", {})
            self.assertEqual((output / "data.json").stat().st_mode & 0o777, 0o600)

    def test_full_preparation_only_reads_and_generates_guarded_proposals(self):
        data = jpeg()
        r = row(data)
        cloud = FakeCloud(r, data)
        with tempfile.TemporaryDirectory() as tmp:
            output = C.make_output(Path(tmp) / "evidence")
            report = C.prepare([r], cloud, output)
            self.assertEqual(report["status"], "PREPARED_NOT_EXECUTED")
            self.assertTrue(all(method == "GET" for method, _ in cloud.calls))
            self.assertEqual(report["cloud_write_requests"], 0)
            summary = (output / "shareable-summary.json").read_text()
            self.assertNotIn("PRIVATE-TOKEN", summary)
            self.assertNotIn("private@example.test", summary)
            self.assertIn("PRIVATE-TOKEN", (output / "private-firestore-snapshot.json").read_text())

    def test_destination_collision_and_late_revision_drift_no_ready_plan(self):
        for occupied, drift in ((True, False), (False, True)):
            data = jpeg()
            r = row(data)
            with tempfile.TemporaryDirectory() as tmp:
                output = C.make_output(Path(tmp) / "evidence")
                with self.assertRaises(C.Blocked):
                    C.prepare([r], FakeCloud(r, data, occupied, drift), output)
                self.assertFalse((output / "shareable-summary.json").exists())
                self.assertFalse((output / "private-proposed-reference-commit.json").exists())

    def test_cloud_read_origin_and_pagination_limits(self):
        cloud = C.ReadOnlyCloud("not-a-real-token")
        with self.assertRaises(C.Blocked):
            cloud.get("https://example.test")
        cloud.get = lambda url: {"items": [], "nextPageToken": "repeat"}
        with self.assertRaises(C.Blocked):
            cloud.listed(C.GCS + "/o", "items")


class AuthenticationTests(unittest.TestCase):
    def cloud(self, codes, refresh):
        cloud = C.ReadOnlyCloud("old-secret", refresh_token=refresh)
        requests = []
        def opened(request, timeout):
            requests.append(request)
            code = codes.pop(0)
            if code != 200:
                raise urllib.error.HTTPError(request.full_url, code, "secret-body", {}, None)
            return io.BytesIO(b'{"ok": true}')
        cloud.opener.open = opened
        return cloud, requests

    def test_refresh_retries_only_failed_get_once(self):
        refresh = unittest.mock.Mock(return_value="new-secret")
        cloud, requests = self.cloud([401, 200], refresh)
        self.assertEqual(cloud.get(C.GCS), {"ok": True})
        refresh.assert_called_once_with()
        self.assertEqual([r.get_method() for r in requests], ["GET", "GET"])
        self.assertEqual([r.get_header("Authorization") for r in requests],
                         ["Bearer old-secret", "Bearer new-secret"])
        self.assertEqual(requests[0].full_url, requests[1].full_url)

    def test_second_401_stops_without_exposing_credentials(self):
        refresh = unittest.mock.Mock(return_value="new-secret")
        cloud, requests = self.cloud([401, 401], refresh)
        with self.assertRaisesRegex(C.Blocked, "^Read-only HTTP request failed: 401$"):
            cloud.get(C.GCS, absent_ok=True)
        self.assertEqual(len(requests), 2)
        refresh.assert_called_once_with()

    def test_other_errors_do_not_refresh(self):
        for code in (403, 404, 500):
            refresh = unittest.mock.Mock()
            cloud, requests = self.cloud([code], refresh)
            with self.assertRaises(C.Blocked):
                cloud.get(C.GCS)
            refresh.assert_not_called()
            self.assertEqual(len(requests), 1)
        cloud, _ = self.cloud([404], refresh)
        self.assertIsNone(cloud.get(C.GCS, absent_ok=True))
        refresh.assert_not_called()

    def test_authentication_failure_is_sanitized(self):
        with patch.object(C.subprocess, "check_output", side_effect=RuntimeError("secret")):
            with self.assertRaisesRegex(C.Blocked, "^Google Cloud authentication failed;") as result:
                C.obtain_token()
            self.assertNotIn("secret", str(result.exception))
        with patch.object(C.subprocess, "check_output", return_value="  "):
            with self.assertRaisesRegex(C.Blocked, "Authentication returned no token"):
                C.obtain_token()


if __name__ == "__main__":
    unittest.main()
