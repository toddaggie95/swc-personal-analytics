import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import zipfile

SPEC = importlib.util.spec_from_file_location("publication_receipts", Path(__file__).with_name("publication-receipts.py"))
receipts = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(receipts)


def files(digit="a"):
    return [{"owner": owner, "kind": kind, "sha256": digit * 64} for owner in ("TFF", "TJO") for kind in ("Stations", "Materials")]


def receipt(run_id="20", digit="a", phase="complete", run_attempt=1, **components):
    return {"schemaVersion": 1, "verified": True, "phase": phase, "reportRunId": str(run_id), "runAttempt": run_attempt, "upstreamRunId": "10", "source": "api",
            "files": files(digit), "fingerprint": receipts.fingerprint(files(digit)),
            "components": {c: components.get(c, phase == "complete") for c in receipts.COMPONENTS}}


def zipped(value, name="publication-receipt.json", extra=None):
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w") as archive:
        archive.writestr(name, json.dumps(value))
        if extra:
            archive.writestr(extra, "unexpected")
    return stream.getvalue()


class PublicationReceiptTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "swc-exports").mkdir()
        self.manifest = self.root / "swc-exports/export-manifest.json"
        self.manifest.write_text(json.dumps({"source": "api", "files": files()}))
        self.output = self.root / "github-output"
        self.env = patch.dict(os.environ, {"GITHUB_REPOSITORY": "owner/repo", "GITHUB_RUN_ID": "100", "GITHUB_RUN_ATTEMPT": "1", "GITHUB_OUTPUT": str(self.output)})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.module_path = patch.object(receipts, "__file__", str(self.root / "publication-receipts.py"))
        self.module_path.start()
        self.addCleanup(self.module_path.stop)

    def resolve(self, history=(), alter=None):
        artifacts = []
        archives, runs = {}, {}
        for index, value in enumerate(history):
            artifact_id = str(1000 + index)
            run_id = value["reportRunId"]
            is_intent = value.get("phase") == "intent"
            artifacts.append({"id": artifact_id, "name": receipts.artifact_name(value["phase"], value["runAttempt"]), "expired": False, "workflow_run": {"id": run_id}})
            archives[artifact_id] = zipped(value, "publication-intent.json" if is_intent else "publication-receipt.json")
            runs[run_id] = {"id": run_id, "path": receipts.WORKFLOW_PATH, "name": receipts.WORKFLOW_NAME, "status": "completed",
                            "conclusion": "success", "head_repository": {"full_name": "owner/repo"}, "event": "workflow_run"}
        if alter:
            alter(artifacts, archives, runs)
        calls = []

        def invoke(args, **kwargs):
            calls.append(args)
            endpoint = args[2]
            self.assertEqual(args[:2], ["gh", "api"])
            self.assertEqual(kwargs["stderr"], subprocess.DEVNULL)
            if "?name=" in endpoint:
                self.assertEqual(args[3:], ["--paginate", "--slurp"])
                name = endpoint.split("?name=")[1].split("&")[0]
                body = json.dumps([{"artifacts": [a for a in artifacts if a["name"] == name]}]).encode()
            elif endpoint.endswith("/zip"):
                body = archives[endpoint.split("/")[-2]]
            else:
                body = json.dumps(runs[endpoint.split("/")[-1]]).encode()
            return subprocess.CompletedProcess(args, 0, stdout=body)

        with patch.object(receipts.subprocess, "run", side_effect=invoke):
            receipts.resolve(self.root)
        return calls

    def assert_outputs(self, overview, matrix, changes):
        self.assertEqual(self.output.read_text(), "".join(f"{key}={str(value).lower()}\n" for key, value in zip(receipts.COMPONENTS, (overview, matrix, changes))))
        for key, should_publish in zip(receipts.COMPONENTS, (overview, matrix, changes)):
            self.assertEqual((self.root / f"published-{key}.ok").exists(), not should_publish)

    def test_fresh_batch_publishes_and_same_batch_skips(self):
        self.resolve()
        self.assert_outputs(True, True, True)
        self.output.unlink()
        calls = self.resolve([receipt()])
        self.assert_outputs(False, False, False)
        self.assertEqual(sum(args[2].endswith("/zip") for args in calls), 1)
        self.assertTrue(all("swc-production-overview-readonly" not in args[2] for args in calls))

    def test_partial_failed_runs_supply_only_verified_components(self):
        history = [receipt("20"), receipt("21", "b", overview=True, matrix=False, changes=False)]
        def failed(_artifacts, _archives, runs):
            runs["21"]["conclusion"] = "failure"
        self.resolve(history, failed)
        self.assert_outputs(True, True, True)

    def test_a_b_a_publishes_again_instead_of_using_older_match(self):
        calls = self.resolve([receipt("20", "a"), receipt("21", "b")])
        self.assert_outputs(True, True, True)
        self.assertEqual(sum(args[2].endswith("/zip") for args in calls), 1)

    def test_seed_never_fills_unknown_components_of_newer_attempt(self):
        seed = receipt("15")
        (self.root / "legacy-publication-receipt.json").write_text(json.dumps(seed))
        def add_seed(_artifacts, _archives, runs):
            runs["15"] = {"id": "15", "path": receipts.WORKFLOW_PATH, "name": receipts.WORKFLOW_NAME, "status": "completed",
                          "head_repository": {"full_name": "owner/repo"}, "event": "workflow_dispatch"}
        self.resolve([receipt("21", "b", overview=True, matrix=False, changes=False)], add_seed)
        self.assert_outputs(True, True, True)

    def test_seed_is_fallback_only_when_no_trusted_artifact_exists(self):
        seed = receipt("15")
        seed.pop("runAttempt")
        (self.root / "legacy-publication-receipt.json").write_text(json.dumps(seed))
        def add_seed(_artifacts, _archives, runs):
            runs["15"] = {"id": "15", "path": receipts.WORKFLOW_PATH, "name": receipts.WORKFLOW_NAME, "status": "completed",
                          "head_repository": {"full_name": "owner/repo"}, "event": "workflow_dispatch"}
        calls = self.resolve([], add_seed)
        self.assert_outputs(False, False, False)
        self.assertFalse(any(args[2].endswith("/zip") for args in calls))

    def test_current_run_and_expired_receipts_are_not_inherited(self):
        def expire(artifacts, _archives, _runs):
            artifacts[0]["expired"] = True
        self.resolve([receipt("20"), receipt("100")], expire)
        self.assert_outputs(True, True, True)

    def test_strict_files_fingerprint_and_receipt_identity(self):
        for mutate in (lambda r: r.update(fingerprint="0" * 64), lambda r: r["files"].pop(),
                       lambda r: r["files"][0].update(owner="FOREIGN"), lambda r: r["files"][0].update(sha256="not-a-hash"),
                       lambda r: r["files"].__setitem__(0, r["files"][1]), lambda r: r.update(verified=1),
                       lambda r: r.update(upstreamRunId=True), lambda r: r["components"].update(overview="true")):
            value = receipt()
            mutate(value)
            with self.subTest(value=value), self.assertRaises(ValueError):
                receipts.validate_receipt(value)
        self.assertEqual(receipts.fingerprint(list(reversed(files()))), receipts.fingerprint(files()))
        with self.assertRaises(ValueError):
            receipts.validate_receipt(receipt(), "999")

    def test_foreign_or_wrong_workflow_metadata_is_ignored_without_download(self):
        for field, value in (("head_repository", {"full_name": "foreign/repo"}), ("path", ".github/workflows/other.yml"),
                             ("name", "untrusted"), ("status", "in_progress"), ("event", "pull_request"), ("id", "999")):
            def alter(_artifacts, _archives, runs):
                runs["20"][field] = value
            with self.subTest(field=field):
                self.output.unlink(missing_ok=True)
                calls = self.resolve([receipt()], alter)
                self.assert_outputs(True, True, True)
                self.assertFalse(any(args[2].endswith("/zip") for args in calls))
        def wrong_identity(_artifacts, archives, _runs):
            archives["1000"] = zipped(receipt("999"))
        with self.assertRaises(ValueError):
            self.resolve([receipt()], wrong_identity)

    def test_exact_archive_allowlist_and_json_integrity(self):
        for payload in (zipped(receipt(), "../publication-receipt.json"), zipped(receipt(), extra="tokens.json"), b"broken zip"):
            with self.subTest(payload=payload[:10]), self.assertRaises(Exception):
                receipts.read_zip(payload)
        def unexpected(artifacts, _archives, _runs):
            artifacts[0]["name"] = "full-report-archive"
        self.resolve([receipt()], unexpected)
        self.assert_outputs(True, True, True)

    def test_create_partial_receipt_after_verified_acceptance(self):
        (self.root / "accepted-has-verification.json").write_text(json.dumps({"verified": True, "hasRunId": "10"}))
        (self.root / "published-overview.ok").touch()
        with contextlib.redirect_stdout(io.StringIO()):
            receipts.create(self.root)
        value = json.loads((self.root / "publication-receipt.json").read_text())
        receipts.validate_receipt(value, "100")
        self.assertEqual(value["components"], {"overview": True, "matrix": False, "changes": False})
        self.assertEqual(value["upstreamRunId"], "10")
        self.assertEqual(value["files"], receipts.normalized_files(files()))

    def test_no_accepted_verification_or_markers_skips_and_removes_old_receipt(self):
        target = self.root / "publication-receipt.json"
        for verification, marker in ((None, True), ({"verified": True, "hasRunId": "10"}, False)):
            target.write_text("old")
            accepted = self.root / "accepted-has-verification.json"
            accepted.unlink(missing_ok=True)
            if verification is not None:
                accepted.write_text(json.dumps(verification))
            marker_path = self.root / "published-overview.ok"
            marker_path.unlink(missing_ok=True)
            if marker:
                marker_path.touch()
            with contextlib.redirect_stdout(io.StringIO()) as output:
                receipts.create(self.root)
            self.assertIn("skipped", output.getvalue())
            self.assertFalse(target.exists())

    def test_malformed_present_verification_rejected(self):
        (self.root / "published-overview.ok").touch()
        for value in ({"verified": False}, {"verified": True, "hasRunId": "invalid"}, []):
            (self.root / "accepted-has-verification.json").write_text(json.dumps(value))
            with self.assertRaises(ValueError):
                receipts.create(self.root)

    def test_trusted_corrupt_receipt_fails_closed(self):
        def corrupt(_artifacts, archives, _runs):
            archives["1000"] = b"malformed trusted archive"
        with self.assertRaises(zipfile.BadZipFile):
            self.resolve([receipt()], corrupt)

    def test_latest_partial_matching_attempt_leaves_unknown_components_publishable(self):
        self.resolve([receipt("20"), receipt("21", overview=True, matrix=False, changes=False)])
        self.assert_outputs(False, True, True)

    def test_newer_intent_invalidates_older_matching_receipt_even_on_failed_run(self):
        def failed(_artifacts, _archives, runs):
            runs["21"]["conclusion"] = "cancelled"
        calls = self.resolve([receipt("20"), receipt("21", phase="intent")], failed)
        self.assert_outputs(True, True, True)
        self.assertEqual(sum(args[2].endswith("/zip") for args in calls), 1)

    def test_final_receipt_after_intent_restores_known_publication(self):
        self.resolve([receipt("20", phase="intent"), receipt("20")])
        self.assert_outputs(False, False, False)

    def test_intent_create_requires_acceptance_but_not_publication_markers(self):
        (self.root / "accepted-has-verification.json").write_text(json.dumps({"verified": True, "hasRunId": "10"}))
        with contextlib.redirect_stdout(io.StringIO()):
            receipts.create(self.root, "intent")
        value = json.loads((self.root / "publication-intent.json").read_text())
        receipts.validate_receipt(value, "100", "intent")
        self.assertEqual(value["components"], dict.fromkeys(receipts.COMPONENTS, False))
        self.assertFalse((self.root / "publication-receipt.json").exists())

    def test_intent_phase_and_archive_filename_must_match(self):
        for mutate in (lambda a, z, r: z.update({"1000": zipped(receipt("20", phase="intent"))}),
                       lambda a, z, r: z.update({"1000": zipped(receipt("20"), "publication-intent.json")}),
                       lambda a, z, r: z.update({"1000": zipped(receipt("20", phase="intent", overview=True), "publication-intent.json")})):
            with self.assertRaises(ValueError):
                self.resolve([receipt("20", phase="intent")], mutate)
        value = receipt()
        value.pop("phase")
        with self.assertRaises(ValueError):
            receipts.validate_receipt(value)

    def test_retry_resolves_own_prior_intent_while_run_is_active(self):
        os.environ["GITHUB_RUN_ATTEMPT"] = "2"
        def active(_artifacts, _archives, runs):
            runs["100"]["status"] = "in_progress"
        self.resolve([receipt("20"), receipt("100", phase="intent", run_attempt=1)], active)
        self.assert_outputs(True, True, True)

    def test_retry_resolves_own_prior_complete_while_run_is_queued(self):
        os.environ["GITHUB_RUN_ATTEMPT"] = "2"
        def active(_artifacts, _archives, runs):
            runs["100"]["status"] = "queued"
        self.resolve([receipt("100", run_attempt=1)], active)
        self.assert_outputs(False, False, False)

    def test_current_and_future_attempts_cannot_override_prior_attempt(self):
        os.environ["GITHUB_RUN_ATTEMPT"] = "2"
        def active(_artifacts, _archives, runs):
            runs["100"]["status"] = "in_progress"
        self.resolve([receipt("100", run_attempt=1), receipt("100", phase="intent", run_attempt=2), receipt("100", phase="intent", run_attempt=3)], active)
        self.assert_outputs(False, False, False)

    def test_wrong_slot_and_invalid_attempt_fail_closed(self):
        def slot_mismatch(artifacts, _archives, _runs):
            artifacts[0]["name"] = receipts.ARTIFACT_NAME + "-0"
        with self.assertRaises(ValueError):
            self.resolve([receipt()], slot_mismatch)
        for value in (0, -1, True, "1", None):
            with self.subTest(value=value), self.assertRaises(ValueError):
                receipts.validate_receipt(receipt(run_attempt=value))

    def test_create_emits_bounded_phase_slot_names_across_attempts(self):
        (self.root / "accepted-has-verification.json").write_text(json.dumps({"verified": True, "hasRunId": "10"}))
        (self.root / "published-overview.ok").touch()
        names = set()
        for run_attempt in (1, 2, 3, 4, 101):
            os.environ["GITHUB_RUN_ATTEMPT"] = str(run_attempt)
            for phase in ("intent", "complete"):
                self.output.unlink(missing_ok=True)
                with contextlib.redirect_stdout(io.StringIO()):
                    receipts.create(self.root, phase)
                name = receipts.artifact_name(phase, run_attempt)
                self.assertEqual(self.output.read_text(), f"artifact_name={name}\nslot={run_attempt % 2}\n")
                names.add(name)
                filename = "publication-intent.json" if phase == "intent" else "publication-receipt.json"
                self.assertEqual(json.loads((self.root / filename).read_text())["runAttempt"], run_attempt)
        self.assertEqual(names, set(receipts.ARTIFACT_NAMES))

    def test_missing_attempt_environment_defaults_to_one(self):
        os.environ.pop("GITHUB_RUN_ATTEMPT")
        self.assertEqual(receipts.attempt(), 1)

    def test_network_error_fails_closed_with_fixed_message(self):
        with patch.object(receipts.subprocess, "run", side_effect=RuntimeError("sensitive remote response")), patch.object(receipts.sys, "argv", ["publication-receipts.py", "resolve", str(self.root)]), contextlib.redirect_stderr(io.StringIO()) as error:
            self.assertEqual(receipts.main(), 1)
        self.assertEqual(error.getvalue(), "Publication receipt verification failed; publishing is blocked.\n")
        self.assertFalse(self.output.exists())


if __name__ == "__main__":
    unittest.main()
