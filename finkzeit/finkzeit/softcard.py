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
from finkzeit.finkzeit.doctype.licence.licence import make_line

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
    sql_query = """SELECT `name`, `grand_total`, `outstanding_amount` 
        FROM `tabSales Invoice`
        WHERE `customer` = '{customer}'
          AND `docstatus` = 1
          /* AND `outstanding_amount` != 0 */
          AND `is_proposed` = 0
       """.format(customer=customer)
    pending_invoices = frappe.db.sql(sql_query, as_dict=True)
    if pending_invoices:
        # list all invoices
        invoices = []
        for invoice in pending_invoices:
            invoices.append({
                'sales_invoice': invoice['name'],
                'amount': invoice['grand_total']
            })
            # mark invoice as proposed (prevent reoccurence)
            invoice_record = frappe.get_doc("Sales Invoice", invoice)
            invoice_record.is_proposed = 1
            invoice_record.save()
        # create a new SoftCard File
        softcard_file = frappe.get_doc({
            'doctype': 'SoftCard File',
            'title': "{0} {1}".format(customer, datetime.now()),
            'sales_invoices': invoices
        })
        new_export = softcard_file.insert()
        # submit export
        new_export.submit()
        # update database
        frappe.db.commit()
    return

@frappe.whitelist()
def export_file(softcard_file):
    # get softcard file
    softcard = frappe.get_doc("SoftCard File", softcard_file)    
    # prepare output
    content = u""
    # add each invoice
    for invoice in softcard.sales_invoices:
        # get full invoice details
        sinv = frappe.get_doc("Sales Invoice", invoice.sales_invoice)
        # collect additional information
        try:
            if sinv.from_licence:
                licences = frappe.get_all("Licence", filters={'name': sinv.from_licence}, fields=['name'])
                if licences:
                    licence = frappe.get_doc("Licence", sinv.from_licence)
                    text = "Lizenzabrechnung {0}".format(licence.customer_name)
                else:
                    text = "Rechnung"
            else:
                text = "Rechnung"
        except:
            text = "Rechnung"
        # collect tax rate
        try:
            if sinv.taxes:
                tax_rate = ("{0}".format(sinv.taxes[0].rate)).replace(".", ",")
            else:
                tax_rate = "0"
        except:
            tax_rate = "0"
        # collect payment terms
        try:
            if sinv.payment_terms_template:
                terms = frappe.get_doc("Payment Terms Template", sinv.payment_terms_template)
                due_days = terms.terms[0].credit_days
                skonto_days = terms.skonto_days
                skonto_percent = ("{0}".format(terms.skonto_percent)).replace(".", ",")
            else:
                due_days = 10
                skonto_days = 0
                skonto_percent = 0
        except:
            due_days = 10
            skonto_days = 0
            skonto_percent = 0
        # write output
        content += make_line("{0};{1};{2};{3};{4};{5};{6};{7};{8};{9};{10};{11};{12};{13};{14};{15};{16};{17};{18};{19};{20};{21};{22};{23};{24};{25};{26}".format(
            2,                                                              # 0: 2 = Lieferantenrechnung
            0,                                                              # 1: 0 = Standard
            sinv.posting_date.strftime("%d.%m-%Y"),                         # 2: Datum (dd.mm.yyyy)
            sinv.name,                                                      # 3: Belegnr. max 8 Stellen
            text[:60],                                                      # 4: Buchungstext, max. 60 Stellen
            5051,                                                           # 5: Sollkonto (5051)
            33031900,                                                       # 6: Habenkonto (33031900)
            ("{0}".format(sinv.grand_total)).replace(".", ","),             # 7: Betrag brutto (1200,00)
            ("{0}".format(sinv.total_taxes_and_charges)).replace(".", ","), # 8: Steuerbetrag (200,00)
            tax_rate,                                                       # 9: Steuersatz (20)
            "",                                                             # 10: leer
            0,                                                              # 11: 0
            0,                                                              # 12: 0
            due_days,                                                       # 13: Nettozahlungsziel (Tage, 30)
            skonto_days,                                                    # 14: Skontotage (14)
            skonto_percent,                                                 # 15: Skonto % (3)
            0,                                                              # 16: 0
            0,                                                              # 17: 0
            0,                                                              # 18: 0
            1,                                                              # 19: 1
            1,                                                              # 20: 1
            0,                                                              # 21: 0
            0,                                                              # 22: 0
            "",                                                             # 23: leer
            0,                                                              # 24: 0
            0,                                                              # 25: 0
            1,                                                              # 26: KORE (1)
        ))
                        
    return { 'content': content }
    
