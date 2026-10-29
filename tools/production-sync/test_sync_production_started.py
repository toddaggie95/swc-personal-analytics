import importlib.util
import pathlib
import unittest
import tempfile
import csv
import json
import os
from unittest.mock import patch

PATH=pathlib.Path(__file__).with_name("sync-production-started.py")
spec=importlib.util.spec_from_file_location("started_sync",PATH)
sync=importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)

class StartedSyncTests(unittest.TestCase):
 def test_two_running_shipyards_in_same_hub(self):
  manifest={"destinations":[{"id":"hub","kind":"hub","system":"Kashyyyk","center":{"x":5,"y":17},"target":{"hasColumn":10,"materialStartRow":47},"memberStationUids":["5:1","5:2","5:3"]}]}
  stations=[{"uid":"5:1","system":"Kashyyyk","sysX":"4","sysY":"16","type_name":"Shipyard I","productionStatus":"running","tooled-to":"Mining Barque","productionQuantity":"1"},{"uid":"5:2","system":"Kashyyyk","sysX":"5","sysY":"16","type_name":"Shipyard I","productionStatus":"running"},{"uid":"5:3","system":"Kashyyyk","sysX":"6","sysY":"16","type_name":"Shipyard I","productionStatus":"running"}]
  rows=[[] for _ in range(48)]
  rows[36]=[""]*9;rows[36][8]="Hub (5,17)"
  for i,xy in enumerate(["4,16","5,16","6,16"],37):
   rows[i]=[""]*12;rows[i][8]=xy
  rows[39][11]="Yes"
  result=sync.plan(manifest,stations,{"Kashyyyk":rows})
  self.assertEqual(result["checkedShipyards"],3)
  self.assertEqual([(c["uid"],c["proposed"]) for c in result["changes"] if c.get("field")=="started"],[("5:1","Yes"),("5:2","Yes")])
 def test_reject_coordinate_drift(self):
  manifest={"destinations":[{"id":"x","kind":"oneoff-group","system":"Kashyyyk","memberStationUids":["5:1"],"oneoffs":[{"stationUid":"5:1","row":1}]}]}
  station={"uid":"5:1","system":"Kashyyyk","sysX":"4","sysY":"16","type_name":"Shipyard I","productionStatus":"running"}
  with self.assertRaisesRegex(ValueError,"coordinate mismatch"):
   sync.plan(manifest,[station],{"Kashyyyk":[[],[],["0,0","","","","5:1"]]})
 def test_running_to_blank_transition(self):
  manifest={"destinations":[{"id":"hub","kind":"hub","system":"Kashyyyk","center":{"x":5,"y":17},"target":{"hasColumn":10,"materialStartRow":47},"memberStationUids":["5:1"]}]}
  station={"uid":"5:1","system":"Kashyyyk","sysX":"4","sysY":"16","type_name":"Shipyard I","productionStatus":""}
  rows=[[] for _ in range(48)]
  rows[36]=[""]*9;rows[36][8]="Hub (5,17)"
  rows[37]=[""]*12;rows[37][8]="4,16";rows[37][11]="Yes"
  result=sync.plan(manifest,[station],{"Kashyyyk":rows})
  self.assertEqual(result["changes"][0]["proposed"],"")
 def test_real_first_kashyyyk_hub_registry(self):
  # Reproduces the complete, actual nine-station manifest and rows, including
  # the non-producing depot at the center and the array-formula coordinate cells.
  members=[("5:53153","14","3"),("5:53230","15","3"),
           ("5:53202","14","5"),("5:53253","15","5"),
           ("5:56984","16","4"),("5:53200","14","4"),
           ("5:56985","16","3"),("5:53304","16","5"),
           ("5:52608","15","4")]
  stations=[{"uid":uid,"system":"Kashyyyk","sysX":x,"sysY":y,
             "type_name":"Depot Station I" if uid=="5:52608" else "Shipyard IV",
             "productionStatus":"running" if uid=="5:53153" else ""}
            for uid,x,y in members]
  manifest={"destinations":[{"id":"Kashyyyk-hub-1-0","kind":"hub","system":"Kashyyyk",
             "center":{"x":15,"y":4},"target":{"hasColumn":2,"materialStartRow":13},
             "memberStationUids":[uid for uid,x,y in members]}]}
  rows=[[] for _ in range(12)]
  rows[2]=["Hub (15,4)"]
  for row,coord in enumerate(["14,3","15,3","16,3","14,4","15,4",
                               "16,4","14,5","15,5","16,5"],3):
   rows[row]=[coord,"Alpha-class Xg-1 Star Wing","48",""]
  result=sync.plan(manifest,stations,{"Kashyyyk":rows})
  self.assertEqual(result["checkedShipyards"],8)
  self.assertEqual([(c["uid"],c["row"],c["column"]) for c in result["changes"] if c.get("field")=="started"],
                   [("5:53153",3,3)])

 def test_live_read_uses_evaluated_coordinates_not_formulas(self):
  manifest={"destinations":[{"id":"hub","kind":"hub","system":"Kashyyyk",
             "center":{"x":15,"y":4},"target":{"hasColumn":2,"materialStartRow":13},
             "memberStationUids":["5:53153"]}]}
  station={"uid":"5:53153","system":"Kashyyyk","sysX":"14","sysY":"3",
           "type_name":"Shipyard IV","productionStatus":"running"}
  with tempfile.TemporaryDirectory() as tmp:
   paths=[os.path.join(tmp,n) for n in ("layout.json","tff.csv","tjo.csv","result.json")]
   with open(paths[0],"w") as f:json.dump(manifest,f)
   for path,records in ((paths[1],[station]),(paths[2],[])):
    with open(path,"w",newline="") as f:
     writer=csv.DictWriter(f,fieldnames=list(station))
     writer.writeheader();writer.writerows(records)
   formatted=[["summary"],["Hub (15,4)"],["14,3","Alpha","48",""]]
   calls=[]
   def fake_request(url,token,body=None):
    calls.append(url)
    self.assertIn("valueRenderOption=FORMATTED_VALUE",url)
    return {"valueRanges":[{"values":[["Mining Barque"]]}]} if "%27Ships%27" in url else {"valueRanges":[{"values":formatted}]}
   with patch.object(sync,"request",fake_request),patch.dict(os.environ,{"GOOGLE_ACCESS_TOKEN":"fake","SWC_PRODUCTION_SHEET_ID":"test"}),patch.object(sync.sys,"argv",["sync",*paths,"false"]):
    sync.main()
   with open(paths[3]) as f:result=json.load(f)
   self.assertEqual(result["status"],"dry_run")
   self.assertEqual(result["transitionCounts"],{"toYes":1,"toBlank":0})
   self.assertEqual(len(calls),2)

 def test_running_assignment_updates_even_when_started_already_yes(self):
  manifest={"destinations":[{"id":"x","kind":"oneoff-group","system":"Dalchon","memberStationUids":["5:65787"],"oneoffs":[{"stationUid":"5:65787","row":10}]}]}
  station={"uid":"5:65787","system":"Dalchon","sysX":"10","sysY":"16","type_name":"Shipyard I","productionStatus":"running","tooled-to":"Mining Barque","productionQuantity":"1"}
  rows=[[] for _ in range(13)]
  rows[11]=["10,16","None","0","Yes","5:65787"]
  changes=sync.plan(manifest,[station],{"Dalchon":rows})["changes"]
  self.assertEqual([(c["column"],c["proposed"]) for c in changes],[(1,"Mining Barque"),(2,"1")])

 def test_unknown_ship_rejected_by_master(self):
  manifest={"destinations":[{"id":"x","kind":"oneoff-group","system":"Dalchon","memberStationUids":["5:65787"],"oneoffs":[{"stationUid":"5:65787","row":10}]}]}
  station={"uid":"5:65787","system":"Dalchon","sysX":"10","sysY":"16","type_name":"Shipyard I","productionStatus":"running","tooled-to":"Not a real ship","productionQuantity":"1"}
  rows=[[] for _ in range(13)]
  rows[11]=["10,16","None","0","Yes","5:65787"]
  with self.assertRaisesRegex(ValueError,"absent from Ships master"):
   sync.plan(manifest,[station],{"Dalchon":rows},{"Mining Barque"})

 def test_running_missing_assignment_fails_closed(self):
  manifest={"destinations":[{"id":"x","kind":"oneoff-group","system":"Dalchon","memberStationUids":["5:65787"],"oneoffs":[{"stationUid":"5:65787","row":10}]}]}
  station={"uid":"5:65787","system":"Dalchon","sysX":"10","sysY":"16","type_name":"Shipyard I","productionStatus":"running","tooled-to":"","productionQuantity":"1"}
  rows=[[] for _ in range(13)]
  rows[11]=["10,16","None","0","Yes","5:65787"]
  with self.assertRaisesRegex(ValueError,"missing ship/quantity"):
   sync.plan(manifest,[station],{"Dalchon":rows})

 def test_column_names(self):
  self.assertEqual(sync.column_name(11),"L")
  self.assertEqual(sync.column_name(38),"AM")

if __name__=="__main__":unittest.main()
