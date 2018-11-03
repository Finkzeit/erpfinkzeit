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
        cost = (item.qty * buying_price)
        margin = item.amount - cost
        relative_margin = 100 * (margin / item.amount)
        calc_items.append({
            'item_code': item.item_code,
            'item_name': item.item_name,
            'qty': item.qty,
            'cost': cost,
            'revenue': item.amount,
            'margin': margin,
            'relative_margin': int(relative_margin)
        })
        
    return calc_items
