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
        with patch.object(publisher, "call", side_effect=fake_api), patch.object(publisher, "verify_readback"):
            publisher.publish(report)
        requests = calls[-1][1]["requests"]
        self.assertEqual(requests[0]["updateCells"]["range"]["sheetId"], 55)
        self.assertEqual(requests[0]["updateCells"]["fields"], "userEnteredValue")
        rows = requests[1]["updateCells"]["rows"]
        self.assertEqual(rows[5]["values"][0]["userEnteredValue"]["stringValue"], "Kashyyyk")
        self.assertEqual(rows[5]["values"][3]["userEnteredValue"]["stringValue"], "123")

    def test_no_changes_is_explicit(self):
        calls = []
        def fake_api(path, data=None):
            calls.append((path, data))
            if path.startswith("?"):
                return {"sheets": [{"properties": {"title": "Production Changes", "sheetId": 55}}]}
            return {"replies": []}
        with patch.object(publisher, "call", side_effect=fake_api), patch.object(publisher, "verify_readback"):
            publisher.publish({"status": "compared", "changes": []})
        rows = calls[-1][1]["requests"][1]["updateCells"]["rows"]
        self.assertEqual(rows[5]["values"][0]["userEnteredValue"]["stringValue"], "No production changes")

    def test_three_fields_publish_one_station_notice(self):
        changes = [
            {"uid": "5:1", "system": "Kashyyyk", "type": "production_activity_changed", "field": "started", "before": False, "after": True},
            {"uid": "5:1", "system": "Kashyyyk", "type": "status_changed", "field": "status", "before": "idle", "after": "running"},
            {"uid": "5:1", "system": "Kashyyyk", "type": "readiness_changed", "field": "readiness", "before": "blocked", "after": "building"},
            {"uid": "5:2", "system": "Kashyyyk", "type": "readiness_changed", "field": "readiness", "before": "blocked", "after": "transfer"},
        ]
        notices = publisher.group_station_notices(changes)
        self.assertEqual(len(notices), 2)
        self.assertEqual([notices[0][0],notices[0][3],notices[0][4]], ["Kashyyyk", "5:1", "Production Started"])
        self.assertIn("started: No → Yes", notices[0][7])
        self.assertIn("readiness: blocked → building", notices[0][9])
        self.assertEqual(notices[1][4], "Readiness Changed")

    def test_readback_counts_stations_not_fields(self):
        calls = []
        def fake_api(path, data=None):
            calls.append((path, data))
            if path.startswith("?"):
                return {"sheets": [{"properties": {"title": "Production Changes", "sheetId": 55}}]}
            return {"replies": []}
        report = {"status": "compared", "changes": [
            {"uid": "5:1", "system": "Kashyyyk", "type": "production_activity_changed", "field": "started", "before": False, "after": True},
            {"uid": "5:1", "system": "Kashyyyk", "type": "readiness_changed", "field": "readiness", "before": "blocked", "after": "building"},
        ]}
        with patch.object(publisher, "call", side_effect=fake_api), patch.object(publisher, "verify_readback") as verify:
            publisher.publish(report)
        verify.assert_called_once()
        self.assertEqual(len(verify.call_args.args[1]), 1)
        rows = calls[-1][1]["requests"][1]["updateCells"]["rows"]
        self.assertEqual(rows[3]["values"][0]["userEnteredValue"]["stringValue"], "Stations changed")
        self.assertEqual(rows[3]["values"][1]["userEnteredValue"]["numberValue"], 1)
        self.assertEqual(len(rows), 6)

    def test_new_tab_created_once(self):
        calls = []
        def fake_api(path, data=None):
            calls.append((path, data))
            if path.startswith("?"): return {"sheets": [{"properties": {"title": "Production Overview", "sheetId": 99, "index": 3}}]}
            if "addSheet" in data["requests"][0]:
                return {"replies": [{"addSheet": {"properties": {"sheetId": 77}}}]}
            return {"replies": []}
        with patch.object(publisher, "call", side_effect=fake_api), patch.object(publisher, "verify_readback"):
            publisher.publish({"status": "baseline_created", "changes": []})
        self.assertEqual(calls[-1][1]["requests"][0]["updateCells"]["range"]["sheetId"], 77)
        self.assertEqual(calls[1][1]["requests"][0]["addSheet"]["properties"]["index"], 4)

if __name__ == "__main__":
    unittest.main()
