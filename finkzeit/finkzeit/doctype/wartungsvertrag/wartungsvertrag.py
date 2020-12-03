# -*- coding: utf-8 -*-
# Copyright (c) 2019-2020, Fink Zeitsysteme/libracore and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe.model.document import Document
from frappe import _

class Wartungsvertrag(Document):
    pass

@frappe.whitelist()
def create_support_contract_invoices(increase_percentage):
    applicable_contracts = frappe.get_all("Wartungsvertrag", filters={'status': 'Active'}, fields=['name'])
    settings = frappe.get_doc("Finkzeit Settings", "Finkzeit Settings")
    if not settings.default_increase_text or not settings.contract_item:
        frappe.throw( _("Please configure the contract creation under Finkzeit Settings") )
    increase_percentage = float(increase_percentage)
    # loop through all invoices
    for contract in applicable_contracts:
        # get old amount
        contract_data = frappe.get_doc("Wartungsvertrag", contract['name'])
        if contract_data.invoices and len(contract_data.invoices) > 0:
            net_amount = ((100 + increase_percentage) / 100) * contract_data.invoices[-1].amount
        customer = contract_data.customer
        remarks = settings.default_increase_text.format(increase_percentage)
        # create new invoice
        sinv = frappe.get_doc({
            'doctype': "Sales Invoice",
            'customer': customer,
            'eingangstext': remarks,
            'ignore_pricing_rule': 1
        })
        sinv.append('items', {
            'item_code': settings.contract_item,
            'qty': 1,
            'rate': net_amount,
            'conversion_factor': 1
        })
        sinv.insert()
        # link new invoice into contract
        contract_data.append('invoices', {
            'sales_invoice': sinv.name
        })
        contract_data.save()
        frappe.db.commit()
    return
