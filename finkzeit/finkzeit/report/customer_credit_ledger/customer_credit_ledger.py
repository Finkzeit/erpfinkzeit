# Copyright (c) 2020, Fink Zeitsysteme/libracore and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from finkzeit.finkzeit.credit_controller import get_credit_account_ledger
from frappe import _

def execute(filters=None):
    columns, data = [], []

    columns = get_columns()
    if filters.customer:
        data = get_values(filters)
    else:
        data = []
    
    return columns, data

def get_columns():
    return [
        {"label": _("Date"), "fieldname": "date", "fieldtype": "Date", "width": 100},
        {"label": _("Amount"), "fieldname": "amount", "fieldtype": "Currency", "width": 100},
        {"label": _("Balance"), "fieldname": "balance", "fieldtype": "Currency", "width": 100}
    ]

def get_values(filters):
    data = get_credit_account_ledger(customer=filters.customer, date=filters.date)
    return data
