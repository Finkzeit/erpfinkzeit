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
        "Lead:Link/Lead:100",
        "Customer:Link/Customer:100",
        "Customer Name:Data:200",
        "Quotation:Link/Quotation:100",
        "Sales Order:Link/Sales Order:100",
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
            `tabLead`.`name`,
            `tabCustomer`.`name`,
            `tabCustomer`.`customer_name`,
            `tabQuotation`.`name`,
            `tabSales Order Item`.`parent`
        FROM `tabLead`
        LEFT JOIN `tabCustomer` ON `tabLead`.`name` = `tabCustomer`.`lead_name`
        RIGHT JOIN `tabQuotation` ON `tabCustomer`.`name` = `tabQuotation`.`customer`
        LEFT JOIN `tabSales Order Item` ON `tabQuotation`.`name` = `tabSales Order Item`.`prevdoc_docname`
        WHERE (DATE(`tabLead`.`creation`) >= '{from_date}'
          AND DATE(`tabLead`.`creation`) <= '{to_date}'
          AND `tabLead`.`owner` LIKE '{owner}')
          OR (DATE(`tabQuotation`.`creation`) >= '{from_date}'
          AND DATE(`tabQuotation`.`creation`) <= '{to_date}'
          AND `tabQuotation`.`owner` LIKE '{owner}')
        ;""".format(from_date=from_date, to_date=to_date, owner=owner)

    # run query, as list, otherwise export to Excel fails 
    data = frappe.db.sql(sql_query, as_list = True)
    return data
