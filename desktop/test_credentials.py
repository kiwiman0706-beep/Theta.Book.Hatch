"""Credential storage: on macOS the NAS login goes to the Keychain (no credentials.bin left behind),
and falls back to the private file when the Keychain refuses. The Keychain is faked here; the real one
is checked on a Mac (CHECKLIST_DESKTOP_MAC_0.2.1.md)."""
import json
import os
import sys
import tempfile
import types
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bridge  # noqa: E402

store = {}
fail = {"on": False}


class FakeKeyring:
    def set_password(self, service, account, value):
        if fail["on"]:
            raise RuntimeError("locked")
        store[(service, account)] = value

    def get_password(self, service, account):
        if fail["on"]:
            raise RuntimeError("locked")
        return store.get((service, account))

    def delete_password(self, service, account):
        store.pop((service, account), None)


backends = types.ModuleType("keyring.backends")
backends.macOS = types.SimpleNamespace(Keyring=FakeKeyring)
sys.modules["keyring"] = types.ModuleType("keyring")
sys.modules["keyring.backends"] = backends
real_platform = sys.platform
sys.platform = "darwin"
try:
    home = Path(tempfile.mkdtemp())
    b = bridge.Bridge(home=home)
    b.n_saveCredentials("https://nas.example:5001", "user", "pw", "sid1")
    assert not (home / "credentials.bin").exists(), "credentials.bin written although the Keychain worked"
    assert len(store) == 1 and (bridge.KEYCHAIN_SERVICE, bridge.KEYCHAIN_ACCOUNT) in store
    assert json.loads(b.n_loadCredentials())["account"] == "user"
    b.n_clearCredentials()
    assert not store and b.n_loadCredentials() is None

    fail["on"] = True
    b.n_saveCredentials("https://nas.example:5001", "user2", "pw", "sid2")
    assert (home / "credentials.bin").exists(), "no fallback file when the Keychain refused"
    assert oct((home / "credentials.bin").stat().st_mode & 0o777) == "0o600"
    assert json.loads(b.n_loadCredentials())["account"] == "user2"
    b.n_clearCredentials()
    assert b.n_loadCredentials() is None
finally:
    sys.platform = real_platform
print("CREDENTIALS OK")
