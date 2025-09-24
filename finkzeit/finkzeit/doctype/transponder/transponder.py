# -*- coding: utf-8 -*-
# Copyright (c) 2023, Fink Zeitsysteme/libracore and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe.model.document import Document

class Transponder(Document):
	def before_save(self):
		# if customer and/or licence are missing, try to load from transponder config
		if not self.customer or not self.licence and self.transponder_configuration:
			config = frappe.get_doc("Transponder Configuration", self.transponder_configuration)
			if not self.customer:
				self.customer = config.customer
			if not self.licence:
				self.licence = config.licence
		return
