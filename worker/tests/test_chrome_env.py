"""Chrome is started with a short list of environment variables, not with the worker's secrets (it used to inherit all of them)."""
import autopilot_worker.__main__ as entry
from autopilot_worker.chrome import chrome_env

SECRETS = {
    "DATABASE_URL": "x", "BLOB_READ_WRITE_TOKEN": "x", "HF_TOKEN": "x", "ANTHROPIC_API_KEY": "x", "MERIMEN_CRED_KEY": "x",
    "RESEND_API_KEY": "x", "TYPESAFE_API_KEY": "x", "EMAIL_FROM": "x", "MERIMEN_LOGIN": "on", "MERIMEN_WRITES": "on",
    "WORKER_SUBMIT": "on", "EXT_CONNECT": "on", "WORKER_ID": "w", "SSH_AUTH_SOCK": "/tmp/agent", "AWS_SECRET_ACCESS_KEY": "x",
}
NEEDED = {
    "PATH": "/usr/bin", "HOME": "/home/w", "DISPLAY": ":0", "XAUTHORITY": "/home/w/.Xauthority", "LANG": "en_US.UTF-8", "TZ": "Asia/Kuala_Lumpur",
    # the session bus and the runtime folder: Chrome reaches the desktop key store through them (the key its cookies are stored under)
    # and the Wayland socket lives in the runtime folder; without them a profile that was logged in may read as logged out
    "XDG_RUNTIME_DIR": "/run/user/1000", "DBUS_SESSION_BUS_ADDRESS": "unix:path=/run/user/1000/bus",
    "XDG_CURRENT_DESKTOP": "GNOME", "WAYLAND_DISPLAY": "wayland-0", "LC_ALL": "en_US.UTF-8", "https_proxy": "http://proxy:3128", "NO_PROXY": "localhost",
}


def test_only_what_chrome_needs_is_passed():
    env = chrome_env({**SECRETS, **NEEDED})
    assert env == NEEDED
    for name in SECRETS:
        assert name not in env


def test_proxy_and_distro_flag_names_reach_chrome():
    """A box behind a PAC file or a SOCKS proxy, and a distro wrapper that reads its flags from the environment."""
    extra = {"auto_proxy": "http://proxy/wpad.dat", "AUTO_PROXY": "http://proxy/wpad.dat", "SOCKS_SERVER": "proxy:1080", "SOCKS_VERSION": "5",
             "CHROMIUM_FLAGS": "--ozone-platform=x11"}
    assert chrome_env({**SECRETS, "PATH": "/usr/bin", **extra}) == {"PATH": "/usr/bin", **extra}


def test_missing_variables_are_not_invented():
    assert chrome_env({"PATH": "/usr/bin", "DATABASE_URL": "x"}) == {"PATH": "/usr/bin"}


def test_extra_names_can_be_passed_but_never_a_secret():
    base = {**SECRETS, "PATH": "/usr/bin", "LD_LIBRARY_PATH": "/opt/lib", "CHROME_ENV_PASS": "LD_LIBRARY_PATH, DATABASE_URL,MERIMEN_CRED_KEY,HF_TOKEN, NOT_SET, bad name"}
    env = chrome_env(base)
    assert env == {"PATH": "/usr/bin", "LD_LIBRARY_PATH": "/opt/lib"}


def test_a_secret_looking_xdg_or_locale_name_is_not_passed():
    env = chrome_env({"XDG_ACTIVATION_TOKEN": "t", "LC_SECRET_KEY": "k", "XDG_SESSION_TYPE": "x11", "LC_TIME": "C"})
    assert env == {"XDG_SESSION_TYPE": "x11", "LC_TIME": "C"}


def test_launch_hands_chrome_the_short_list(monkeypatch):
    seen = {}

    def popen(argv, **kw):
        seen["argv"], seen["kw"] = argv, kw

    monkeypatch.setattr(entry.subprocess, "Popen", popen)
    for k, v in {**SECRETS, "DISPLAY": ":0"}.items():
        monkeypatch.setenv(k, v)
    entry._launch(["/usr/bin/google-chrome", "--remote-debugging-port=9222"])
    env = seen["kw"]["env"]
    assert env["DISPLAY"] == ":0" and "PATH" in env
    assert not set(SECRETS) & set(env)
    assert seen["kw"]["start_new_session"] is True
