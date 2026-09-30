# Leser-Konfiguration (Reader Config) – Datenformat v1

Die Doc-Methode `get_reader_config` von *Transponder Configuration* liefert die minimalen
Sicherheitsinformationen, die ein RFID-Leser braucht, um die vom KeyCreator beschriebenen
Transponder zu lesen. Pro aktiver Technologie (MIFARE Classic, MIFARE DESFire) entsteht ein
eigener Blob mit identischer Struktur. Das Key-Feld ist AES-verschlüsselt, der Klartext-Key
verlässt das System nie. Im Formular erzeugt der Button **Leser-Konfiguration kopieren** die
Werte und legt sie in die Zwischenablage, ohne sie anzuzeigen (mehrere Blobs zeilenweise).

Rückgabe der Doc-Methode: `{"mfcl": "<hex>", "mfdf": "<hex>"}`, nur aktive Technologien.

Ein Blob: 41 Byte als 82 Hex-Zeichen (Großbuchstaben, kein Trennzeichen).

## Struktur (Mehrbyte-Werte little-endian)

| Off | Len | Feld          | Classic | DESFire |
|----:|----:|---------------|---------|---------|
| 0   | 1   | version_flags | `0x11`: Bit 7..4 = Version 1, Bit 0 = MFCL | `0x12`: Bit 7..4 = Version 1, Bit 1 = MFDF |
| 1   | 1   | block         | `sector` | `file_byte` (Nummer der Standard-Datei) |
| 2   | 1   | skip_bytes    | `skip_bytes`, Byte-Offset der Nummer im Sektor (Block = skip>>4, Byte im Block = skip&15) | 0, Offset der Nummer in der Datei |
| 3   | 1   | read_bytes    | `read_bytes`, Länge der Nummer (1..4) | 4, Länge der Nummer |
| 4   | 3   | aid           | 0 | `app_id`, 24 Bit little-endian |
| 7   | 1   | key_no        | 0 | 1, Applikations-Key für das Lesen |
| 8   | 1   | key_type      | 0 | 2 = AES-128 (0 = 3DES 16 Byte, 1 = 3K3DES 24 Byte, 2 = AES 16 Byte) |
| 9   | 32  | key_enc       | `key_a` verschlüsselt, siehe unten | `app_read_key` verschlüsselt, siehe unten |

## Verschlüsselung des Key-Felds

- Klartext-Block: 32 Byte, Key linksbündig ab Byte 0 (Classic 6 Byte, 3DES 16, 3K3DES 24,
  AES 16), Rest `0x00`. Kein PKCS#7, die gültige Key-Länge ergibt sich aus Technologie bzw. `key_type`.
- Algorithmus: **AES-128-CBC**, IV = 16 × `0x00` (fest, nicht im Blob).
- Schlüssel: globaler Transportschlüssel (KEK, 16 Byte). Serverseitig in `site_config.json`
  als `reader_config_kek` (32 Hex-Zeichen), leserseitig in der Firmware. Der KEK ist nie Teil des Blobs.
- Entschlüsselung: AES-128-CBC decrypt mit IV = 0 über die 32 Byte, dann die ersten n Byte
  als Key verwenden. Ohne CBC-Lib gleichwertig: `P0 = AES_dec(C0)`, `P1 = AES_dec(C1) XOR C0`.
- Es gibt keinen MAC: ein mit falschem KEK erzeugter Blob wird erst beim Authentifizieren an
  der Karte erkannt.

KEK setzen:

```
bench --site <site> set-config reader_config_kek <32 Hex-Zeichen>
```

## Testvektoren

Nur für Tests, dieser KEK darf nie produktiv verwendet werden: KEK `000102030405060708090A0B0C0D0E0F`.

Classic, Sektor 1, Offset 0, 4 Byte, Key A `0102030405A6`:

```
1101000400000000009849BDBF7F680958F602D50A4C5A2B161C28C8FA9B53C14B2C06B58384354939
```

DESFire, AID `0xABCD`, Datei 1, Read Key `000102030405060708090A0B0C0D0E0F`:

```
12010004CDAB0001020A940BB5416EF045F1C39458C653EA5AAEE71EA541D7AE4BEB60BECC593FB663
```

## Nummer auf der Karte

Der KeyCreator schreibt die Transpondernummer auf beiden Technologien als **uint32
little-endian** (niederwertigstes Byte zuerst):

- Classic: mit dem entschlüsselten Key (Key A) auf Sektor `block` authentifizieren, Block
  `(block << 2) + (skip_bytes >> 4)` lesen, ab Byte `skip_bytes & 15` genau `read_bytes` Byte.
- DESFire: Applikation `aid` wählen, mit Key `key_no` (`key_type`, entschlüsselter Key)
  authentifizieren, Datei `block` ab Offset `skip_bytes` mit `read_bytes` Byte lesen
  (Datei ist fully enciphered angelegt).

## C-Referenz

```c
#include <stdint.h>
#include <string.h>
#include "aes.h"   /* z.B. tiny-AES-c mit CBC=1, AES128 */

#define FZ_RC_SIZE          41
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
    uint8_t aid[3];         /* DESFire only, little-endian */
    uint8_t key_no;         /* DESFire only */
    uint8_t key_type;       /* DESFire only, FZ_RC_KEYTYPE_* */
    uint8_t key_enc[32];    /* AES-128-CBC(KEK, IV = 0), key left aligned, zero padded */
} fz_reader_config_v1_t;   /* sizeof == 41 */
#pragma pack(pop)

/* decrypt key_enc in place into key_out (32 bytes); kek is the 16 byte transport key */
static void fz_rc_decrypt_key(const fz_reader_config_v1_t *c, const uint8_t *kek, uint8_t *key_out)
{
    static const uint8_t iv[16] = {0};
    struct AES_ctx ctx;
    memcpy(key_out, c->key_enc, 32);
    AES_init_ctx_iv(&ctx, kek, iv);
    AES_CBC_decrypt_buffer(&ctx, key_out, 32);
}

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
