"""Add parts that are not in the catalogue, on dsp_details (same page calls as ~/mrm-bot/addparts.mjs), + comments."""
import json, time, driver as d
ADD = '''(function(P){var out=[];var n0=+document.querySelector('[name=PROWCNT]').value;var ex=[];for(var i=1;i<=n0;i++){var e=document.getElementById('PDS'+i);if(e&&e.value)ex.push(e.value.trim().toLowerCase());}
 P.forEach(function(x){var g=x[0],desc=x[1],price=x[2],qty=x[3]||'1',cmt=x[4]||'';if(ex.indexOf(desc.toLowerCase())>=0){out.push('exists:'+desc);return;}
  try{var gp=document.getElementById('PADDGP');gp.setAttribute('KEY',g);gp.value=oest.PGrp[g];document.getElementById('PADDDS').value=desc;document.getElementById('PADDPT').value=price;PCloneRow(null,true);
   var row=document.getElementById('PROWCNT').value;if(qty!=='1'){var q=document.getElementsByName('PBT'+row)[0];if(q){q.value=qty;if(typeof FormStoreUpdate==='function')FormStoreUpdate(q);q.dispatchEvent(new Event('change',{bubbles:true}));}}
   if(cmt){var c=AddCmmt('P',String(row));c.value=cmt;if(typeof FormStoreUpdate==='function')FormStoreUpdate(c);if(c.onblur)c.onblur();}
   out.push('added:'+desc+'@'+row);}catch(e){out.push('ERR '+desc+' '+e.message);}});return JSON.stringify(out);})'''
CMT = '''(function(C){var n=+document.querySelector('[name=PROWCNT]').value;var o=[];for(var i=1;i<=n;i++){var td=document.getElementById('PTDS'+i)||document.getElementById('PDS'+i);if(!td)continue;
 var dd=(td.tagName==='INPUT'?td.value:td.childNodes[0].textContent).trim();if(!(dd in C))continue;var cm=AddCmmt('P',String(i));cm.value=C[dd];if(typeof FormStoreUpdate==='function')FormStoreUpdate(cm);if(cm.onblur)cm.onblur();o.push(dd);}return JSON.stringify(o);})'''
def main_world(t, code):
    """Chrome's AppleScript JS runs in an isolated world (page functions like PCloneRow/oest are invisible);
    run `code` (an expression) inside a <script> tag and read the result back from the DOM."""
    wrapped = "document.body.setAttribute('data-cc', String(%s));" % code
    d.js(t, "(function(){var s=document.createElement('script');s.textContent=%s;document.body.appendChild(s);s.remove();return 1})()" % json.dumps(wrapped))
    time.sleep(1)
    return d.js(t, "document.body.getAttribute('data-cc')")
def add(t, parts): return json.loads(main_world(t, ADD + "(%s)" % json.dumps(parts)))
def comments(t, cmap): return json.loads(main_world(t, CMT + "(%s)" % json.dumps(cmap)))
