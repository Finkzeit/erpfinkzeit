# -*- coding: utf-8 -*-
# Copyright (c) 2018, Fink Zeitsysteme/libracore and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe.model.document import Document
from frappe.utils.background_jobs import enqueue

class Licence(Document):
    pass

# function to create invoices based on licences
@frappe.whitelist()
def enqueue_invoice_cycle():
    # enqueue invoice creation (potential high workload)
    kwargs={
        }
        
    enqueue("finkzeit.finkzeit.doctype.licence.licence.create_invoices",
        queue='long',
        timeout=15000,
        **kwargs)
    frappe.msgprint( _("Queued for syncing. It may take a few minutes to an hour."))
    return

def create_invoices():
    # create invoices
    enabled_licences = frappe.get_all('Licence', filters={'enabled': 1}, fields=['name'])
    # loop through enabled licences
    for licence in enabled_licences:
        create_invoice(licence['name'])
    return

def process_licence(licence_name):
    licence = frappe.get_doc('Licence', licence_name)
    
    items = []
    if licence.invoice_separately:
        for item in licence.invoice_items
            items.append(get_item(item)
        create_invoice(licence.customer, items, licence.overall_discount)
        items = []
        for item in licence.special_invoice_items
            items.append(get_item(item)
        create_invoice(licence.customer, items, licence.overall_discount)
    else:
        for item in licence.invoice_items
            items.append(get_item(item)
        for item in licence.special_invoice_items
            items.append(get_item(item)
        create_invoice(licence.customer, items, licence.overall_discount)
    return

# parse to sales invoice item structure    
def get_item(licence_item):
    return {
        'item_code': licence_item.item_code,
        'rate': licence_item.rate,
        'qty': licence_item.qty,
        'discount_precentage': licence_item.discount
    }

def create_invoice(customer, items, overall_discount):
    new_sales_invoice = frappe.get_doc({
        'doctype': 'Sales Invoice',
        'customer': licence.customer,
        'items': items,
        'additional_discount_percentage': overall_discount
    }
    new_record = mew_sales_invoice.insert()
    return new_record.name
