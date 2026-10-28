import importlib.util
import pathlib
import unittest

PATH=pathlib.Path(__file__).with_name("sync-production-started.py")
spec=importlib.util.spec_from_file_location("started_sync",PATH)
sync=importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)

class StartedSyncTests(unittest.TestCase):
 def test_two_running_shipyards_in_same_hub(self):
  manifest={"destinations":[{"id":"hub","kind":"hub","system":"Kashyyyk","center":{"x":5,"y":17},"target":{"hasColumn":10,"materialStartRow":47},"memberStationUids":["5:1","5:2","5:3"]}]}
  stations=[{"uid":"5:1","system":"Kashyyyk","sysX":"4","sysY":"16","type_name":"Shipyard I","productionStatus":"running"},{"uid":"5:2","system":"Kashyyyk","sysX":"5","sysY":"16","type_name":"Shipyard I","productionStatus":"running"},{"uid":"5:3","system":"Kashyyyk","sysX":"6","sysY":"16","type_name":"Shipyard I","productionStatus":"running"}]
  rows=[[] for _ in range(48)]
  rows[36]=[""]*9;rows[36][8]="Hub (5,17)"
  for i,xy in enumerate(["4,16","5,16","6,16"],37):
   rows[i]=[""]*12;rows[i][8]=xy
  rows[39][11]="Yes"
  result=sync.plan(manifest,stations,{"Kashyyyk":rows})
  self.assertEqual(result["checkedShipyards"],3)
  self.assertEqual([(c["uid"],c["proposed"]) for c in result["changes"]],[("5:1","Yes"),("5:2","Yes")])
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
 def test_column_names(self):
  self.assertEqual(sync.column_name(11),"L")
  self.assertEqual(sync.column_name(38),"AM")

if __name__=="__main__":unittest.main()
