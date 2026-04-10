"""
Patch para Open PS2 Loader + Impacket SimpleSMBServer.

Chamar apply_smb2_negotiate_opl_fix() antes de instanciar SimpleSMBServer: o
__init__ copia handler.smb2Negotiate para __smb2Commands e não volta a ler a classe.

O smb2Negotiate(isSMB1=True) do Impacket só aceita dialectos exactos
'SMB 2.002\\x00' ou 'SMB 2.???\\x00' no SMB_COM_NEGOTIATE. O OPL na PS2
envia outra lista → Exception('SMB2 not supported, fallbacking'), traceback
e ligação SMB2 inútil.

Com SMB2 ligado no servidor, se esses literais não estiverem presentes,
respondemos na mesma com SMB2_DIALECT_002 (igual ao ramo de sucesso original).

TRANS2 FIND_NEXT2 (SMB1): o Impacket usa SearchCount inicial 1, sem padding de 8 bytes
entre entradas (o FIND_FIRST2 tem), e a condição >= SearchCount faz com que, quando
o cliente pede uma entrada por vez (comum no OPL), a primeira iteração saia sem dados —
listagem SMB fica eterna a carregar. Corrigido em apply_trans2_find_next2_opl_fix().
"""

from __future__ import annotations

import calendar
import time

# Mesmo valor que impacket.smbserver.STATUS_SMB_BAD_TID (não está em nt_errors).
_STATUS_SMB_BAD_TID = 0x00050002


def _opl_smb2_negotiate_response(connId, smbServer, recvPacket, isSMB1: bool):
    from impacket import smb
    from impacket import smb3structs as smb2
    from impacket.nt_errors import STATUS_SUCCESS
    from impacket.spnego import SPNEGO_NegTokenInit, TypesMech

    connData = smbServer.getConnectionData(connId, checkStatus=False)

    respPacket = smb2.SMB2Packet()
    respPacket["Flags"] = smb2.SMB2_FLAGS_SERVER_TO_REDIR
    respPacket["Status"] = STATUS_SUCCESS
    respPacket["CreditRequestResponse"] = 1
    respPacket["Command"] = smb2.SMB2_NEGOTIATE
    respPacket["SessionID"] = 0
    if isSMB1 is False:
        respPacket["MessageID"] = recvPacket["MessageID"]
    else:
        respPacket["MessageID"] = 0
    respPacket["TreeID"] = 0

    respSMBCommand = smb2.SMB2Negotiate_Response()
    respSMBCommand["SecurityMode"] = 1
    respSMBCommand["DialectRevision"] = smb2.SMB2_DIALECT_002
    respSMBCommand["ServerGuid"] = b"A" * 16
    respSMBCommand["Capabilities"] = 0
    respSMBCommand["MaxTransactSize"] = 65536
    respSMBCommand["MaxReadSize"] = 65536
    respSMBCommand["MaxWriteSize"] = 65536
    respSMBCommand["SystemTime"] = smb.POSIXtoFT(calendar.timegm(time.gmtime()))
    respSMBCommand["ServerStartTime"] = smb.POSIXtoFT(calendar.timegm(time.gmtime()))
    respSMBCommand["SecurityBufferOffset"] = 0x80

    blob = SPNEGO_NegTokenInit()
    blob["MechTypes"] = [TypesMech["NTLMSSP - Microsoft NTLM Security Support Provider"]]
    respSMBCommand["Buffer"] = blob.getData()
    respSMBCommand["SecurityBufferLength"] = len(respSMBCommand["Buffer"])

    respPacket["Data"] = respSMBCommand
    smbServer.setConnectionData(connId, connData)
    return None, [respPacket], STATUS_SUCCESS


def apply_smb2_negotiate_opl_fix() -> None:
    from impacket import smb
    from impacket.smbserver import SMB2Commands

    if getattr(SMB2Commands, "_opl_smb2_negotiate_patched", False):
        return

    # Py3: SMB2Commands.smb2Negotiate já é a função; em Py2 era staticmethod com __func__.
    _raw = SMB2Commands.smb2Negotiate
    _orig = getattr(_raw, "__func__", _raw)

    def smb2Negotiate(connId, smbServer, recvPacket, isSMB1=False):
        if isSMB1 is not True:
            return _orig(connId, smbServer, recvPacket, isSMB1)
        if getattr(smbServer, "_SMBSERVER__SMB2Support", False):
            try:
                SMBCommand = smb.SMBCommand(recvPacket["Data"][0])
                dialects = SMBCommand["Data"].split(b"\x02")
            except Exception:
                dialects = []
            if b"SMB 2.002\x00" not in dialects and b"SMB 2.???\x00" not in dialects:
                return _opl_smb2_negotiate_response(connId, smbServer, recvPacket, isSMB1)
        return _orig(connId, smbServer, recvPacket, isSMB1)

    SMB2Commands.smb2Negotiate = staticmethod(smb2Negotiate)
    SMB2Commands._opl_smb2_negotiate_patched = True


def apply_trans2_find_next2_opl_fix() -> None:
    """Correção OPL + Impacket TRANS2 FIND_NEXT2 (SMB1). Chamar antes de SimpleSMBServer()."""
    from impacket import smb
    from impacket.nt_errors import STATUS_INVALID_HANDLE, STATUS_SUCCESS
    from impacket.smbserver import TRANS2Commands

    if getattr(TRANS2Commands, "_opl_find_next2_patched", False):
        return

    def findNext2(connId, smbServer, recvPacket, parameters, data, maxDataCount):
        connData = smbServer.getConnectionData(connId)

        respSetup = b""
        respParameters = b""
        respData = b""
        errorCode = STATUS_SUCCESS
        findNext2Parameters = smb.SMBFindNext2_Parameters(flags=recvPacket["Flags2"], data=parameters)

        sid = findNext2Parameters["SID"]
        if recvPacket["Tid"] in connData["ConnectedShares"]:
            if sid in connData["SIDs"]:
                searchResult = connData["SIDs"][sid]
                respParameters = smb.SMBFindNext2Response_Parameters()
                endOfSearch = 1
                searchCount = 0
                totalData = 0
                for idx, rec in enumerate(searchResult):
                    blob = rec.getData()
                    len_data = len(blob)
                    # Alinhar a FIND_FIRST2: usar '>' (não '>='), senão SearchCount==1
                    # falha na primeira linha e não devolve bytes nenhuns.
                    if (totalData + len_data) >= maxDataCount or (idx + 1) > findNext2Parameters["SearchCount"]:
                        endOfSearch = 0
                        connData["SIDs"][sid] = searchResult[idx:]
                        respParameters["LastNameOffset"] = totalData
                        break
                    searchCount += 1
                    respData += blob
                    pad_len = (8 - (len_data % 8)) % 8
                    respData += b"\xaa" * pad_len
                    totalData += len_data + pad_len

                if endOfSearch > 0:
                    del connData["SIDs"][sid]

                respParameters["EndOfSearch"] = endOfSearch
                respParameters["SearchCount"] = searchCount
            else:
                errorCode = STATUS_INVALID_HANDLE
        else:
            errorCode = _STATUS_SMB_BAD_TID

        smbServer.setConnectionData(connId, connData)

        return respSetup, respParameters, respData, errorCode

    TRANS2Commands.findNext2 = staticmethod(findNext2)
    TRANS2Commands._opl_find_next2_patched = True
