import importlib.util, pathlib, unittest

spec=importlib.util.spec_from_file_location('tracked',pathlib.Path(__file__).with_name('compare-tracked-shipyards.py'))
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)


class TrackedTests(unittest.TestCase):
    def fixture(self):
        rows=[[],[],['Hub (0,0)'],['0,0','Ship','1','Yes']]+[[] for _ in range(8)]
        snapshot={'manifest':{'destinations':[{'kind':'hub','system':'Test','center':{'x':0,'y':0},
                  'target':{'hasColumn':2,'materialStartRow':13},'memberStationUids':['5:1']}]},'rowsBySystem':{'Test':rows}}
        stations=[{'uid':'5:1','type_name':'Shipyard I','sysX':'0','sysY':'0'}]
        api=[{'uid':'5:1','detailRead':'ok','classification':'producing','tooledToValue':'Ship',
              'stationLocation':{'system':{'value':'Test'}},'stationCoordinates':{'system':{'attributes':{'x':0,'y':0}}}}]
        return snapshot,stations,api

    def test_running_zero_coordinate_match(self):
        result=p.compare(*self.fixture())
        self.assertEqual(result['checkedShipyards'],1);self.assertEqual(result['issues'],[])

    def test_started_and_running_ship_mismatches(self):
        s,w,a=self.fixture();s['rowsBySystem']['Test'][3]=['0,0','Other','1','']
        self.assertEqual({x['field'] for x in p.compare(s,w,a)['issues']},{'started','runningShip'})

    def test_idle_plan_is_not_tooling_mismatch(self):
        s,w,a=self.fixture();a[0]['classification']='idle-unassigned';a[0]['tooledToValue']=None
        s['rowsBySystem']['Test'][3][3]=''
        self.assertEqual(p.compare(s,w,a)['issues'],[])

    def test_missing_duplicate_and_location_drift_fail(self):
        s,w,a=self.fixture()
        with self.assertRaises(ValueError):p.compare(s,w,[])
        with self.assertRaises(ValueError):p.compare(s,w,a+a)
        a[0]['stationCoordinates']['system']['attributes']['x']=1
        with self.assertRaises(ValueError):p.compare(s,w,a)


if __name__=='__main__':unittest.main()
