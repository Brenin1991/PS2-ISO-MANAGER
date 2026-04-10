"""
Gera `conf_opl.cfg` a partir do template em `opl_cfg/conf_opl.cfg` (raiz do repo).

Só se ajustam `remember_last` e `autostart_last`; o resto (default_device, cores, tema, …)
mantém-se igual ao default do projeto.
"""

from __future__ import annotations

from opl_cfg_defaults import build_conf_opl_from_template_crlf


def build_conf_opl_crlf(
    *,
    remember_last: int = 1,
    autostart_last: int = 3,
    **kwargs: object,
) -> bytes:
    """Compatível com chamadas antigas (kwargs extra ignorados)."""
    _ = kwargs
    return build_conf_opl_from_template_crlf(
        remember_last=int(remember_last),
        autostart_last=int(autostart_last),
    )
