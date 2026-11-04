"""apply ~/mrm-bot/s2/final_plan_<P>.json in Merimen: tick -> misc -> snapshot -> details -> manual -> estfill -> qty/cmt -> fillempty"""
import json,subprocess,sys,os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'batch'))
from mrm import safe, wait_login
B=os.environ.get("BATCH_DIR", os.path.dirname(os.path.abspath(__file__))); H=os.path.expanduser('~/mrm-bot')
ids={l.split()[0]:l.split()[1:] for l in open(B+'/ids.txt') if l.strip()}
# write every case of this batch into extmap ONCE, merged with the file (batch 7: two apply runs each wrote their own copy
# and the second one wiped the first one's cases -> estfill printed "est []" for 3 cases)
ext=json.load(open(H+'/extmap_b4.json')) if os.path.exists(H+'/extmap_b4.json') else {}
ext.update({p:{'cid':v[0],'extid':v[1]} for p,v in ids.items()}); json.dump(ext,open(H+'/extmap_b4.json','w'))
def run(*a,log=None):
    o=safe(*a)   # waits for the user's relogin and retries if Merimen logged out
    if log: open(log,'w').write(o)
    return o
import re
def pair_rule(p,P):
    """user 2026-11-04: Headlamp Panel <side> and Fender Inner <side> go together — either one picked -> pick the other, same side.
    Fender Inner in the catalogue = Fender Front Inner / Fender Front Inner Upper / Fender Front Inner Reinforcement (first that exists)."""
    cf=f'{H}/s2/cat_{p}.json'
    try: mk=json.load(open(B+'/meta.json')).get(p,'')
    except Exception: mk=''
    if not os.path.exists(cf) or not mk.upper().startswith('PERODUA'): return   # Fender Inner is a Perodua part (other makes: Front Panel Assembly)
    nm=lambda l: re.sub(r"\s*\([^)]*\)\s*$","",re.sub(r"^\S+ \[[^\]]*\] ","",l)).strip()
    cat={nm(l):v for v,l,_ in json.load(open(cf))['cat']}; got={nm(l) for v,l,_ in json.load(open(cf))['cat'] if v in P['CP']}
    for sd in ('LH','RH'):
        hp=[f'Headlamp Panel {sd}',f'Front Panel Radiator Support {sd}'];   # CEW7805/JSF901: Headlamp Panel photo = Front Panel Radiator Support
        fi=[f'Fender Front Inner {sd}',f'Fender Front Inner Upper {sd}',f'Fender Front Inner Reinforcement {sd}']
        if any(x in got for x in hp+fi):
            for grp in (hp,fi):
                if not any(x in got for x in grp):
                    x=next((x for x in grp if x in cat),None)
                    if x: P['CP'].append(cat[x]); got.add(x); print(p,'pair rule: added',x)
def one(p):
    c,e=ids[p]
    P=json.load(open(f'{H}/s2/final_plan_{p}.json'))
    pair_rule(p,P)
    json.dump({'CP':P['CP'],'N':P['N'],'R':P['R'],'CM':P.get('CM',[])},open(f'{H}/s2/apply_{p}.json','w'))   # parts + labour + misc in ONE save
    o=run('tickall.mjs',c,e,'session_base.txt',f'{H}/s2/apply_{p}.json',log=f'{H}/s2/apply_{p}.log'); print(p,'tick',[l for l in o.splitlines() if 'ticked' in l][:1])
    open(f'{H}/state/sel_{p}_mine.json','w').write(run('selstate.mjs',c,e,'session_base.txt'))
    run('gonext.mjs',c,e,'session_base.txt')
    for m in P.get('manual',[]):   # user 2026-11-04: Suspension Crossmember Front / Rear ALWAYS in group 130 Undercarriage
        if re.search(r'suspension crossmember|crossmember.*suspension',m[1],re.I) and m[0]!='130': print(p,'group',m[0],'-> 130 for',m[1]); m[0]='130'
    if P.get('manual'):
        json.dump(P['manual'],open(f'{H}/s2/man_{p}.json','w')); o=run('addparts.mjs',c,e,'session_base.txt',f'{H}/s2/man_{p}.json','save'); print('  manual',[l for l in o.splitlines() if 'added' in l][:1])
    o=run('estfill.mjs',p,'session_base.txt','extmap_b4.json','v'); print('  est',[l[:120] for l in o.splitlines() if 'set PDC' in l or 'PDC filled' in l][:2])
    if P.get('qty'): o=run('setqty.mjs',c,e,'session_base.txt',json.dumps(P['qty'])); print('  qty',o.strip()[-120:])
    if P.get('cmt'):
        json.dump(P['cmt'],open(f'{H}/s2/cmt_{p}.json','w')); o=run('setcmt.mjs',c,e,'session_base.txt',f'{H}/s2/cmt_{p}.json'); print('  cmt',[l[:200] for l in o.splitlines() if 'VERIFY' in l][:1])
    run('fillempty.mjs',c,e,'session_base.txt')
    open(f'{H}/state/rows_{p}_now.json','w').write(run('rows.mjs',c,e,'session_base.txt'))

# several cases at once (one tab each). PAR=5 by default; lower it if Merimen gets unstable.
from concurrent.futures import ThreadPoolExecutor
wait_login()
with ThreadPoolExecutor(int(os.environ.get('PAR', '5'))) as ex:
    list(ex.map(one, sys.argv[1:]))
run('closetabs.mjs')
# auto-fix + checks + sheet rows (tools/step2/finish.py); FINISH=0 to skip
if os.environ.get('FINISH','1')=='1':
    subprocess.run([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)),'finish.py')]+sys.argv[1:])
