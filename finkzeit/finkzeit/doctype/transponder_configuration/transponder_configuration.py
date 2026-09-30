# -*- coding: utf-8 -*-
# Copyright (c) 2023-2025, Fink Zeitsysteme/libracore and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe.model.document import Document
from random import choice
from frappe.utils.password import get_decrypted_password
from frappe.utils import cint
from frappe import _
import struct
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

class TransponderConfiguration(Document):
    # create each key if not already set
    def create_keys(self):
        if not self.project_pw:
            self.project_pw = get_hex_token(12)
        if not self.wavenet_pw:
            self.wavenet_pw = get_hex_token(12)
        if not self.lock_pw:
            self.lock_pw = get_hex_token(12)
        if not self.key_a:
            self.key_a = get_hex_token(12)
        if not self.key_b:
            self.key_b = get_hex_token(12)
        if not self.master_key:
            self.master_key = get_hex_token(32)
        if not self.app_master_key:
            self.app_master_key = get_hex_token(32)
        if not self.app_read_key:
            self.app_read_key = get_hex_token(32)
            
        return
        
    # decrypt and copy key
    def copy_key(self, key):
        password = get_decrypted_password(self.doctype, self.name, key, False)
        return password

    # build the reader configurations (security blobs for RFID readers) as hex strings
    # returns a dict {'mfcl': hex, 'mfdf': hex} with one entry per enabled technology
    # the key field is AES encrypted with the KEK from site_config.json (reader_config_kek)
    @frappe.whitelist()
    def get_reader_config(self):
        if self.is_new():
            frappe.throw(_("Please save the configuration first"))
        values = {
            'mfcl': self.mfcl,
            'mfdf': self.mfdf,
            'sector': self.sector,
            'skip_bytes': self.skip_bytes,
            'read_bytes': self.read_bytes,
            'key_a': get_decrypted_password(self.doctype, self.name, "key_a", False) if self.mfcl else None,
            'app_id': self.app_id,
            'file_byte': self.file_byte,
            'app_read_key': get_decrypted_password(self.doctype, self.name, "app_read_key", False) if self.mfdf else None
        }
        blobs = build_reader_configs(values, get_reader_kek())
        return {tech: reader_config_to_hex(blob) for tech, blob in blobs.items()}
        
    def before_save(self):
        if len(self.customers) > 0:
            self.customer = self.customers[0].customer
            self.customer_name = self.customers[0].customer_name
            self.licence = self.customers[0].licence
            self.licence_name = self.customers[0].licence_name
        return

    def validate(self):
        self.validate_unique_customer()
        return

    def validate_unique_customer(self):
        if self.customers:
            for customer in self.customers:
                other_transponder_configurations = frappe.db.sql("""
                        SELECT `parent`
                        FROM `tabTransponder Configuration Customer`
                        WHERE `customer` = %(customer)s
                        AND `parent` != %(trspcnf)s
                        ;
                    """,
                    {'customer': customer.customer, 'trspcnf': self.name},
                    as_dict=True
                )
                if len(other_transponder_configurations) > 0:
                    frappe.throw( _("The customer {0} is already linked to transponder configuration {1}.").format(customer.customer, other_transponder_configurations[0]['parent']))
        return

    """
    Find the licence for a specific customer inside this config
    """
    def get_licence(self, customer):
        if self.customers:
            for c in self.customers:
                if  c.customer == customer and c.licence:
                    return c.licence
        return self.licence

def get_hex_token(n):
    hex_string = "0123456789abcdef"
    token = "".join([choice(hex_string) for x in range(n)])
    return token

"""
Reader configuration (security blob for RFID readers)

One fixed 41 byte structure per technology (MIFARE Classic / MIFARE DESFire),
the key field is AES-128-CBC encrypted (IV = 0) with a global key encryption key (KEK)
from site_config.json (reader_config_kek, 32 hex characters).
See reader_config_format.md next to this file.
"""
READER_CONFIG_VERSION = 1
READER_TECH_MFCL = 0x01
READER_TECH_MFDF = 0x02
READER_KEY_SIZE = 32            # key field (plain): left aligned, zero padded (6 byte Classic, 16/24 byte DESFire)
READER_KEK_SIZE = 16            # AES-128
READER_IV = bytes(16)           # fixed IV, known on both sides
READER_KEK_CONF = "reader_config_kek"
MFDF_SKIP_BYTES = 0             # offset of the number within the DESFire file (KeyCreator writes at 0)
MFDF_READ_BYTES = 4             # length of the number in the DESFire file (KeyCreator writes 4 bytes)
MFDF_KEY_NO = 1                 # application key used for reading (app_read_key)
MFDF_KEY_TYPE_AES = 2           # DESF.KEYTYPE_AES in KeyCreator
READER_CONFIG_STRUCT = "<BBBB3sBB32s"   # little-endian, 41 bytes
READER_CONFIG_SIZE = struct.calcsize(READER_CONFIG_STRUCT)

def _parse_hex_key(value, hex_len, label):
    value = (value or "").strip()
    if not value:
        frappe.throw(_("{0} is not set. Please create the keys first.").format(label))
    try:
        key = bytes.fromhex(value)
    except ValueError:
        key = None
    if key is None or len(value) != hex_len:
        frappe.throw(_("{0} must be exactly {1} hex characters").format(label, hex_len))
    return key

def _check_range(value, low, high, label):
    value = cint(value)
    if value < low or value > high:
        frappe.throw(_("{0} must be between {1} and {2}").format(label, low, high))
    return value

"""
Read the key encryption key from site_config.json
Returns 16 bytes
"""
def get_reader_kek():
    kek_hex = frappe.conf.get(READER_KEK_CONF)
    if not kek_hex:
        frappe.throw(_("{0} is not configured in site_config.json").format(READER_KEK_CONF))
    try:
        kek = bytes.fromhex(kek_hex)
    except ValueError:
        kek = None
    if kek is None or len(kek) != READER_KEK_SIZE:
        frappe.throw(_("{0} in site_config.json must be exactly {1} hex characters").format(READER_KEK_CONF, 2 * READER_KEK_SIZE))
    return kek

"""
Encrypt the key field: pad the key with zeros to READER_KEY_SIZE and
encrypt with AES-128-CBC, IV = 0 (no PKCS#7, the key length follows from the key type)
Returns READER_KEY_SIZE bytes
"""
def encrypt_reader_key(key, kek):
    if not kek or len(kek) != READER_KEK_SIZE:
        frappe.throw(_("Key encryption key must be exactly {0} bytes").format(READER_KEK_SIZE))
    if len(key) > READER_KEY_SIZE:
        frappe.throw(_("Key exceeds {0} bytes").format(READER_KEY_SIZE))
    plain = key + bytes(READER_KEY_SIZE - len(key))
    encryptor = Cipher(algorithms.AES(kek), modes.CBC(READER_IV)).encryptor()
    return encryptor.update(plain) + encryptor.finalize()

"""
Build the binary reader configuration for one technology from plain values
-tech:   'mfcl' or 'mfdf'
-values: dict with sector, skip_bytes, read_bytes, key_a (12 hex) for mfcl,
         app_id, file_byte, app_read_key (32 hex) for mfdf
-kek:    16 byte key encryption key
Returns bytes (READER_CONFIG_SIZE)
"""
def build_reader_config(tech, values, kek):
    if tech == 'mfcl':
        version_flags = (READER_CONFIG_VERSION << 4) | READER_TECH_MFCL
        block = _check_range(values.get('sector'), 0, 39, _("Sector"))
        skip_bytes = _check_range(values.get('skip_bytes'), 0, 47, _("Skip bytes"))
        read_bytes = _check_range(values.get('read_bytes'), 1, 4, _("Read bytes"))
        if skip_bytes + read_bytes > 48:
            frappe.throw(_("Skip bytes plus read bytes must not exceed 48"))
        key = _parse_hex_key(values.get('key_a'), 12, _("Key A"))
        aid = bytes(3)
        key_no = 0
        key_type = 0
    elif tech == 'mfdf':
        version_flags = (READER_CONFIG_VERSION << 4) | READER_TECH_MFDF
        block = _check_range(values.get('file_byte'), 0, 31, _("File"))
        skip_bytes = MFDF_SKIP_BYTES
        read_bytes = MFDF_READ_BYTES
        key = _parse_hex_key(values.get('app_read_key'), 32, _("App Read Key"))
        app_id = _check_range(values.get('app_id'), 1, 0xFFFFFF, _("App ID"))
        aid = app_id.to_bytes(3, 'little')
        key_no = MFDF_KEY_NO
        key_type = MFDF_KEY_TYPE_AES
    else:
        frappe.throw(_("Unknown technology {0}").format(tech))

    return struct.pack(READER_CONFIG_STRUCT,
        version_flags, block, skip_bytes, read_bytes,
        aid, key_no, key_type,
        encrypt_reader_key(key, kek))

"""
Build the reader configurations for all enabled technologies
-values: dict with mfcl, mfdf plus the values listed in build_reader_config
-kek:    16 byte key encryption key
Returns dict {'mfcl': bytes, 'mfdf': bytes} (only enabled technologies)
"""
def build_reader_configs(values, kek):
    blobs = {}
    if values.get('mfcl'):
        blobs['mfcl'] = build_reader_config('mfcl', values, kek)
    if values.get('mfdf'):
        blobs['mfdf'] = build_reader_config('mfdf', values, kek)
    if not blobs:
        frappe.throw(_("No MIFARE technology enabled"))
    return blobs

def reader_config_to_hex(blob):
    return blob.hex().upper()

"""
API
"""

"""
Get configurations
Provide either
-s: search string to find in customer, customer_name or licence
-customer: customer number
-customer_name: part of customer name
-licence: part of licence title
Returns a list of configurations

 /api/method/finkzeit.finkzeit.doctype.transponder_configuration.transponder_configuration.get_transponder_config_list?s=test
"""
@frappe.whitelist()
def get_transponder_config_list(s=None, customer=None, customer_name=None, licence=None):
    if s:
        query_string = """
            SELECT `parent` AS `name`, `customer`, `customer_name`, `licence_name`
            FROM `tabTransponder Configuration Customer`
            WHERE
                `customer` LIKE "%{s}%"
                OR `customer_name` LIKE "%{s}%"
                OR `licence_name` LIKE "%{s}%";
        """.format(s=s)
    elif customer:
        query_string = """
            SELECT `parent` AS `name`, `customer`, `customer_name`, `licence_name`
            FROM `tabTransponder Configuration Customer`
            WHERE
                `customer` LIKE "%{s}%";
        """.format(s=customer)
    elif customer_name:
        query_string = """
            SELECT `parent` AS `name`, `customer`, `customer_name`, `licence_name`
            FROM `tabTransponder Configuration Customer`
            WHERE
                `customer_name` LIKE "%{s}%";
        """.format(s=customer_name)
    elif licence:
        query_string = """
            SELECT `parent` AS `name`, `customer`, `customer_name`, `licence_name`
            FROM `tabTransponder Configuration Customer`
            WHERE
                `licence_name` LIKE "%{s}%";
        """.format(s=licence)
    else:
        query_string = """
            SELECT `parent` AS `name`, `customer`, `customer_name`, `licence_name`
            FROM `tabTransponder Configuration Customer`
            ;
        """
    data = frappe.db.sql(query_string, as_dict=True)
    
    return data

"""
Get a configuration file

 /api/method/finkzeit.finkzeit.doctype.transponder_configuration.transponder_configuration.get_transponder_config?config=TK-00001
"""
@frappe.whitelist()
def get_transponder_config(config=None, customer=None):
    if config and frappe.db.exists("Transponder Configuration", config):
        doc = frappe.get_doc("Transponder Configuration", config)
    elif customer:
        doc_id = frappe.db.sql("""
            SELECT `parent`
                FROM `tabTransponder Configuration Customer`
                WHERE `customer` = %(customer)s
                ;
            """,
            {'customer': customer},
            as_dict=True
        )
        if len(doc_id) > 0:
            doc = frappe.get_doc("Transponder Configuration", doc_id[0]['parent'])
        else:
            return "No transponder configuration found for customer"
    else:
        return "Missing parameters or not found"

    # expand passwords
    doc.project_pw = get_decrypted_password("Transponder Configuration", doc.name, "project_pw", False)
    doc.wavenet_pw = get_decrypted_password("Transponder Configuration", doc.name, "wavenet_pw", False)
    doc.lock_pw = get_decrypted_password("Transponder Configuration", doc.name, "lock_pw", False)
    doc.key_a = get_decrypted_password("Transponder Configuration", doc.name, "key_a", False)
    doc.key_b = get_decrypted_password("Transponder Configuration", doc.name, "key_b", False)
    doc.master_key = get_decrypted_password("Transponder Configuration", doc.name, "master_key", False)
    doc.app_master_key = get_decrypted_password("Transponder Configuration", doc.name, "app_master_key", False)
    doc.app_read_key = get_decrypted_password("Transponder Configuration", doc.name, "app_read_key", False)

    return doc
        
"""
Create a new transponder record

Provide details as
-config:    Transponder Config name (TK-00001)
-customer:  Customer code (K-12345) (alternative instead of the config parameter)
-code:      Transponder Code (123456)
-hitag_uid: HITAG UID (optional)
-mfcl_uid:  MIFARE Classic UID (optional)
-mfdf_uid:  MIFARE DESFire UID (optional)
-legic_uid: LEGIC UID (optional)
-deister_uid:   Deister UID (optional)
-em_uid:    EM UID (optional)

 /api/method/finkzeit.finkzeit.doctype.transponder_configuration.transponder_configuration.create_transponder?config=TK-00001&code=123456
 /api/method/finkzeit.finkzeit.doctype.transponder_configuration.transponder_configuration.create_transponder?customer=K-12345&code=123456
"""
@frappe.whitelist()
def create_transponder(code, config=None, customer=None, hitag_uid=None, mfcl_uid=None, mfdf_uid=None, legic_uid=None, deister_uid=None, em_uid=None, test_key=0):
    licence = None
    if not customer and not config:
        return "Please provide either a customer (customer) or a transponder configuration (config)"
    if not config and customer:
        config_doc = get_transponder_config(customer=customer)
        if type(config_doc) == str:
            return config_doc           # failed to get a transponder configuration, pass on error
        else:
            config = config_doc.name
        # prepare correct licence
        licence = config_doc.get_licence(customer)

    if frappe.db.exists("Transponder Configuration", config):
        conf = frappe.get_doc("Transponder Configuration", config)
        if not frappe.db.exists("Transponder", code):
            new_transponder = frappe.get_doc({
                'doctype': 'Transponder',
                'transponder_configuration': config,
                'code': code,
                'hitag_uid': hitag_uid,
                'mfcl_uid': mfcl_uid,
                'mfdf_uid': mfdf_uid,
                'legic_uid': legic_uid,
                'deister_uid': deister_uid,
                'em_uid': em_uid,
                'test_key': 1 if test_key else 0,
                'customer': customer if customer else conf.customer,
                'licence': licence if licence else conf.licence
            })
            new_transponder.insert(ignore_permissions=True)
            frappe.db.commit()
            return new_transponder.name
        else:
            # update is not a use case
            return "This transponder already exists"
    else:
        return "Configuration not found"

"""
Get a transponder
Provide exactly one of them
-hitag_uid:
-mfcl_uid:
-mfdf_uid:
-deister_uid:
-em_uid:

 /api/method/finkzeit.finkzeit.doctype.transponder_configuration.transponder_configuration.get_transponder?<XXXX>_uid=<HEX>
"""
@frappe.whitelist()
def get_transponder(hitag_uid=None, mfcl_uid=None, mfdf_uid=None, deister_uid=None, em_uid=None):
    if hitag_uid:
        query_string = """SELECT * FROM `tabTransponder` WHERE `hitag_uid` = "{}";""".format(hitag_uid)
    elif mfcl_uid:
        query_string = """SELECT * FROM `tabTransponder` WHERE `mfcl_uid` = "{}";""".format(mfcl_uid)
    elif mfdf_uid:
        query_string = """SELECT * FROM `tabTransponder` WHERE `mfdf_uid` = "{}";""".format(mfdf_uid)
    elif deister_uid:
        query_string = """SELECT * FROM `tabTransponder` WHERE `deister_uid` = "{}";""".format(deister_uid)
    elif em_uid:
        query_string = """SELECT * FROM `tabTransponder` WHERE `em_uid` = "{}";""".format(em_uid)
    else:
        return """{"message":[]}"""

    data = frappe.db.sql(query_string, as_dict=True)
    
    return data

"""
Delete a transponder
Provide exactly one of them
-code:

 /api/method/finkzeit.finkzeit.doctype.transponder_configuration.transponder_configuration.del_transponder?code=<CODE>
"""
@frappe.whitelist()
def del_transponder(code):
    try:
        transponder = frappe.get_doc("Transponder", code)
        transponder.delete()
        frappe.db.commit()
        return {'success': True, 'error': None}
    except Exception as err:
        frappe.log_error( "{0}".format(err), "Delete transponder through API failed")
        return {'success': False, 'error': err}
    
