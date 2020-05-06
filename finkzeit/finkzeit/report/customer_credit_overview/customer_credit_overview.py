# Copyright (c) 2020, Fink Zeitsysteme/libracore and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from finkzeit.finkzeit.credit_controller import get_credit_account_balance
from frappe import _

def execute(filters=None):
    columns, data = [], []

    columns = get_columns()
    data = get_values(filters)
    
    return columns, data

def get_columns():
    return [
        {"label": _("Customer"), "fieldname": "customer", "fieldtype": "Link", "options": "Customer", "width": 100},
        {"label": _("Customer name"), "fieldname": "customer_name", "fieldtype": "Data", "width": 150},
        {"label": _("Balance"), "fieldname": "balance", "fieldtype": "Currency", "width": 100}
    ]

def get_values(filters):
    # get customers
    sql_query = """SELECT 
                     `name` AS `customer`, 
                     `customer_name` AS `customer_name`
                   FROM `tabCustomer`
                   ORDER BY `name` ASC;"""
    customers = frappe.db.sql(sql_query, as_dict=True)
    # enrich balances
    data = []
    for i in range(0, len(customers)):
        balance = get_credit_account_balance(customers[i]['customer'], filters.date)
        if balance != 0:
            data.append({
                'customer': customers[i]['customer'],
                'customer_name': customers[i]['customer_name'],
                'balance': balance
            })
    # return data
    return data
