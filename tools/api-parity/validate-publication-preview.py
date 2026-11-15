"""Validate actual production presentation builders without any network access."""
import importlib.util,json,pathlib,sys,urllib.request

def load(name):
    file=pathlib.Path(__file__).parents[1]/"production-sync"/name
    spec=importlib.util.spec_from_file_location(name,file)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module

def forbidden(*args,**kwargs):
    raise RuntimeError("Network access forbidden in publication preview")

def main(directory):
    root=pathlib.Path(directory)
    read=lambda name:json.loads((root/name).read_text(encoding="utf-8"))
    urllib.request.urlopen=forbidden
    dashboard=load("publish-overview-factions.py")
    matrix=load("publish-material-matrix.py")
    changes=load("publish-production-changes.py")
    preview=read("overview-publish-preview.json")
    rows,merges,top=dashboard.build(preview)
    material_rows,colors=matrix.matrix(read("overview-readiness.json"))
    report=read("production-change-report.json")
    if report.get("status") not in ("compared","baseline_created") or not isinstance(report.get("changes"),list):
        raise ValueError("Invalid production change report")
    notices=changes.group_station_notices(report["changes"])
    result={"status":"validated_no_write","writeAuthorized":False,"orders":preview["classifiedOrders"],
            "dashboardRange":"A5:L46","dashboardRows":len(rows),"dashboardColumns":len(rows[0]),
            "dashboardMerges":len(merges),"materialRows":len(material_rows),
            "changeNotices":len(notices),"fieldChanges":len(report["changes"])}
    (root/"publication-validation.json").write_text(json.dumps(result,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(result))

if __name__=="__main__":main(sys.argv[1])
