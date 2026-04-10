"""
Patches Impacket SMB (antes de SimpleSMBServer) para registar leituras de ficheiros .iso.

Chamar install_smb_iso_read_hooks() no opl_smb_host.py antes de instanciar o servidor.
"""

from __future__ import annotations

import logging

import play_time_tracker

_LOG = logging.getLogger(__name__)


_hooks_installed = False


def install_smb_iso_read_hooks() -> bool:
    global _hooks_installed
    if _hooks_installed:
        return True
    try:
        from impacket import smb, smb2
        from impacket.smbserver import SMB2Commands, SMBCommands
    except ImportError as e:
        _LOG.warning("smb_iso_hooks: impacket em falta (%s)", e)
        return False

    _orig_rx = SMBCommands.smbComReadAndX

    @staticmethod
    def _smbComReadAndX_wrapped(connId, smbServer, SMBCommand, recvPacket):
        ret = _orig_rx(connId, smbServer, SMBCommand, recvPacket)
        try:
            connData = smbServer.getConnectionData(connId)
            if recvPacket["Tid"] not in connData.get("ConnectedShares", {}):
                return ret
            if SMBCommand["WordCount"] == 0x0A:
                readAndX = smb.SMBReadAndX_Parameters2(SMBCommand["Parameters"])
            else:
                readAndX = smb.SMBReadAndX_Parameters(SMBCommand["Parameters"])
            fid = readAndX["Fid"]
            mx = int(readAndX.get("MaxCount", 0) or 0)
            if fid in connData.get("OpenedFiles", {}):
                path_name = connData["OpenedFiles"][fid].get("FileName")
                if path_name:
                    play_time_tracker.touch_iso_abspath(path_name, mx)
        except Exception as e:
            _LOG.debug("smbComReadAndX hook: %s", e)
        return ret

    SMBCommands.smbComReadAndX = _smbComReadAndX_wrapped

    _orig_s2 = SMB2Commands.smb2Read

    @staticmethod
    def _smb2Read_wrapped(connId, smbServer, recvPacket):
        ret = _orig_s2(connId, smbServer, recvPacket)
        try:
            connData = smbServer.getConnectionData(connId)
            read_request = smb2.SMB2Read(recvPacket["Data"])
            file_id = read_request["FileID"].getData()
            if file_id == b"\xff" * 16:
                if "SMB2_CREATE" in connData.get("LastRequest", {}):
                    file_id = connData["LastRequest"]["SMB2_CREATE"]["FileID"]
            ln = int(read_request.get("Length", 0) or 0)
            if recvPacket["TreeID"] in connData.get("ConnectedShares", {}) and file_id in connData.get(
                "OpenedFiles", {}
            ):
                path_name = connData["OpenedFiles"][file_id].get("FileName")
                if path_name:
                    play_time_tracker.touch_iso_abspath(path_name, ln)
        except Exception as e:
            _LOG.debug("smb2Read hook: %s", e)
        return ret

    SMB2Commands.smb2Read = _smb2Read_wrapped

    _hooks_installed = True
    return True
