"""apply ~/mrm-bot/s2/final_plan_<P>.json in Merimen: tick -> misc -> snapshot -> details -> manual -> estfill -> qty/cmt -> fillempty"""
import json,subprocess,sys,os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'batch'))
from mrm import safe, wait_login
B=os.environ.get("BATCH_DIR", os.path.dirname(os.path.abspath(__file__))); H=os.path.expanduser('~/mrm-bot')
ids={l.split()[0]:l.split()[1:] for l in open(B+'/ids.txt') if l.strip()}
ext=json.load(open(H+'/extmap_b4.json')) if os.path.exists(H+'/extmap_b4.json') else {}
def run(*a,log=None):
    o=safe(*a)   # waits for the user's relogin and retries if Merimen logged out
    if log: open(log,'w').write(o)
    return o
def one(p):
    c,e=ids[p]; ext[p]={'cid':c,'extid':e}; json.dump(ext,open(H+'/extmap_b4.json','w'))
    P=json.load(open(f'{H}/s2/final_plan_{p}.json'))
    json.dump({'CP':P['CP'],'N':P['N'],'R':P['R'],'CM':P.get('CM',[])},open(f'{H}/s2/apply_{p}.json','w'))   # parts + labour + misc in ONE save
    o=run('tickall.mjs',c,e,'session_base.txt',f'{H}/s2/apply_{p}.json',log=f'{H}/s2/apply_{p}.log'); print(p,'tick',[l for l in o.splitlines() if 'ticked' in l][:1])
    open(f'{H}/state/sel_{p}_mine.json','w').write(run('selstate.mjs',c,e,'session_base.txt'))
    run('gonext.mjs',c,e,'session_base.txt')
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
