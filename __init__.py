import threading
import time


# ===== Any type =====
class AnyType(str):
    def __ne__(self, other):
        return False

    def __eq__(self, other):
        return True


ANY = AnyType("*")


# ===== Global store =====
_STORE = {}
_LOCK = threading.RLock()
_SYNC_COUNTER = 0


# ===== Helpers =====
def _is_blocker(x) -> bool:
    if x is None:
        return False
    try:
        n = (x.__class__.__name__ or "").lower()
        r = (repr(x) or "").lower()
        return ("executionblock" in n) or ("blocker" in n) or ("executionblock" in r)
    except Exception:
        return False


def _get_execution_blocker():
    try:
        from comfy_execution.graph import ExecutionBlocker
        return ExecutionBlocker
    except Exception:
        pass

    try:
        from execution import ExecutionBlocker
        return ExecutionBlocker
    except Exception:
        pass

    class ExecutionBlocker:
        def __init__(self, message=None):
            self.message = message

    return ExecutionBlocker


ExecutionBlocker = _get_execution_blocker()


def _off(message=None):
    return ExecutionBlocker(message)


# =========================
# 0) GGBro Channel Selector
# =========================
class GGBroChannelSelector:
    MAX_CHANNELS = 8

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "select": ("INT", {"default": 1, "min": 1, "max": cls.MAX_CHANNELS, "step": 1}),
            }
        }

    RETURN_TYPES = ("INT",)
    RETURN_NAMES = ("selected_channel",)
    FUNCTION = "select_channel"
    CATEGORY = "GGBro Router"

    def select_channel(self, select):
        sel = int(select)
        sel = max(1, min(self.MAX_CHANNELS, sel))
        return (sel,)

    @classmethod
    def IS_CHANGED(cls, select=1):
        return int(select)


# =========================
# 1) GGBro Router OUT (Any) 1->8
# =========================
class GGBroRouterOutAny:
    MAX_OUT = 8

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "select": ("INT", {"default": 1, "min": 1, "max": cls.MAX_OUT, "step": 1}),
            },
            "optional": {
                "in": (ANY,),
            }
        }

    RETURN_TYPES = ("INT",) + tuple([ANY] * MAX_OUT)
    RETURN_NAMES = ("selected_channel",) + tuple([f"out{i}" for i in range(1, MAX_OUT + 1)])
    FUNCTION = "route"
    CATEGORY = "GGBro Router"

    def route(self, **kwargs):
        inp = kwargs.get("in", None)
        sel = int(kwargs.get("select", 1))
        sel = max(1, min(self.MAX_OUT, sel))

        outs = [_off()] * self.MAX_OUT
        outs[sel - 1] = inp
        return (sel,) + tuple(outs)

    @classmethod
    def IS_CHANGED(cls, select=1, **kwargs):
        return int(select)


# =========================
# 2) GGBro Router IN (Any) 8->1
# =========================
class GGBroRouterInAny:
    MAX_IN = 8

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "select": ("INT", {"default": 1, "min": 1, "max": cls.MAX_IN, "step": 1}),
            },
            "optional": {
                **{f"in{i}": (ANY, {"lazy": True}) for i in range(1, cls.MAX_IN + 1)},
            }
        }

    RETURN_TYPES = ("INT", ANY)
    RETURN_NAMES = ("selected_channel", "out")
    FUNCTION = "route"
    CATEGORY = "GGBro Router"

    def check_lazy_status(self, select, **kwargs):
        key = f"in{int(select)}"
        if kwargs.get(key, None) is None:
            return [key]
        return []

    def route(self, select, **kwargs):
        sel = max(1, min(self.MAX_IN, int(select)))
        key = f"in{sel}"
        value = kwargs.get(key, None)

        if value is None or _is_blocker(value):
            return (sel, _off(f"Router IN: selected input '{key}' is empty or blocked"))

        return (sel, value)

    @classmethod
    def IS_CHANGED(cls, select=1, **kwargs):
        return int(select)


# =========================
# 3) GGBro Set (Any)
# =========================
class GGBroSetAny:
    OUTPUT_NODE = True
    MAX_CHANNELS = 8

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "key": ("STRING", {"default": "A"}),
                "value": (ANY,),
                "respond_channel": ("INT", {"default": 1, "min": 1, "max": cls.MAX_CHANNELS, "step": 1}),
            },
            "optional": {
                "selected_channel": ("INT", {"default": 1, "min": 1, "max": cls.MAX_CHANNELS, "step": 1}),
            }
        }

    RETURN_TYPES = (ANY, "INT")
    RETURN_NAMES = ("value", "sync")
    FUNCTION = "set"
    CATEGORY = "GGBro Router"

    def set(self, key, value, respond_channel=1, selected_channel=1):
        global _SYNC_COUNTER

        if int(selected_channel) != int(respond_channel):
            with _LOCK:
                current_sync = _SYNC_COUNTER
            return (value, current_sync)

        if value is None or _is_blocker(value):
            with _LOCK:
                current_sync = _SYNC_COUNTER
            return (value, current_sync)

        with _LOCK:
            _STORE[str(key)] = value
            _SYNC_COUNTER += 1
            current_sync = _SYNC_COUNTER

        return (value, current_sync)

    @classmethod
    def IS_CHANGED(cls, key, value, respond_channel=1, selected_channel=1):
        return time.time()


# =========================
# 4) GGBro Get (Any)
# =========================
class GGBroGetAny:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "key": ("STRING", {"default": "A"}),
            },
            "optional": {
                "default": (ANY,),
                "sync": ("INT", {"default": 0}),
            }
        }

    RETURN_TYPES = (ANY,)
    RETURN_NAMES = ("value",)
    FUNCTION = "get"
    CATEGORY = "GGBro Router"

    def get(self, key, default=None, sync=0):
        with _LOCK:
            v = _STORE.get(str(key), None)

        if v is None or _is_blocker(v):
            if default is not None:
                return (default,)
            return (_off(f"GGBro Get: key '{key}' not found"),)

        return (v,)

    @classmethod
    def IS_CHANGED(cls, key, default=None, sync=0):
        return (str(key), int(sync))


NODE_CLASS_MAPPINGS = {
    "GGBro Channel Selector": GGBroChannelSelector,
    "GGBro Router OUT": GGBroRouterOutAny,
    "GGBro Router IN": GGBroRouterInAny,
    "GGBro Router": GGBroRouterOutAny,  # legacy alias
    "GGBro Set": GGBroSetAny,
    "GGBro Get": GGBroGetAny,
}


NODE_DISPLAY_NAME_MAPPINGS = {
    "GGBro Channel Selector": "GGBro Channel Selector",
    "GGBro Router OUT": "GGBro Router OUT (Any)",
    "GGBro Router IN": "GGBro Router IN (Any)",
    "GGBro Router": "GGBro Router OUT (Any) [Legacy]",
    "GGBro Set": "GGBro Set (Any)",
    "GGBro Get": "GGBro Get (Any)",
}


WEB_DIRECTORY = "./web"
