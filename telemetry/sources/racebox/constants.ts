export const RACEBOX_UART_SERVICE_UUID = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E';
export const RACEBOX_TX_CHARACTERISTIC_UUID = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E';
export const RACEBOX_RX_CHARACTERISTIC_UUID = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E';

export const SYNC_BYTE_1 = 0xb5;
export const SYNC_BYTE_2 = 0x62;

export const HEADER_LENGTH = 6;
export const CHECKSUM_LENGTH = 2;

export const DATA_MESSAGE_CLASS = 0xff;
export const DATA_MESSAGE_ID = 0x01;
export const DATA_PAYLOAD_LENGTH = 80;

export const ACK_MESSAGE_ID = 0x02;
export const NACK_MESSAGE_ID = 0x03;
export const CONFIG_MESSAGE_ID = 0x27;

export const DEVICE_INFO_SERVICE_UUID = '0000180a-0000-1000-8000-00805f9b34fb';
export const MODEL_CHARACTERISTIC_UUID = '00002a24-0000-1000-8000-00805f9b34fb';
export const FIRMWARE_REVISION_CHARACTERISTIC_UUID = '00002a26-0000-1000-8000-00805f9b34fb';

// GNSS receiver configuration (0xFF 0x27) is only supported on firmware 3.3+.
export const CONFIG_MIN_FIRMWARE_MAJOR = 3;
export const CONFIG_MIN_FIRMWARE_MINOR = 3;

// U-Blox CFG-NAVSPG-DYNMODEL: 4 = automotive / ground-based use.
export const AUTOMOTIVE_DYNAMIC_MODEL = 4;
// Speed-reporting mode: 0 = ground speed (correct for cars), 1 = 3D speed.
export const GROUND_SPEED_REPORTING = 0;

// How long to wait for an ACK/NACK or config reply before giving up.
export const CONFIG_RESPONSE_TIMEOUT_MS = 2000;
