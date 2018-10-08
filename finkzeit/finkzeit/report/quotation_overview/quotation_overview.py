# -*- coding: utf-8 -*-
# Copyright (c) 2017-2018, libracore and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from datetime import datetime

def execute(filters=None):
    columns, data = [], []

    # prepare columns
    columns = [
        "Quotation:Link/Quotation:100",
        "Customer:Link/Customer:100",
        "Customer Name:Data:200",
        "Sales Order:Link/Sales Order:100",
        "Volume:Currency:100",
        "Probability:Percent:100",
        "Weighted Volume:Currency:100"
    ]

    # prepare filters
    from_date = datetime.today()
    if filters.from_date:
        from_date = filters.from_date
    to_date = datetime.today()
    if filters.to_date:
        to_date = filters.to_date
    owner = "%"
    if filters.owner:
        owner = filters.owner
        
    data = get_data(from_date, to_date, owner)

    return columns, data

def get_data(from_date, to_date, owner):   
    # prepare query
    sql_query = """SELECT 
          `tabQuotation`.`name`,
          `tabQuotation`.`customer`,
          `tabQuotation`.`customer_name`,
          `tabSales Order Item`.`parent`,
          `tabQuotation`.`net_total`,
          `tabQuotation`.`probability`,
          `tabQuotation`.`weighted_volume`
        FROM `tabQuotation`
        LEFT JOIN `tabSales Order Item` ON `tabQuotation`.`name` = `tabSales Order Item`.`prevdoc_docname`
        WHERE `tabQuotation`.`docstatus` = 1
          AND DATE(`tabQuotation`.`transaction_date`) >= '{from_date}'
          AND DATE(`tabQuotation`.`transaction_date`) <= '{to_date}'
          AND `tabQuotation`.`owner` LIKE '{owner}'
        ;""".format(from_date=from_date, to_date=to_date, owner=owner)

    # run query, as list, otherwise export to Excel fails 
    data = frappe.db.sql(sql_query, as_list = True)
    return data
