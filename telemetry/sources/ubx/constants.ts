// U-Blox UBX framing shared by every receiver that speaks it (RaceBox, Dragy).

export const SYNC_BYTE_1 = 0xb5;
export const SYNC_BYTE_2 = 0x62;

export const HEADER_LENGTH = 6;
export const CHECKSUM_LENGTH = 2;

// Longer than any message these receivers emit; a larger length is a misframe.
export const MAX_PAYLOAD_LENGTH = 504;

export const NAV_CLASS = 0x01;
export const NAV_PVT_ID = 0x07;

export const ACK_CLASS = 0x05;
export const ACK_NAK_ID = 0x00;
export const ACK_ACK_ID = 0x01;

export const CFG_CLASS = 0x06;
export const CFG_VALSET_ID = 0x8a;
export const CFG_VALGET_ID = 0x8b;
