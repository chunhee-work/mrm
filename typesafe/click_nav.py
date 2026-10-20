"""Merimen 2026-10-16: never build URLs with session tokens (Merimen logs the user out). Navigate by clicking."""
import time, driver as d

CLICK_TEXT = ('(function(rx){window.confirm=function(){return true};window.onbeforeunload=null;var e=[].slice.call(document.querySelectorAll("a,td[onclick],input[type=button],button"))'
              '.find(function(x){return rx.test((x.value||x.textContent||"").trim())&&x.offsetParent!==null});'
              'if(!e)return "none";setTimeout(function(){e.click()},30);return "ok";})')
CLICK_HREF = ('(function(rx){window.confirm=function(){return true};window.onbeforeunload=null;var a=[].slice.call(document.querySelectorAll("a[href]")).find(function(a){return rx.test(a.getAttribute("href"))});'
              'if(!a)return "none";setTimeout(function(){a.click()},30);return "ok";})')


def unblock(t):
    """A native JS confirm ("Remember to save…") blocks Chrome's AppleScript; press Return (= OK) until the page answers."""
    import subprocess
    for _ in range(3):
        w, tt = d.loc(t)
        r = subprocess.run(["osascript", "-e", 'with timeout of 6 seconds', "-e",
                            'tell application "Google Chrome" to execute (tab %d of window %d) javascript "1"' % (tt, w), "-e", "end timeout"],
                           capture_output=True, text=True)
        if r.returncode == 0: return
        time.sleep(5)   # no key presses: the user may be using Chrome at the same time


def no_dialogs(t):
    """Override confirm/alert in the PAGE's own world (AppleScript JS runs isolated), so no native dialog can block."""
    js = "window.confirm=function(){return true};window.alert=function(){};window.onbeforeunload=null;"
    d.js(t, "(function(){var s=document.createElement('script');s.textContent=%r;document.documentElement.appendChild(s);s.remove();return 1})()" % js)


def ok_dialogs(t):
    for _ in range(3):
        n = d.js(t, '(function(){var c=0;[].slice.call(document.querySelectorAll("input[type=button],button,a")).forEach(function(b){'
                    'if(/^OK$/i.test((b.value||b.textContent||"").trim())&&b.offsetParent){b.click();c++}});return c})()')
        if n and n != "0": time.sleep(4)
        else: break


def text(t, rx, wait=10):
    no_dialogs(t); r = d.js(t, CLICK_TEXT + "(/%s/)" % rx); time.sleep(3); unblock(t); time.sleep(max(wait - 3, 1)); unblock(t); return r


def href(t, rx, wait=12):
    no_dialogs(t); r = d.js(t, CLICK_HREF + "(/%s/)" % rx); time.sleep(3); unblock(t); time.sleep(max(wait - 3, 1)); unblock(t); return r


def home(t):
    return text(t, "^Claims Home$", 10)


def open_case(t, plate, caseid):
    d.js(t, '(function(){document.getElementById("SRCH").value=%r;setTimeout(function(){[].slice.call(document.querySelectorAll("input[type=button]")).find(function(b){return b.value==="Go"}).click()},30);return 1})()' % plate)
    time.sleep(9)
    return href(t, "caseid=%s" % caseid, 10)


def create_form(t):
    home(t)
    return href(t, "fuseaction=dsp_clmreg", 14)


def where(t):
    return d.js(t, 'location.href').split('fuseaction=')[1].split('&')[0]
