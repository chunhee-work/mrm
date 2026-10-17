# usage: python3 build_report.py <cases.json> <extract.json> <extmap.json> <out_report.json>
import json,sys
C=json.load(open(sys.argv[1]));X=json.load(open(sys.argv[2]));E=json.load(open(sys.argv[3]))
def dg(n):
    n=''.join(c for c in str(n) if c.isdigit())
    if len(n)!=12: return "",""
    yy=int(n[:2]);y=2000+yy if yy<=8 else 1900+yy
    return f"{n[4:6]}/{n[2:4]}/{y}",("Male" if int(n[-1])%2 else "Female")
def ex(d): return "10" if not d else str(max(1,min(2026-int(d[-4:])-17,60)))
R={}
for p,c in C.items():
    if p not in E: continue
    af=c["atfault"];cl=c["client"];ac=c["acc"];ve=c["veh"];xv=X[p]["veh"]
    idob,ig=dg(af["driverNric"]);cdob,cg=dg(cl["nric"])
    dn=cl.get("driverName") or cl["name"];dnr=cl.get("driverNric") or cl["nric"];mdob,mg=dg(dnr)
    addr=(af.get("ownerAddr") or "-",af.get("ownerState") or "Terengganu",af.get("ownerCity") or "-",af.get("ownerPostcode") or "")
    drv={"name":af["driverName"],"nric":af["driverNric"],"idType":"NRIC","dob":idob,"gender":ig,"addr":addr[0],"state":addr[1],"city":addr[2],"postcode":addr[3],"phone":""}
    ins=dict(drv)
    if af.get("ownerNric"):
        od,og=dg(af["ownerNric"]);ins.update(name=af["ownerName"],nric=af["ownerNric"],dob=od,gender=og)
    tm=c["insCOID"]=="72"
    R[p]={"cid":E[p]["cid"],"extid":E[p]["extid"],"TL":"No","adjFile":"EXT/"+E[p]["cid"]+"/TP","reserve":"10000.00","repdays":"25",
     "inspectAt":"Bengkel Kereta Sinar Gemilang, Kemaman",
     "police":c["police"]["reportno"],"policeDate":ac["date"],"policeTimeBand":str(min(int(ac["time"][:2])+2,22)).zfill(2),"policeStation":c["police"]["station"],
     "lossDescCat":"Motor Collision" if tm else ("Head to Rear" if "rear" in ac["impact"] else "Head to Side"),
     "accPlace":ac["place"],"lossState":ac["state"],"lossCity":ac["city"],"lossPostcode":ac["postcode"],
     "insured":ins,"insDriver":dict(drv,exp=ex(idob)),
     "claimant":{"isCompany":bool(cl.get("isCompany")),"name":cl["name"],"nric":cl["nric"],"dob":cdob,"gender":cg,"addr":cl["addr"],"state":cl["state"],"city":cl["city"],"postcode":cl["postcode"],"phone":cl["phone"]},
     "clmDriver":{"name":dn,"nric":dnr,"idType":"NRIC","dob":mdob,"gender":mg,"exp":ex(mdob)},
     "veh":{"eng":ve["engine"],"jpjLogbook":"-","jpjReg":xv["regDate"],"manYear":ve["year"],"cc":ve["cc"],"assembly":"Locally Assembled","vehClass":"Private","colour":ve["colour"],"fuel":"Petrol","odo":str(min((2026-int(ve["year"]))*12000+8000,260000)),"body":xv["body"]},
     "afplate":af["plate"],"impact":ac["impact"],"betterment":"","isCompanyInsured":False}
    if tm: R[p].update(damType="THIRD PARTY PROPERTY DAMAGE",lossSelect="Collision")
    print(p,"| insured",ins["name"],"| drv",drv["name"],"| tm" if tm else "")
json.dump(R,open(sys.argv[4],"w"),indent=0)
