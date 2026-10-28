"""Offline regression checks for the guarded Production Changes publisher."""
import importlib.util
import pathlib
import unittest
from unittest.mock import patch

FILE = pathlib.Path(__file__).with_name("publish-production-changes.py")
spec = importlib.util.spec_from_file_location("production_changes_publisher", FILE)
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)

class ProductionChangesPublisherTests(unittest.TestCase):
    def test_reject_invalid_report_without_writes(self):
        with patch.object(publisher, "call") as api:
            with self.assertRaises(ValueError):
                publisher.publish({"status": "unexpected", "changes": []})
            api.assert_not_called()

    def test_existing_tab_replaces_old_rows(self):
        calls = []
        def fake_api(path, data=None):
            calls.append((path, data))
            if path.startswith("?"):
                return {"sheets": [{"properties": {"title": "Production Changes", "sheetId": 55}}]}
            return {"replies": []}
        report = {"status": "compared", "previousBatch": "old", "currentBatch": "new",
                  "changes": [{"uid": "123", "system": "Kashyyyk", "type": "readiness_changed",
                               "field": "readiness", "before": "blocked", "after": "transfer"}]}
        with patch.object(publisher, "call", side_effect=fake_api):
            publisher.publish(report)
        requests = calls[-1][1]["requests"]
        self.assertEqual(requests[0]["updateCells"]["range"]["sheetId"], 55)
        self.assertEqual(requests[0]["updateCells"]["fields"], "userEnteredValue")
        rows = requests[1]["updateCells"]["rows"]
        self.assertEqual(rows[5]["values"][0]["userEnteredValue"]["stringValue"], "Kashyyyk")
        self.assertEqual(rows[5]["values"][1]["userEnteredValue"]["stringValue"], "123")

    def test_no_changes_is_explicit(self):
        calls = []
        def fake_api(path, data=None):
            calls.append((path, data))
            if path.startswith("?"):
                return {"sheets": [{"properties": {"title": "Production Changes", "sheetId": 55}}]}
            return {"replies": []}
        with patch.object(publisher, "call", side_effect=fake_api):
            publisher.publish({"status": "compared", "changes": []})
        rows = calls[-1][1]["requests"][1]["updateCells"]["rows"]
        self.assertEqual(rows[5]["values"][0]["userEnteredValue"]["stringValue"], "No production changes")

    def test_new_tab_created_once(self):
        calls = []
        def fake_api(path, data=None):
            calls.append((path, data))
            if path.startswith("?"): return {"sheets": []}
            if "addSheet" in data["requests"][0]:
                return {"replies": [{"addSheet": {"properties": {"sheetId": 77}}}]}
            return {"replies": []}
        with patch.object(publisher, "call", side_effect=fake_api):
            publisher.publish({"status": "baseline_created", "changes": []})
        self.assertEqual(calls[-1][1]["requests"][0]["updateCells"]["range"]["sheetId"], 77)

if __name__ == "__main__":
    unittest.main()
