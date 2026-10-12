#!/usr/bin/env python3
"""Upload each case's source PDF WITHOUT the native file picker (works with Accessibility revoked):
the PDF is streamed into a fresh dsp_docupload tab in base64 chunks, wrapped in a File, assigned to
#FilesID and a change event fired so the blueimp widget adds the row. Then Type=Other, name=DOC, Start.
Verified by counting Documentation (class 1) rows on dsp_docview before/after; a case that already has
a row with that name is skipped (never double-upload).

  python3 typesafe/run_upload.py PLATE=CASEID=/path/file.pdf[=DOC] ...
"""
import base64, json, os, sys, threading, time
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import driver as d

UP = ("https://www.merimen.com.my/claims/index.cfm?fusebox=SVCdoc&fuseaction=dsp_docupload&domainid=1"
      "&objid=%s&corole=4&docclassid=1&maxno=20&BCO_FLAGMODE=ADD&SHOWLABEL=0&nolayout=1&%s")
CH = 120000
LOCK = threading.Lock()


def J(tab, c):
    with LOCK:
        return d.js(tab, c)


def docs(tab, cid):
    """Documentation-class rows of the case: [(docid, stamp, name)]."""
    r = J(tab, '(function(){var x=new XMLHttpRequest();x.open("GET","/claims/index.cfm?fusebox=SVCdoc&fuseaction=dsp_docview'
               '&domainid=1&objid=%s&corole=4&%s",false);x.send();var m=x.responseText.match(/SVCDOCObjRow\\([^;]*\\);/g)||[];'
               'var o=[];m.forEach(function(r){var p=r.match(/SVCDOCObjRow\\(ds,(\\d+),(\\d+),(\\d+),"[^"]*",\\d+,"([^"]*)",\\s*"([^"]*)"/);'
               'if(p&&p[3]==="1")o.push([p[1],p[4],p[5]]);});return JSON.stringify(o);})()' % (cid, d.sess()))
    return json.loads(r)


def one(plate, cid, path, name, base, out):
    tab = None
    try:
        have = docs(base, cid)
        if any(x[2] == name for x in have):
            out[plate] = {"status": "already-uploaded", "docs": have}
            return
        with LOCK:
            before = {x["id"] for x in d.tabs()}
            d.newtab(base, UP % (cid, d.sess()))
        time.sleep(9)
        with LOCK:
            tab = [x for x in d.tabs() if x["id"] not in before][0]["id"]
        if J(tab, 'document.getElementById("FilesID")?"y":"n"') != "y":
            out[plate] = {"status": "FAIL", "why": "no FilesID (session?)"}
            return
        b64 = base64.b64encode(open(path, "rb").read()).decode()
        J(tab, 'window.__b=""')
        for i in range(0, len(b64), CH):
            J(tab, 'window.__b+="%s";1' % b64[i:i + CH])
        fn = os.path.basename(path).replace("  ", " ")
        J(tab, '(function(){var s=atob(window.__b),u=new Uint8Array(s.length);for(var i=0;i<s.length;i++)u[i]=s.charCodeAt(i);'
               'var f=new File([u],%s,{type:"application/pdf"});var dt=new DataTransfer();dt.items.add(f);'
               'var el=document.getElementById("FilesID");el.files=dt.files;el.dispatchEvent(new Event("change",{bubbles:true}));return 1;})()'
          % json.dumps(fn))
        time.sleep(3)
        r = J(tab, '(function(){var rs=document.querySelectorAll(".files .template-upload");if(rs.length!==1)return "rows="+rs.length;'
                   'var r=rs[0];var s=r.querySelector("select");s.value="32";s.dispatchEvent(new Event("change",{bubbles:true}));'
                   'var ds=r.querySelector("input#Desc");ds.value=%s;ds.dispatchEvent(new Event("input",{bubbles:true}));'
                   'ds.dispatchEvent(new Event("change",{bubbles:true}));r.querySelector(".start").click();return "started";})()' % json.dumps(name))
        if r != "started":
            out[plate] = {"status": "FAIL", "why": r}
            return
        ok = ""
        for _ in range(30):
            time.sleep(3)
            ok = J(tab, '(function(){var r=document.querySelector(".files .template-download");return r?r.textContent.replace(/\\s+/g," ").trim():"";})()')
            if ok:
                break
        after = docs(base, cid)
        out[plate] = {"status": "OK" if len(after) > len(have) and "Successful" in ok else "CHECK",
                      "widget": ok[:80], "docs": after}
    except Exception as e:
        out[plate] = {"status": "ERR", "error": str(e)[:200]}
    finally:
        if tab:
            with LOCK:
                d.close_tab(tab)


if __name__ == "__main__":
    d.attach(); d.login()
    base = d.T()
    out, th = {}, []
    for a in sys.argv[1:]:
        p = a.split("=")
        plate, cid, path = p[0], p[1], os.path.expanduser(p[2])
        t = threading.Thread(target=one, args=(plate, cid, path, p[3] if len(p) > 3 else "DOC", base, out))
        t.start(); th.append(t)
    for t in th:
        t.join()
    for k, v in out.items():
        print(k, json.dumps(v, ensure_ascii=False)[:300])
