# Leser-Konfiguration (Reader Config) – Datenformat v1

Die Doc-Methode `get_reader_config` von *Transponder Configuration* liefert die minimalen
Sicherheitsinformationen, die ein RFID-Leser braucht, um die vom KeyCreator beschriebenen
Transponder zu lesen. Pro aktiver Technologie (MIFARE Classic, MIFARE DESFire) entsteht ein
eigener Blob mit identischer Struktur. Im Formular erzeugt der Button
**Leser-Konfiguration kopieren** die Werte, zeigt sie an und legt sie in die Zwischenablage
(mehrere Blobs zeilenweise).

Rückgabe der Doc-Methode: `{"mfcl": "<hex>", "mfdf": "<hex>"}`, nur aktive Technologien.

Ein Blob: 33 Byte als 66 Hex-Zeichen (Großbuchstaben, kein Trennzeichen).

Beispiel Classic, Sektor 1, Offset 0, 4 Byte, Key A `0102030405A6`:

```
110100040102030405A60000000000000000000000000000000000000000000000
```

Beispiel DESFire, AID `0xABCD`, Datei 1, Read Key `00..0F`:

```
12010004000102030405060708090A0B0C0D0E0F0000000000000000CDAB000102
```

Enthalten sind nur Lese-Schlüssel (Key A, App Read Key). Master Keys werden nie ausgegeben.

## Struktur (Mehrbyte-Werte little-endian)

| Off | Len | Feld          | Classic | DESFire |
|----:|----:|---------------|---------|---------|
| 0   | 1   | version_flags | `0x11`: Bit 7..4 = Version 1, Bit 0 = MFCL | `0x12`: Bit 7..4 = Version 1, Bit 1 = MFDF |
| 1   | 1   | block         | `sector` | `file_byte` (Nummer der Standard-Datei) |
| 2   | 1   | skip_bytes    | `skip_bytes`, Byte-Offset der Nummer im Sektor (Block = skip>>4, Byte im Block = skip&15) | 0, Offset der Nummer in der Datei |
| 3   | 1   | read_bytes    | `read_bytes`, Länge der Nummer (1..4) | 4, Länge der Nummer |
| 4   | 24  | key           | `key_a` (6 Byte), linksbündig, Rest `0x00` | `app_read_key` (16 Byte AES), linksbündig, Rest `0x00` |
| 28  | 3   | aid           | 0 | `app_id`, 24 Bit little-endian |
| 31  | 1   | key_no        | 0 | 1, Applikations-Key für das Lesen |
| 32  | 1   | key_type      | 0 | 2 = AES-128 (0 = 3DES 16 Byte, 1 = 3K3DES 24 Byte, 2 = AES 16 Byte) |

Die gültige Länge des Key-Felds ergibt sich aus der Technologie bzw. `key_type`:
Classic 6 Byte, 3DES 16, 3K3DES 24, AES 16.

## Nummer auf der Karte

Der KeyCreator schreibt die Transpondernummer auf beiden Technologien als **uint32
little-endian** (niederwertigstes Byte zuerst):

- Classic: mit `key` (Key A) auf Sektor `block` authentifizieren, Block `(block << 2) + (skip_bytes >> 4)` lesen,
  ab Byte `skip_bytes & 15` genau `read_bytes` Byte.
- DESFire: Applikation `aid` wählen, mit Key `key_no` (`key_type`, `key`) authentifizieren,
  Datei `block` ab Offset `skip_bytes` mit `read_bytes` Byte lesen (Datei ist fully enciphered angelegt).

## C-Referenz

```c
#include <stdint.h>

#define FZ_RC_SIZE          33
#define FZ_RC_VERSION(b)    ((b) >> 4)
#define FZ_RC_IS_MFCL(b)    (((b) & 0x01) != 0)
#define FZ_RC_IS_MFDF(b)    (((b) & 0x02) != 0)

#define FZ_RC_KEYTYPE_3DES    0
#define FZ_RC_KEYTYPE_3K3DES  1
#define FZ_RC_KEYTYPE_AES     2

#pragma pack(push, 1)
typedef struct {
    uint8_t version_flags;  /* high nibble version (1), low nibble technology */
    uint8_t block;          /* Classic: sector, DESFire: file number */
    uint8_t skip_bytes;     /* offset of the number */
    uint8_t read_bytes;     /* length of the number, 1..4 */
    uint8_t key[24];        /* left aligned, zero padded */
    uint8_t aid[3];         /* DESFire only, little-endian */
    uint8_t key_no;         /* DESFire only */
    uint8_t key_type;       /* DESFire only, FZ_RC_KEYTYPE_* */
} fz_reader_config_v1_t;   /* sizeof == 33 */
#pragma pack(pop)

static uint32_t fz_rc_aid(const fz_reader_config_v1_t *c)
{
    return (uint32_t)c->aid[0]
         | ((uint32_t)c->aid[1] << 8)
         | ((uint32_t)c->aid[2] << 16);
}

/* number as stored on the card (little-endian, 1..4 bytes) */
static uint32_t fz_rc_number(const uint8_t *data, uint8_t len)
{
    uint32_t n = 0;
    for (uint8_t i = 0; i < len && i < 4; i++) {
        n |= (uint32_t)data[i] << (8 * i);
    }
    return n;
}
```

Hex-Dekodierung: je zwei Zeichen ergeben ein Byte, Byte 0 ist links.

## Versionierung

Jede Änderung am Layout erhöht das Versions-Nibble (max. 15). Ein Leser lehnt Blobs mit
unbekannter Version ab.
