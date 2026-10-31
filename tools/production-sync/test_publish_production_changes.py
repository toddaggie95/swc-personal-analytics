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
        self.assertEqual(rows[7]["values"][1]["userEnteredValue"]["stringValue"], "Kashyyyk")
        self.assertEqual(rows[7]["values"][3]["userEnteredValue"]["stringValue"], "123")

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
        self.assertEqual(rows[7]["values"][0]["userEnteredValue"]["stringValue"], "No production changes")

    def test_three_fields_publish_one_station_notice(self):
        changes = [
            {"uid": "5:1", "system": "Kashyyyk", "type": "production_activity_changed", "field": "started", "before": False, "after": True},
            {"uid": "5:1", "system": "Kashyyyk", "type": "status_changed", "field": "status", "before": "idle", "after": "running"},
            {"uid": "5:1", "system": "Kashyyyk", "type": "readiness_changed", "field": "readiness", "before": "blocked", "after": "building"},
            {"uid": "5:2", "system": "Kashyyyk", "type": "readiness_changed", "field": "readiness", "before": "blocked", "after": "transfer"},
        ]
        notices = publisher.group_station_notices(changes)
        self.assertEqual(len(notices), 2)
        self.assertEqual([notices[0][1],notices[0][3],notices[0][4]], ["Kashyyyk", "5:1", "Production Started"])
        self.assertEqual(notices[0][7], "No → Yes")
        self.assertEqual(notices[0][9], "blocked → building")
        self.assertEqual(notices[1][4], "Readiness Changed")

    def test_sector_coordinates_and_multiple_changes(self):
        changes=[
            {"uid":"5:53791","system":"Kashyyyk","sector":"Mytaranor","coordinates":"6,18",
             "field":"started","before":False,"after":True,"type":"production_activity_changed"},
            {"uid":"5:53791","system":"Kashyyyk","sector":"Mytaranor","coordinates":"6,18",
             "field":"readiness","before":"blocked","after":"building","type":"readiness_changed"}]
        row=publisher.group_station_notices(changes)[0]
        self.assertEqual(row[:5],["Mytaranor","Kashyyyk","6,18","5:53791","Production Started"])
        self.assertEqual(row[7],"No → Yes")
        self.assertEqual(row[9],"blocked → building")

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
        self.assertEqual(len(rows), 8)
        self.assertEqual(rows[4]["values"][1]["userEnteredValue"]["numberValue"],1)
        self.assertEqual(rows[5]["values"][1]["userEnteredValue"]["numberValue"],0)
        self.assertTrue(any("setBasicFilter" in req for req in calls[-1][1]["requests"]))

    def test_started_and_finished_summary_counts_distinct_stations(self):
        changes=[
          {"uid":"5:1","system":"Kashyyyk","sector":"Mytaranor","type":"production_activity_changed","field":"started","before":False,"after":True},
          {"uid":"5:1","system":"Kashyyyk","sector":"Mytaranor","type":"status_changed","field":"status","before":"idle","after":"running"},
          {"uid":"5:2","system":"Daluuj","sector":"Albanin","type":"production_activity_changed","field":"started","before":True,"after":False},
        ]
        notices=publisher.group_station_notices(changes)
        self.assertEqual(sum(r[4]=="Production Started" for r in notices),1)
        self.assertEqual(sum(r[4]=="Production Stopped" for r in notices),1)
        self.assertEqual(notices[0][0:2],["Mytaranor","Kashyyyk"])

    def test_transition_priority_then_sector_system_numeric_coordinates(self):
        def event(uid, sector, system, coords, before=None, after=None):
            row={"uid":uid,"sector":sector,"system":system,"coordinates":coords,
                 "type":"readiness_changed","field":"readiness","before":"blocked","after":"transfer"}
            if before is not None:
                row.update(type="production_activity_changed",field="started",before=before,after=after)
            return row
        changes=[
            event("5:9","A","Alpha","2,1"),
            event("5:8","Z","Zeta","12,8",True,False),
            event("5:7","A","Alpha","12,8",False,True),
            event("5:6","A","Alpha","2,8",False,True),
            event("5:5","A","Alpha","2,10",False,True),
            event("5:4","A","Alpha","2,8",True,False),
            event("5:3","A","Alpha","1,1"),
        ]
        notices=publisher.group_station_notices(changes)
        self.assertEqual([row[3] for row in notices],
                         ["5:6","5:5","5:7","5:4","5:8","5:3","5:9"])
        self.assertEqual([row[7] for row in notices[:5]],
                         ["No → Yes"]*3+["Yes → No"]*2)

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
