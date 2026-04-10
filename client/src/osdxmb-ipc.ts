export type UsbPackOpts = {
  outDir: string;
  pcIp: string;
  skipOsdxmb?: boolean;
  staticPs2?: boolean;
  ps2Ip?: string;
  ps2Mask?: string;
  ps2Gw?: string;
  ps2Dns?: string;
  layout?: "ps2-usb" | "opl-only";
  copyElf?: boolean;
  /** Segundos na contagem autostart_last do conf_opl (0–9). Default no script: 5 */
  oplAutostartSeconds?: number;
  /** Gera conf_opl sem remember_last / autostart_last */
  oplNoRemember?: boolean;
  /** OPL_SMB_*, PS2_ISO_DIR — mesmo que ao iniciar o backend */
  env?: Record<string, string>;
};
