"""Regression checks for sector-aware material balance publication."""
import importlib.util
import pathlib
import unittest
from unittest.mock import patch

FILE=pathlib.Path(__file__).with_name("publish-material-matrix.py")
spec=importlib.util.spec_from_file_location("material_matrix_publisher",FILE)
publisher=importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)

class MaterialMatrixTests(unittest.TestCase):
    def sample(self):
        mats=[f"material{i}" for i in range(21)]
        def record(system,sector):
            return {"system":system,"sector":sector,"materials":{
                m:{"have":0,"required":0,"net":0,"missing":0,"excess":0,"showExcess":False}
                for m in mats}}
        return {"mode":"read_only","orders":[],"materialBalance":{
            "materials":mats,"systems":[record("Kashyyyk","Mytaranor")]+[
                record(f"System{i}","Sector") for i in range(19)],
            "inventoryOnlySystems":[record("Depot","Mytaranor")],
            "totals":{k:{m:0 for m in mats} for k in ("missing","excess","net")}}}
    def test_sector_precedes_system_and_summary_is_aligned(self):
        rows,_=publisher.matrix(self.sample())
        self.assertEqual(rows[4][:3],["Sector","System","Material0"])
        self.assertEqual(rows[5][:2],["Mytaranor","Kashyyyk"])
        self.assertEqual(rows[46][:2],["Mytaranor","Depot"])
        self.assertEqual(rows[54][:2],["","TOTAL MISSING"])
        self.assertEqual(len(rows[4]),23)
    def test_publish_extends_matrix_to_aj_and_verifies(self):
        snapshot=self.sample()
        calls=[]
        expected,_=publisher.matrix(snapshot)
        def fake_request(token,path,payload=None):
            calls.append((path,payload))
            if path.startswith("?"):
                return {"sheets":[{"properties":{"sheetId":publisher.TAB_ID,"gridProperties":{"columnCount":36,"rowCount":60}},"conditionalFormats":[]}]}
            if path.startswith("/values/"):return {"values":expected}
            return {"replies":[]}
        with patch.object(publisher,"request",side_effect=fake_request):
            result=publisher.publish(snapshot,"fake")
        self.assertEqual(result["status"],"published_and_verified")
        actions=calls[1][1]["requests"]
        self.assertEqual(actions[0]["updateCells"]["range"]["endColumnIndex"],36)
        self.assertIn("N1%3AAJ",calls[-1][0])

if __name__=="__main__":
    unittest.main()
