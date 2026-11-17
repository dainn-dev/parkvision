// VietQR (NAPAS 247 interbank QR) payload builder — EMVCo merchant-presented mode.
// Field layout taken from the NAPAS VietQR profile as documented in:
//   https://dev.to/oddeggs/reading-vietqr-on-the-phone-tlv-napas-and-28-bank-apps-4ghl
//   (tag 38 = NAPAS merchant account template: 00 GUID "A000000727",
//    01 beneficiary { 00 BIN, 01 account }, 02 service code "QRIBFTTA";
//    01 = "12" dynamic; 53 = "704" VND; 54 amount; 58 = "VN";
//    62 additional data { 08 purpose/note }; 63 = CRC-16/CCITT-FALSE over the
//    body including the "6304" prefix.)
// The official NAPAS247 specification PDF could not be retrieved here; verify
// with a real banking-app scan (plan Task 12, Step 6) before relying on it.

const tlv = (tag: string, value: string): string =>
  `${tag}${String(value.length).padStart(2, "0")}${value}`;

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF), 4 upper-case hex digits. */
export function crc16ccitt(input: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(input)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Memo is restricted to ASCII and trimmed to 25 chars (field 62-08 limit in common bank apps). */
const sanitizeMemo = (m: string): string =>
  m.replace(/[^\x20-\x7e]/g, "").trim().slice(0, 25);

export function buildVietQrPayload(a: {
  bin: string;
  accountNumber: string;
  amountVnd: number;
  memo: string;
}): string {
  const beneficiary = tlv("00", a.bin) + tlv("01", a.accountNumber);
  const merchant =
    tlv("00", "A000000727") + tlv("01", beneficiary) + tlv("02", "QRIBFTTA");
  const body =
    tlv("00", "01") +
    tlv("01", "12") +
    tlv("38", merchant) +
    tlv("53", "704") +
    tlv("54", String(Math.round(a.amountVnd))) +
    tlv("58", "VN") +
    tlv("62", tlv("08", sanitizeMemo(a.memo))) +
    "6304";
  return body + crc16ccitt(body);
}
