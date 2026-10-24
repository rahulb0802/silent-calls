"""Lip-reading service (components 5-6). See docs/specs/lipread.md.

    from server.lipread import LipReader, LipResult

Imported lazily, so light modules (metrics, paths) don't pull in torch/mediapipe/the model code.
"""

__all__ = ["LipReader", "LipResult"]


def __getattr__(name: str):
    if name in __all__:
        from . import reader

        return getattr(reader, name)
    raise AttributeError(name)
