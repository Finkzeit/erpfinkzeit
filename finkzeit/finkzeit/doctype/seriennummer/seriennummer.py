# -*- coding: utf-8 -*-
# Copyright (c) 2018, Fink Zeitsysteme/libracore and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe.model.document import Document
import re

class Seriennummer(Document):
    def get_next_kassa_number(self, start_value=1):
        #This function is used to automatically create a new item code that is 1 higher than the last one created.
        
        #get last created Item Code
        last_item_code = frappe.db.sql("SELECT MAX(`kassa_nr`) AS `nr` FROM `tabSeriennummer`", as_dict=True)

        #Check if already an item exist
        if last_item_code:
            return last_item_code[0]["nr"] + 1
            
        #if its the first item, return start value
        return start_value
    
    pass
