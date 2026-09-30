# -*- coding: utf-8 -*-
# Copyright (c) 2023-2025, Fink Zeitsysteme/libracore and Contributors
# See license.txt
from __future__ import unicode_literals

import frappe
import unittest
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

from finkzeit.finkzeit.doctype.transponder_configuration.transponder_configuration import (
    build_reader_config, build_reader_configs, reader_config_to_hex, encrypt_reader_key,
    get_reader_kek, READER_CONFIG_SIZE, READER_KEK_CONF)

# test vectors only, never use this KEK in production
KEK = bytes.fromhex("000102030405060708090A0B0C0D0E0F")
KEY_A = "0102030405A6"
READ_KEY = "000102030405060708090A0B0C0D0E0F"
# AES-128-CBC(KEK, IV = 0) over the zero padded 32 byte key field
KEY_A_ENC = bytes.fromhex("9849BDBF7F680958F602D50A4C5A2B161C28C8FA9B53C14B2C06B58384354939")
READ_KEY_ENC = bytes.fromhex("0A940BB5416EF045F1C39458C653EA5AAEE71EA541D7AE4BEB60BECC593FB663")

def classic_values():
    return {
        'mfcl': 1, 'mfdf': 0,
        'sector': 1, 'skip_bytes': 4, 'read_bytes': 4, 'key_a': KEY_A
    }

def desfire_values():
    return {
        'mfcl': 0, 'mfdf': 1,
        'app_id': 0x123456, 'file_byte': 1, 'app_read_key': READ_KEY
    }

def decrypt_key_field(blob):
    decryptor = Cipher(algorithms.AES(KEK), modes.CBC(bytes(16))).decryptor()
    return decryptor.update(blob[9:41]) + decryptor.finalize()

class TestTransponderConfiguration(unittest.TestCase):
    def test_size(self):
        self.assertEqual(READER_CONFIG_SIZE, 41)
        self.assertEqual(len(build_reader_config('mfcl', classic_values(), KEK)), 41)
        self.assertEqual(len(build_reader_config('mfdf', desfire_values(), KEK)), 41)

    def test_classic(self):
        blob = build_reader_config('mfcl', classic_values(), KEK)
        self.assertEqual(blob[0], 0x11)
        self.assertEqual(blob[1], 1)        # sector
        self.assertEqual(blob[2], 4)        # skip
        self.assertEqual(blob[3], 4)        # read
        # aid, key_no, key_type unused
        self.assertEqual(blob[4:9], bytes(5))
        # encrypted key field at the end
        self.assertEqual(blob[9:41], KEY_A_ENC)
        plain = decrypt_key_field(blob)
        self.assertEqual(plain[0:6], bytes.fromhex(KEY_A))
        self.assertEqual(plain[6:32], bytes(26))

    def test_desfire(self):
        blob = build_reader_config('mfdf', desfire_values(), KEK)
        self.assertEqual(blob[0], 0x12)
        self.assertEqual(blob[1], 1)        # file no
        self.assertEqual(blob[2], 0)        # skip
        self.assertEqual(blob[3], 4)        # read
        # AID little-endian
        self.assertEqual(blob[4:7], bytes([0x56, 0x34, 0x12]))
        self.assertEqual(blob[7], 1)        # key no
        self.assertEqual(blob[8], 2)        # AES
        self.assertEqual(blob[9:41], READ_KEY_ENC)
        plain = decrypt_key_field(blob)
        self.assertEqual(plain[0:16], bytes.fromhex(READ_KEY))
        self.assertEqual(plain[16:32], bytes(16))

    def test_key_never_in_plain(self):
        blob = build_reader_config('mfcl', classic_values(), KEK)
        self.assertNotIn(bytes.fromhex(KEY_A), blob)
        blob = build_reader_config('mfdf', desfire_values(), KEK)
        self.assertNotIn(bytes.fromhex(READ_KEY), blob)

    def test_encrypt_reader_key(self):
        self.assertEqual(encrypt_reader_key(bytes.fromhex(KEY_A), KEK), KEY_A_ENC)
        self.assertEqual(len(encrypt_reader_key(bytes(24), KEK)), 32)
        with self.assertRaises(frappe.ValidationError):
            encrypt_reader_key(bytes(6), bytes(15))
        with self.assertRaises(frappe.ValidationError):
            encrypt_reader_key(bytes(6), None)
        with self.assertRaises(frappe.ValidationError):
            encrypt_reader_key(bytes(33), KEK)

    def test_get_reader_kek(self):
        old = frappe.conf.get(READER_KEK_CONF)
        try:
            frappe.conf[READER_KEK_CONF] = KEK.hex()
            self.assertEqual(get_reader_kek(), KEK)
            frappe.conf[READER_KEK_CONF] = "0011"
            with self.assertRaises(frappe.ValidationError):
                get_reader_kek()
            frappe.conf[READER_KEK_CONF] = "zz" * 16
            with self.assertRaises(frappe.ValidationError):
                get_reader_kek()
            frappe.conf[READER_KEK_CONF] = None
            with self.assertRaises(frappe.ValidationError):
                get_reader_kek()
        finally:
            frappe.conf[READER_KEK_CONF] = old

    def test_configs_both(self):
        values = classic_values()
        values.update(desfire_values())
        values['mfcl'] = 1
        values['mfdf'] = 1
        blobs = build_reader_configs(values, KEK)
        self.assertEqual(set(blobs.keys()), {'mfcl', 'mfdf'})
        self.assertEqual(blobs['mfcl'][0], 0x11)
        self.assertEqual(blobs['mfdf'][0], 0x12)

    def test_configs_single(self):
        self.assertEqual(list(build_reader_configs(classic_values(), KEK).keys()), ['mfcl'])
        self.assertEqual(list(build_reader_configs(desfire_values(), KEK).keys()), ['mfdf'])

    def test_hex_output(self):
        blob = build_reader_config('mfdf', desfire_values(), KEK)
        hex_str = reader_config_to_hex(blob)
        self.assertEqual(len(hex_str), 82)
        self.assertEqual(hex_str, hex_str.upper())
        self.assertEqual(bytes.fromhex(hex_str), blob)

    def test_no_technology(self):
        with self.assertRaises(frappe.ValidationError):
            build_reader_configs({'mfcl': 0, 'mfdf': 0}, KEK)

    def test_unknown_technology(self):
        with self.assertRaises(frappe.ValidationError):
            build_reader_config('legic', classic_values(), KEK)

    def test_invalid_key_length(self):
        values = classic_values()
        values['key_a'] = "0102"
        with self.assertRaises(frappe.ValidationError):
            build_reader_config('mfcl', values, KEK)
        values = desfire_values()
        values['app_read_key'] = "00"
        with self.assertRaises(frappe.ValidationError):
            build_reader_config('mfdf', values, KEK)

    def test_missing_key(self):
        values = classic_values()
        values['key_a'] = None
        with self.assertRaises(frappe.ValidationError):
            build_reader_config('mfcl', values, KEK)

    def test_invalid_app_id(self):
        values = desfire_values()
        values['app_id'] = 0
        with self.assertRaises(frappe.ValidationError):
            build_reader_config('mfdf', values, KEK)
        values['app_id'] = 0x1000000
        with self.assertRaises(frappe.ValidationError):
            build_reader_config('mfdf', values, KEK)

    def test_classic_range(self):
        values = classic_values()
        values['skip_bytes'] = 46
        values['read_bytes'] = 4
        with self.assertRaises(frappe.ValidationError):
            build_reader_config('mfcl', values, KEK)
        values['sector'] = 40
        values['skip_bytes'] = 0
        with self.assertRaises(frappe.ValidationError):
            build_reader_config('mfcl', values, KEK)
