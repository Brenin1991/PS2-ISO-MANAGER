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
  /** OPL_SMB_*, PS2_ISO_DIR — mesmo que ao iniciar o backend */
  env?: Record<string, string>;
};
