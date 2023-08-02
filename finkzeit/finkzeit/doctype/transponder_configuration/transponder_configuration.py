# -*- coding: utf-8 -*-
# Copyright (c) 2023, Fink Zeitsysteme/libracore and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe.model.document import Document
from random import choice
from frappe.utils.password import get_decrypted_password

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

def get_hex_token(n):
    hex_string = "0123456789abcdef"
    token = "".join([choice(hex_string) for x in range(n)])
    return token

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

 /api/method/finkzeit.finkzeit.doctype.transponder_config.transponder_config.get_transponder_config_list?s=test
"""
@frappe.whitelist()
def get_transponder_config_list(s=None, customer=None, customer_name=None, licence=None):
    if s:
        query_string = """
            SELECT `name`, `customer`, `customer_name`, `licence_name`
            FROM `tabTransponder Configuration`
            WHERE
                `customer` LIKE "%{s}%"
                OR `customer_name` LIKE "%{s}%"
                OR `licence_name` LIKE "%{s}%";
        """.format(s=s)
    elif customer:
        query_string = """
            SELECT `name`, `customer`, `customer_name`, `licence_name`
            FROM `tabTransponder Configuration`
            WHERE
                `customer` LIKE "%{s}%";
        """.format(s=customer)
    elif customer_name:
        query_string = """
            SELECT `name`, `customer`, `customer_name`, `licence_name`
            FROM `tabTransponder Configuration`
            WHERE
                `customer_name` LIKE "%{s}%";
        """.format(s=customer_name)
    elif licence:
        query_string = """
            SELECT `name`, `customer`, `customer_name`, `licence_name`
            FROM `tabTransponder Configuration`
            WHERE
                `licence_name` LIKE "%{s}%";
        """.format(s=licence)
    else:
        query_string = """
            SELECT `name`, `customer`, `customer_name`, `licence`
            FROM `tabTransponder Configuration`
            ;
        """
    data = frappe.db.sql(query_string, as_dict=True)
    
    return data

"""
Get a configuration file

 /api/method/finkzeit.finkzeit.doctype.transponder_config.transponder_config.get_transponder_config?config=TK-00001
"""
@frappe.whitelist()
def get_transponder_config(config):
    if frappe.db.exists("Transponder Configuration", config):
        doc = frappe.get_doc("Transponder Configuration", config)
        # expand passwords
        doc.project_pw = get_decrypted_password("Transponder Configuration", config, "project_pw", False)
        doc.wavenet_pw = get_decrypted_password("Transponder Configuration", config, "wavenet_pw", False)
        doc.lock_pw = get_decrypted_password("Transponder Configuration", config, "lock_pw", False)
        doc.key_a = get_decrypted_password("Transponder Configuration", config, "key_a", False)
        doc.key_b = get_decrypted_password("Transponder Configuration", config, "key_b", False)
        doc.master_key = get_decrypted_password("Transponder Configuration", config, "master_key", False)
        doc.app_master_key = get_decrypted_password("Transponder Configuration", config, "app_master_key", False)
        doc.app_read_key = get_decrypted_password("Transponder Configuration", config, "app_read_key", False)

        return doc
    else:
        return "Not found"
        
"""
Create a new transponder record

Provide details as
-config:    Transponder Config name (TK-00001)
-code:      Transponder Code (123456)
-hitag_uid: HITAG UID (optional)
-mfcl_uid:  MIFARE Classic UID (optional)
-mfdf_uid:  MIFARE DESFire UID (optional)
-legic_uid: LEGIC UID (optional)
-deister_uid:   Deister UID (optional)
-em_uid:    EM UID (optional)

 /api/method/finkzeit.finkzeit.doctype.transponder_config.transponder_config.create_transponder?config=TK-00001&code=123456
"""
@frappe.whitelist()
def create_transponder(config, code, hitag_uid=None, mfcl_uid=None, mfdf_uid=None, legic_uid=None, deister_uid=None, em_uid=None):
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
                'em_uid': em_uid
            })
            new_transponder.insert(ignore_permissions=True)
            frappe.db.commit()
            return new_transponder.name
        else:
            # update is not a use case
            return "This transponder already exists"
    else:
        return "Configuration not found"
