# -*- coding: utf-8 -*-
# Copyright (c) 2018-2024, Fink Zeitsysteme/libracore and contributors
# For license information, please see license.txt
#

# imports
from __future__ import unicode_literals
import frappe
from frappe import _
from datetime import datetime
from frappe.utils.background_jobs import enqueue
import requests
import json
from erpnextswiss.erpnextswiss.page.bank_wizard.bank_wizard import get_default_supplier

# this is a public API to post sales invoices (to be received as purchase invoices)
@frappe.whitelist(allow_guest=True)
def post_invoice(**kwargs):
    result = "{0}".format(kwargs)
    if type(kwargs['data']) == dict:
        invoice = kwargs['data']
    else:
        invoice = json.loads(kwargs['data'])
    #frappe.log_error("Invoice: {0}".format(invoice), "API")
    supplier = frappe.get_all("Supplier", filters=[['supplier_name', 'LIKE', invoice['company']]], fields=['name'])
    if not supplier:
        # fallback to default supplier
        supplier = get_default_supplier()
    else:
        supplier = supplier[0]['name']
    supplier_record = frappe.get_doc("Supplier", supplier)
    if "011" in invoice['taxes_and_charges']:
        #frappe.log_error("rewrite tax codes", "API")
        # rewrite tax codes export/material (011) --> (000) no tax
        no_tax_template = frappe.get_all("Purchase Taxes and Charges Template", filters=[['name', 'LIKE', '%000%']], fields=['name'])
        tax_template_name = no_tax_template[0]['name']
    else:
        tax_template_name = supplier_record.default_purchase_tax_template
    taxes_and_charges = frappe.get_doc("Purchase Taxes and Charges Template", tax_template_name)
    taxes = []
    for tax in taxes_and_charges.taxes:
        taxes.append(tax)
    pinv = frappe.get_doc({
        'doctype': 'Purchase Invoice',
        'supplier': supplier,
        'items': invoice['items'],
        'posting_date': invoice['posting_date'],
        'due_date': invoice['due_date'],
        'bill_no': invoice['name'],
        'bill_date': invoice['posting_date'],
        'terms': invoice['terms'],
        'currency': invoice['currency'],
        'taxes_and_charges': tax_template_name,
        'taxes': taxes,
        'apply_discount_on': invoice['apply_discount_on'],
        'additional_discount_percentage': invoice['additional_discount_percentage'],
        'discount_amount': invoice['discount_amount'],
        'payment_terms_template': supplier_record.payment_terms,
        'is_proposed': 1,
        'update_stock': 1
    })
    try:
        # assert that all items exist
        for item in invoice['items']:
            # assert that item group exists
            if not frappe.db.exists("Item Group", item['item_group']):
                new_item_group = frappe.get_doc({
                    'doctype': 'Item Group',
                    'item_group_name': item['item_group'],
                    'parent_item_group': 'Alle Artikelgruppen'
                })
                new_item_group.insert(ignore_permissions=True)
            if not frappe.db.exists("Item", item['item_code']):
                new_item = frappe.get_doc({
                    'doctype': 'Item',
                    'item_code': item['item_code'],
                    'item_name': item['item_name'],
                    'description': item['description'],
                    'item_group': item['item_group'],
                    'is_stock_item': 0,
                    'disabled': 0
                })
                new_item.insert(ignore_permissions=True)
        # insert purchase invoice
        new_pinv = pinv.insert(ignore_permissions=True)
        #frappe.log_error("pinv {1} for {0} created".format(invoice['name'], new_pinv.name), "debug pinv import")
        if new_pinv.grand_total == invoice['grand_total']:
            # grand total matches, auto submit
            new_pinv.submit()
        frappe.db.commit()
    except Exception as err:
        frappe.log_error("Unable to insert {0}: {1}".format(invoice['name'], err), "ERPNext PINV API insert error" )
    return result

def send_invoice(host, sales_invoice, no_description=False):
    sinv = frappe.get_doc("Sales Invoice", sales_invoice)
    items = []
    for item in sinv.items:
        items.append({
            'item_code': item.item_code,
            'item_name': item.item_name,
            'description': item.description if not no_description else "-",
            'item_group': item.item_group,
            'qty': item.qty,
            'rate': item.rate
        })

    data = {
        'items': items, 
        'posting_date': "{0}".format(sinv.posting_date),
        'due_date': "{0}".format(sinv.due_date),
        'terms': (sinv.eingangstext or "") + "<br>" + (sinv.terms or ""),
        'grand_total': sinv.grand_total,
        'company': sinv.company,
        'name': sinv.name,
        'currency': sinv.currency,
        'apply_discount_on': sinv.apply_discount_on,
        'additional_discount_percentage': sinv.additional_discount_percentage,
        'discount_amount': sinv.discount_amount,
        'taxes_and_charges': sinv.taxes_and_charges
    }
    # convert data to string for transmission
    text = json.dumps(data)
    payload = {'data': text}
    r = requests.get("{host}/api/method/finkzeit.finkzeit.erpnext.post_invoice".format(host=host), json=payload)
    if r.status_code == requests.codes.ok:
        try:
            sql_query = """UPDATE `tabSales Invoice` SET `is_proposed` = 1 WHERE `name` = '{name}';""".format(name=sales_invoice)
            frappe.db.sql(sql_query)
            frappe.db.commit()
        except Exception as err:
            frappe.log_error( "Unable to mark invoice {0} as sent: {1}".format(sales_invoice, err), "erpnext send_invoice" )
    else:
        if r.status_code == 400 and not no_description:
            # try without description (sometimes, the description content leads to issues in deciding)
            send_invoice(host, sales_invoice, no_description=True)
        else:
            frappe.log_error( "An error occured when sending invoice {0} to {1}: {2}".format(sales_invoice, host, r.status_code), "erpnext send_invoice" )
    return

# function to send invoices to an ERPNext customer
@frappe.whitelist()
def enqueue_send_invoices(customer, host):
    # enqueue invoice creation (potential high workload)
    kwargs={
        'customer': customer,
        'host': host
    }

    enqueue("finkzeit.finkzeit.erpnext.send_invoices",
        queue='long',
        timeout=15000,
        **kwargs)
    return

def send_invoices(customer, host):
    open_invoices = frappe.get_all("Sales Invoice",
        filters=[
            ['customer', '=', customer],
            ['docstatus', '=', 1], 
            ['outstanding_amount', '>', 0],
            ['is_proposed', '=', 0]
        ], fields=['name'])
    if open_invoices:
        for invoice in open_invoices:
            send_invoice(host, invoice['name'])
    return

