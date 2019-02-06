# -*- coding: utf-8 -*-
# Copyright (c) 2018-2019, Fink Zeitsysteme/libracore and contributors
# For license information, please see license.txt
#

# imports
from __future__ import unicode_literals
import frappe
from frappe import _
from frappe.utils.background_jobs import enqueue
from datetime import datetime

@frappe.whitelist()
def enqueue_create_export(customer):
    # enqueue export creation (potential high workload)
    kwargs={
        'customer': customer
    }

    enqueue("finkzeit.finkzeit.softcard.create_export",
        queue='long',
        timeout=15000,
        **kwargs)
    return
    
def create_export(customer):
    # check if there are any 
    sql_query = """SELECT `name`, `outstanding_amount` 
        FROM `tabSales Invoice`
        WHERE `customer` = '{customer}'
          AND `outstanding_amount` != 0
          AND `is_proposed` = 0
       """.format(customer=customer)
    pending_invoices = frappe.db.sql(sql_query, as_dict=True)
    if pending_invoices:
        # list all invoices
        invoices = {}
        for invoice in pending_invoices:
            invoices.append({
                'sales_invoice': invoice['name'],
                'amount': invoice['outstanding_amount']
            })
        # create a new SoftCard File
        softcard_file = frappe.get_doc({
            'doctype': 'SoftCard File',
            'title': "{0} {1}".format(customer, datetime.now()),
            'sales_invoices': invoices
        })
        softcard_file.insert()
        frappe.db.commit()
        frappe.show_alert( _("Created a file with {0} invoices.").format(len(pending_invoices)) )
    else:
        frappe.show_alert( _("No pending invoices found.") )
    return
