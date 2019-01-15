# -*- coding: utf-8 -*-
# Copyright (c) 2018, Fink Zeitsysteme/libracore and contributors
# For license information, please see license.txt
#

# imports
from __future__ import unicode_literals
import frappe
from frappe import _

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
