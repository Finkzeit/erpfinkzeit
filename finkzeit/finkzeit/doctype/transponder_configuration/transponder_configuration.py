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
