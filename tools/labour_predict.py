# usage: python3 labour_predict.py <ACC AUT|NV|RW> <parts.json (list of part labels)> -> prints JSON {N,R,M,neighbours}
import json,re,sys,collections
acc=sys.argv[1];P=set(re.sub(r"^\S+\s+\[.*?\]\s*","",p).split(" (")[0].strip() for p in json.load(open(sys.argv[2])))
V=json.load(open("/Users/chunhee/mrm-bot/labour_all.json"))
EXC=sys.argv[3] if len(sys.argv)>3 else ""
pool=[x for x in V if x["acc"]==acc and x.get("cid")!=EXC] or V
if len(pool)<10: pool=V
def parts(x): return set(re.sub(r"^\S+\s+\[.*?\]\s*","",p).split(" (")[0].strip() for p in x.get("parts",[]))
K=5
sims=sorted(pool,key=lambda y:-len(P&parts(y))/max(len(P|parts(y)),1))[:K]
c={k:collections.Counter() for k in"NRM"}
for y in sims:
    for a in set(y["N"]):c["N"][a]+=1
    for a in set(y["R"]):c["R"][a]+=1
    for a in set(y.get("misc",[])):c["M"][a]+=1
N=sorted(a for a,v in c["N"].items() if v>=3);R=sorted(a for a,v in c["R"].items() if v>=3 and a not in N);M=sorted(a for a,v in c["M"].items() if v>=3)
print(json.dumps({"N":N,"R":R,"M":M,"neighbours":[y.get("plate","?") for y in sims]}))
