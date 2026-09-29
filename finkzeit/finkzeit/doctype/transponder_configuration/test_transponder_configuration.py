# -*- coding: utf-8 -*-
# Copyright (c) 2023-2025, Fink Zeitsysteme/libracore and Contributors
# See license.txt
from __future__ import unicode_literals

import frappe
import unittest

from finkzeit.finkzeit.doctype.transponder_configuration.transponder_configuration import (
    build_reader_config, build_reader_configs, reader_config_to_hex, READER_CONFIG_SIZE)

KEY_A = "0102030405A6"
READ_KEY = "000102030405060708090A0B0C0D0E0F"

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

class TestTransponderConfiguration(unittest.TestCase):
    def test_size(self):
        self.assertEqual(READER_CONFIG_SIZE, 33)
        self.assertEqual(len(build_reader_config('mfcl', classic_values())), 33)
        self.assertEqual(len(build_reader_config('mfdf', desfire_values())), 33)

    def test_classic(self):
        blob = build_reader_config('mfcl', classic_values())
        self.assertEqual(blob[0], 0x11)
        self.assertEqual(blob[1], 1)        # sector
        self.assertEqual(blob[2], 4)        # skip
        self.assertEqual(blob[3], 4)        # read
        # key left aligned, zero padded to 24 bytes
        self.assertEqual(blob[4:10], bytes.fromhex(KEY_A))
        self.assertEqual(blob[10:28], bytes(18))
        # aid, key_no, key_type unused
        self.assertEqual(blob[28:33], bytes(5))

    def test_desfire(self):
        blob = build_reader_config('mfdf', desfire_values())
        self.assertEqual(blob[0], 0x12)
        self.assertEqual(blob[1], 1)        # file no
        self.assertEqual(blob[2], 0)        # skip
        self.assertEqual(blob[3], 4)        # read
        self.assertEqual(blob[4:20], bytes.fromhex(READ_KEY))
        self.assertEqual(blob[20:28], bytes(8))
        # AID little-endian
        self.assertEqual(blob[28:31], bytes([0x56, 0x34, 0x12]))
        self.assertEqual(blob[31], 1)       # key no
        self.assertEqual(blob[32], 2)       # AES

    def test_configs_both(self):
        values = classic_values()
        values.update(desfire_values())
        values['mfcl'] = 1
        values['mfdf'] = 1
        blobs = build_reader_configs(values)
        self.assertEqual(set(blobs.keys()), {'mfcl', 'mfdf'})
        self.assertEqual(blobs['mfcl'][0], 0x11)
        self.assertEqual(blobs['mfdf'][0], 0x12)

    def test_configs_single(self):
        self.assertEqual(list(build_reader_configs(classic_values()).keys()), ['mfcl'])
        self.assertEqual(list(build_reader_configs(desfire_values()).keys()), ['mfdf'])

    def test_hex_output(self):
        blob = build_reader_config('mfdf', desfire_values())
        hex_str = reader_config_to_hex(blob)
        self.assertEqual(len(hex_str), 66)
        self.assertEqual(hex_str, hex_str.upper())
        self.assertEqual(bytes.fromhex(hex_str), blob)

    def test_no_technology(self):
        with self.assertRaises(frappe.ValidationError):
            build_reader_configs({'mfcl': 0, 'mfdf': 0})

    def test_unknown_technology(self):
        with self.assertRaises(frappe.ValidationError):
            build_reader_config('legic', classic_values())

    def test_invalid_key_length(self):
        values = classic_values()
        values['key_a'] = "0102"
        with self.assertRaises(frappe.ValidationError):
            build_reader_config('mfcl', values)
        values = desfire_values()
        values['app_read_key'] = "00"
        with self.assertRaises(frappe.ValidationError):
            build_reader_config('mfdf', values)

    def test_missing_key(self):
        values = classic_values()
        values['key_a'] = None
        with self.assertRaises(frappe.ValidationError):
            build_reader_config('mfcl', values)

    def test_invalid_app_id(self):
        values = desfire_values()
        values['app_id'] = 0
        with self.assertRaises(frappe.ValidationError):
            build_reader_config('mfdf', values)
        values['app_id'] = 0x1000000
        with self.assertRaises(frappe.ValidationError):
            build_reader_config('mfdf', values)

    def test_classic_range(self):
        values = classic_values()
        values['skip_bytes'] = 46
        values['read_bytes'] = 4
        with self.assertRaises(frappe.ValidationError):
            build_reader_config('mfcl', values)
        values['sector'] = 40
        values['skip_bytes'] = 0
        with self.assertRaises(frappe.ValidationError):
            build_reader_config('mfcl', values)
