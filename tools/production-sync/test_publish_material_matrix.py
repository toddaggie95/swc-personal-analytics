"""Regression checks for sector-aware material balance publication."""
import importlib.util
import copy
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
        self.assertEqual(rows[5][:2],["Mytaranor","Depot"])
        self.assertEqual(rows[7][:2],["Mytaranor","Kashyyyk"])
        self.assertEqual(rows[54][:2],["","TOTAL MISSING"])
        self.assertEqual(len(rows[4]),23)
    def test_sort_is_independent_and_preserves_row_slots(self):
        snapshot=self.sample()
        systems=snapshot["materialBalance"]["systems"]
        systems[0].update(sector="zeta",system="Alpha")
        systems[1].update(sector="alpha",system="Zulu")
        systems[2].update(sector="Alpha",system="beta")
        original=copy.deepcopy(snapshot)
        rows,colors=publisher.matrix(snapshot)
        slots=list(range(5,44,2))+[46]
        records=systems+snapshot["materialBalance"]["inventoryOnlySystems"]
        expected=sorted(records,key=lambda s:(s["sector"].casefold(),s["system"].casefold()))
        self.assertEqual([rows[i][:2] for i in slots],[[s["sector"],s["system"]] for s in expected])
        self.assertEqual([i for i,_ in colors],slots)
        self.assertEqual(rows[5][:2],["Alpha","beta"])
        for i in set(range(57))-set(slots)-{4,54,55,56}:
            self.assertEqual(rows[i],[""])
        self.assertEqual(snapshot,original)

    def test_missing_thresholds_and_excess_colors(self):
        for required,missing,excess,visible,shade,value in (
            (100,1,0,False,"yellow",-1),
            (100,10,0,False,"yellow",-10),
            (100,11,0,False,"red",-11),
            (100,30,0,False,"red",-30),
            (100,31,0,False,"red",-31),
            (0,0,25,True,"green",25),
            (0,0,25,False,None,""),
            (0,0,0,False,None,""),
        ):
            with self.subTest(required=required,missing=missing,excess=excess,visible=visible):
                snapshot=self.sample()
                balance=snapshot["materialBalance"]
                balance["systems"][0]["materials"]["material0"].update(
                    required=required,have=required-missing+excess,missing=missing,
                    excess=excess,net=excess-missing,showExcess=visible)
                for key,amount in (("missing",missing),("excess",excess),("net",excess-missing)):
                    balance["totals"][key]["material0"]=amount
                rows,colors=publisher.matrix(snapshot)
                column=rows[4].index("Material0")
                self.assertEqual(rows[7][column],value)
                self.assertEqual(dict(colors)[7][column],shade)
                self.assertEqual(rows[54][column],-missing)
                self.assertEqual(rows[55][column],excess)
                self.assertEqual(rows[56][column],excess-missing)
        self.assertEqual(publisher.PALETTE["green"],(.84,.94,.85))
        self.assertEqual(publisher.PALETTE["yellow"],(1,.95,.70))
        self.assertEqual(publisher.PALETTE["red"],(.98,.82,.81))

    def test_material_order_still_uses_demand_then_usage(self):
        snapshot=self.sample()
        snapshot["orders"]=[{"bill":{"material2":1}}]
        rows,_=publisher.matrix(snapshot)
        self.assertEqual(rows[4][2:5],["Material2","Material0","Material1"])
    def test_publish_extends_matrix_to_aj_and_verifies(self):
        snapshot=self.sample()
        balance=snapshot["materialBalance"]
        for material,required,have in (("material0",100,90),("material1",100,89),("material2",0,25)):
            missing=max(0,required-have);excess=max(0,have-required)
            balance["systems"][0]["materials"][material].update(
                required=required,have=have,missing=missing,excess=excess,net=have-required,showExcess=bool(excess))
            for key,value in (("missing",missing),("excess",excess),("net",have-required)):
                balance["totals"][key][material]=value
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
        highlights={a["repeatCell"]["range"]["startColumnIndex"]:a["repeatCell"]["cell"]["userEnteredFormat"]["backgroundColor"]
                    for a in actions if "repeatCell" in a and a["repeatCell"]["range"].get("startRowIndex")==7}
        for material,rgb in (("Material0",(1,.95,.70)),("Material1",(.98,.82,.81)),("Material2",(.84,.94,.85))):
            self.assertEqual(highlights[13+expected[4].index(material)],dict(zip(("red","green","blue"),rgb)))
        for action in actions:
            for kind in ("updateCells","repeatCell"):
                if kind in action:
                    self.assertGreaterEqual(action[kind]["range"]["startColumnIndex"],13)
        dimensions=[a["updateDimensionProperties"] for a in actions if "updateDimensionProperties" in a]
        self.assertEqual([(d["range"]["dimension"],d["range"]["startIndex"],d["range"]["endIndex"],d["properties"]["pixelSize"]) for d in dimensions],
                         [("COLUMNS",13,15,172),("COLUMNS",15,36,116),("ROWS",4,5,34)])
        resets=[a["repeatCell"] for a in actions if "repeatCell" in a and a["repeatCell"]["range"].get("startRowIndex")==0]
        self.assertEqual(resets[0]["cell"]["userEnteredFormat"]["backgroundColor"],{"red":1,"green":1,"blue":1})

if __name__=="__main__":
    unittest.main()
