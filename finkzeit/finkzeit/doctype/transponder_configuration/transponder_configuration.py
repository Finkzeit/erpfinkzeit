# -*- coding: utf-8 -*-
# Copyright (c) 2023-2025, Fink Zeitsysteme/libracore and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe.model.document import Document
from random import choice
from frappe.utils.password import get_decrypted_password
from frappe import _

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
        
    def before_save(self):
        if len(self.customers) > 0:
            self.customer = self.customers[0].customer
            self.customer_name = self.customers[0].customer_name
            self.licence = self.customers[0].licence
            self.licence_name = self.customers[0].licence_name
        return

    def validate(self):
        validate_unique_customer(self)
        return

    def validate_unique_customer(self):
        if self.customers:
            for customer in self.customers:
                other_transponder_configurations = frappe.db.sql("""
                        SELECT `parent`
                        FROM `tabTransponder Configuration Customer`
                        WHERE `customer` = %{customer}s
                        AND `parent` != %{trspcnf}s
                        ;
                    """,
                    {'customer': customer.customer, 'trspcnf': self.name},
                    as_dict=True
                )
                if len(other_transponder_configurations) > 0:
                    frappe.throw( _("The customer {0} is already linked to transponder configuration {1}.").format(customer.customer, other_transponder_configurations[0]['parent']))
        return

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
                WHERE `customer` = %{customer}s
                ;
            """,
            {'customer': customer.customer},
            as_dict=True
        )
        if len(doc_id) > 0:
            doc = frappe.get_doc("Transponder Configuration", doc_id[0]['parent'])
        else:
            return "No transponder configuration found for customer"
    else:
        return "Missing parameters or not found"

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
    if not customer and not config:
        return "Please provide either a customer (customer) or a transponder configuration (config)"
    if not config and customer:
        config_doc = get_transponder_config(customer)
        if type(config_doc) == str:
            return config_doc           # failed to get a transponder configuration, pass on error
        else:
            config = config_doc.name
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
                'test_key': 1 if test_key else 0
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
    
