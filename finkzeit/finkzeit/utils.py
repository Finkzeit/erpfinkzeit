# -*- coding: utf-8 -*-
# Copyright (c) 2018-2019, Fink Zeitsysteme/libracore and contributors
# For license information, please see license.txt
#

# imports
from __future__ import unicode_literals
import frappe, os
from frappe import _
from PyPDF2 import PdfFileWriter
from frappe.utils.background_jobs import enqueue
from frappe.utils import flt

@frappe.whitelist()
def run_calculation(quotation, buying_pricelist, currency="EUR"):
    qtn = frappe.get_doc("Quotation", quotation)
    calc_items = []
    for item in qtn.items:
        buying_prices = frappe.get_all("Item Price", filters={'item_code': item.item_code, 'price_list': buying_pricelist, 'currency': currency}, fields=['price_list_rate'])
        if buying_prices:
            buying_price = buying_prices[0]['price_list_rate']
        else:
            buying_price = 0
        cost = float(item.qty * buying_price)
        margin = item.amount - cost
        if item.amount == 0:
            relative_margin = 0
        else:
            relative_margin = 100 * (margin / item.amount)
        calc_items.append({
            'item_code': item.item_code,
            'item_name': item.item_name,
            'qty': item.qty,
            'cost': round(cost, 2),
            'revenue': round(item.amount, 2),
            'margin': round(margin, 2),
            'relative_margin': int(relative_margin)
        })
        
    return calc_items

# this function will directly cancel a draft sales invoice
@frappe.whitelist()
def direct_cancel_sinv(sinv):
    sql_query = ("""UPDATE `tabSales Invoice` SET `docstatus` = 2 WHERE `docstatus` = 0 AND `name` = "{0}";""".format(sinv))
    frappe.db.sql(sql_query, as_dict=True)
    return

# this funtion will update primary contacts
def update_primary():
    sql_query = ("""SELECT `name` FROM `tabCustomer` WHERE `customer_primary_contact` IS NULL;""")
    customers = frappe.db.sql(sql_query, as_dict=True)
    print("{0}".format(customers))
    for c in customers:
        customer = frappe.get_doc("Customer", c['name'])
        links = frappe.get_all("Dynamic Link", filters={'link_name': customer.name, 'parenttype': 'Contact'}, fields=['parent'])
        if links:
            contact = frappe.get_doc("Contact", links[0]['parent'])
            customer.customer_primary_contact = contact.name
            customer.save()
            frappe.db.commit()
            print("{0} updated".format(customer.customer_name))
        # print("{0}".format(customer.customer_name))

    return

@frappe.whitelist()
def wall(message):
    frappe.publish_realtime(event='msgprint',message=message)
    return

@frappe.whitelist()
def print_to_file(doctype, docname, print_format, dest):
    output = PdfFileWriter()
    output = frappe.get_print(doctype, docname, print_format, as_pdf=True, output=output)
    if dest != None:
        destdir = os.path.dirname(dest)
        if destdir != '' and not os.path.isdir(destdir):
            os.makedirs(destdir)
        with open(dest, "wb") as w:
            output.write(w)
    return

@frappe.whitelist()
def enqueue_submit_direct_debit_proposal(direct_debit_proposal):
    # enqueue submitting (potential long worker)
    kwargs={
        'direct_debit_proposal': direct_debit_proposal
    }

    enqueue("finkzeit.finkzeit.utils.submit_direct_debit_proposal",
        queue='long',
        timeout=15000,
        **kwargs)
    return
    
def submit_direct_debit_proposal(direct_debit_proposal):
    ddp = frappe.get_doc("Direct Debit Proposal", direct_debit_proposal)
    try:
        ddp.submit()
        frappe.db.commit()
    except Exception as err:
        frappe.log_error("{0}".format(err), 
            "submit_debit_direct_proposal {0}".format(direct_debit_proposal))
    return

"""
Checks if a customer has received ZSW invoices in the last 12 months. Returns 0 if not, otherwise > 0

This has a Jinja endpoint.
"""
def has_zsw(customer):
    #item_count = frappe.db.sql("""
    #    SELECT 
    #        COUNT(`tabSales Invoice Item`.`name`) AS `count`
    #    FROM `tabSales Invoice Item` 
    #    LEFT JOIN `tabSales Invoice` ON 
    #        `tabSales Invoice`.`name` = `tabSales Invoice Item`.`parent` 
    #    WHERE 
    #        `tabSales Invoice`.`docstatus` = 1 
    #        AND `tabSales Invoice`.`customer` = "{customer}" 
    #        AND `tabSales Invoice`.`posting_date` >= DATE_SUB(NOW(), INTERVAL 12 MONTH) 
    #        AND `tabSales Invoice Item`.`item_name` LIKE "%ZSW%";
    #""".format(customer=customer), as_dict=True)
    item_count = frappe.db.sql("""
        SELECT 
            COUNT(`tabLicence`.`name`) AS `count`
        FROM `tabLicence` 
        WHERE 
            `tabLicence`.`enabled` = 1 
            AND `tabLicence`.`customer` = "{customer}";
    """.format(customer=customer), as_dict=True)
    return item_count[0]['count']

"""
Book a payment entry against multiple customers
"""
@frappe.whitelist()
def book_avis(company, intermediate_account, currency_deviation_account, invoices, amount, reference):
    if type(invoices) == str:
        invoices = json.loads(invoices)
    amount = flt(amount)
    
    # find exchange rate for intermediate account
    intermediate_currency = frappe.get_cached_value("Account", intermediate_account, "account_currency")
    if frappe.get_cached_value("Company", company, "default_currency") == intermediate_currency:
        current_exchange_rate = 1
    else:
        exchange_rates = frappe.db.sql("""
            SELECT `exchange_rate`
            FROM `tabCurrency Exchange`
            WHERE `from_currency` = "{currency}"
            ORDER BY `date` DESC
            LIMIT 1;
            """.format(currency=intermediate_currency), as_dict=True)
        if len(exchange_rates) > 0:
            current_exchange_rate = exchange_rates[0]['exchange_rate']
        else:
            current_exchange_rate = 1
    # create base document
    jv = frappe.get_doc({
        'doctype': 'Journal Entry',
        'posting_date': datetime.now(),
        'company': company,
        'multi_currency': 1,
        'user_remark': reference,
        'accounts': [
            {
                'account': intermediate_account,
                'account_currency': intermediate_currency,
                'debit_in_account_currency': amount,
                'debit': round(amount * current_exchange_rate, 2),
                'exchange_rate': current_exchange_rate
            }
        ]
    })
    
    # extend invoices
    base_total_debit = flt(amount) * current_exchange_rate
    base_total_credit = 0
    for invoice in invoices:
        debit_account = frappe.get_value("Sales Invoice", invoice.get('sales_invoice'), 'debit_to')
        exchange_rate = frappe.get_value("Sales Invoice", invoice.get('sales_invoice'), 'conversion_rate')
        jv.append('accounts', {
            'account': debit_account,
            'account_currency': intermediate_currency,
            'party_type': 'Customer',
            'party': invoice.get('customer'),
            'exchange_rate': exchange_rate,
            'reference_type': 'Sales Invoice',
            'reference_name': invoice.get('sales_invoice'),
            'credit_in_account_currency': invoice.get('outstanding_amount'),
            'credit': round(invoice.get('outstanding_amount') * exchange_rate, 2)
        })
        base_total_credit += invoice.get('outstanding_amount') * exchange_rate
    
    # other currencies: currency deviation
    jv.set_total_debit_credit()
    currency_deviation = round(jv.total_debit - jv.total_credit, 2)
    jv.append('accounts', {
        'account': currency_deviation_account,
        'credit': currency_deviation
    })
    
    jv.set_total_debit_credit()
    # insert and submit
    jv.flags.ignore_validate = True
    jv.insert()
    jv.submit()
    
    return jv.name
