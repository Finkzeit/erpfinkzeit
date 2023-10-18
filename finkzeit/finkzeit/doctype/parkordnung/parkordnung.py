# -*- coding: utf-8 -*-
# Copyright (c) 2019-2023, Fink Zeitsysteme/libracore and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe.model.document import Document

class Parkordnung(Document):
    def before_save(self):
        if not self.user:
            self.user_name = ""
        if not self.employee:
            self.employee_name = ""
        self.display_name = self.user_name or self.employee_name or ""
        
        return
