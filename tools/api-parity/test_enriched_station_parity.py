import importlib.util, pathlib, unittest

spec = importlib.util.spec_from_file_location('parity', pathlib.Path(__file__).with_name('enriched-station-parity.py'))
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)


class ParityTests(unittest.TestCase):
    def fixtures(self):
        web = {'tff': [{'uid': '1', 'name': 'Station', 'tooled-to': '', 'sysX': '0', 'sysY': '-2', 'productionStatus': ''}], 'tjo': []}
        api = [{'uid': '5:1', 'faction': 'tff', 'detailRead': 'ok', 'stationName': 'Station', 'tooledToValue': None,
                'stationCoordinates': {'system': {'attributes': {'x': 0, 'y': -2}}}, 'classification': 'idle-unassigned'}]
        return web, api

    def test_zero_coordinates_blank_tooling_and_uid_normalization(self):
        self.assertEqual(p.compare(*self.fixtures())['issues'], [])

    def test_duplicate_cross_faction_and_failed_reads_rejected(self):
        web, api = self.fixtures()
        with self.assertRaises(ValueError): p.compare(web, api + api)
        web['tjo'] = list(web['tff'])
        with self.assertRaises(ValueError): p.compare(web, api)
        web['tjo'] = []
        api[0]['detailRead'] = 'failed'
        with self.assertRaises(ValueError): p.compare(web, api)

    def test_sample_excludes_uncollected_full_reports_missing(self):
        web, api = self.fixtures()
        web['tff'].append({'uid': '2'})
        self.assertEqual(p.compare(web, api)['issueCounts'], {})
        self.assertEqual(p.compare(web, api, 'full')['issueCounts'], {'csvOnly': 1})

    def test_mismatch_unknown_and_non_equivalent_production(self):
        web, api = self.fixtures()
        api[0]['stationName'] = 'Changed'
        api[0]['stationCoordinates'] = None
        api[0]['classification'] = 'station-construction'
        result = p.compare(web, api)
        self.assertEqual(result['issueCounts'], {'name': 1})
        self.assertEqual(result['unknownFields']['sysX'], 1)
        self.assertEqual(result['unknownFields']['productionActive'], 1)


if __name__ == '__main__': unittest.main()
