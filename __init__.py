import threading

# ===== Any type =====
class AnyType(str):
    def __ne__(self, other): return False
    def __eq__(self, other): return True

ANY = AnyType("*")

# ===== Store globale =====
_STORE = {}
_LOCK = threading.RLock()

def _is_blocker(x) -> bool:
    if x is None:
        return False
    try:
        n = (x.__class__.__name__ or "").lower()
        r = (repr(x) or "").lower()
        return ("executionblock" in n) or ("blocker" in n) or ("executionblock" in r)
    except Exception:
        return False

def _empty_image():
    # fallback safe per PreviewImage se non hai messo default
    try:
        import torch
        return torch.zeros((1, 64, 64, 3), dtype=torch.float32)
    except Exception:
        return None

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


# =========================
# 1) GGBro Router (Any) 1->N
# =========================
class GGBroRouterAny:
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
        inp = kwargs.get("in", None)  # <- ora può non esserci
        sel = int(kwargs.get("select", 1))
        sel = max(1, min(self.MAX_OUT, sel))

        off = ExecutionBlocker(None)
        outs = [off] * self.MAX_OUT
        outs[sel - 1] = inp  # se inp è None, va bene (ma non usarlo per preprocessors)

        return (sel,) + tuple(outs)


# =========================
# 2) GGBro Set (Any)
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
        # se non è il canale giusto, non scrivere
        if int(selected_channel) != int(respond_channel):
            return (value, 1)

        # ramo spento / blocker / None => non scrivere
        if value is None or _is_blocker(value):
            return (value, 1)

        with _LOCK:
            _STORE[str(key)] = value

        return (value, 1)


# =========================
# 3) GGBro Get (Any)
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
                "sync": ("INT", {"default": 1}),  # virtual wire (autowire)
            }
        }

    RETURN_TYPES = (ANY,)
    RETURN_NAMES = ("value",)
    FUNCTION = "get"
    CATEGORY = "GGBro Router"

    def get(self, key, default=None, sync=1):
        with _LOCK:
            v = _STORE.get(str(key), None)

        if v is None or _is_blocker(v):
            if default is not None:
                return (default,)
            return (_empty_image(),)

        return (v,)


NODE_CLASS_MAPPINGS = {
    "GGBro Router": GGBroRouterAny,
    "GGBro Set": GGBroSetAny,
    "GGBro Get": GGBroGetAny,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "GGBro Router": "GGBro Router (Any)",
    "GGBro Set": "GGBro Set (Any)",
    "GGBro Get": "GGBro Get (Any)",
}

WEB_DIRECTORY = "./web"