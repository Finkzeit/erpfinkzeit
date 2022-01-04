# Copyright (c) 2021, Fink Zeitsysteme/libracore and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe import _

def execute(filters=None):
    columns = get_columns()
    data = get_data(filters)
    return columns, data

def get_columns():
    return [
        {'fieldname': 'date', 'label': _("Date"), 'fieldtype': 'Date', 'width': 80},
        {'fieldname': 'sales_invoice', 'label': _("Sales Invoice"), 'fieldtype': 'Link', 'options': 'Sales Invoice', 'width': 80},
        {'fieldname': 'net_amount', 'label': _("Net amount"), 'fieldtype': 'Currency', 'width': 80},
        {'fieldname': 'income_account', 'label': _("Account"), 'fieldtype': 'Link', 'options': 'Account', 'width': 150},
        {'fieldname': 'taxes', 'label': _("Taxes"), 'fieldtype': 'Link', 'options': 'Sales Taxes and Charges Template', 'width': 200},
        {'fieldname': 'blank', 'label': _(""), 'fieldtype': 'Data', 'width': 20}
    ]
    
def get_data(filters):
    sql_query = """SELECT 
            `tabSales Invoice`.`posting_date` AS `date`,
            `tabSales Invoice`.`name` AS `sales_invoice`, 
            `tabSales Invoice Item`.`net_amount` AS `net_amount`, 
            `tabSales Invoice Item`.`income_account` AS `income_account`, 
            `tabSales Invoice`.`taxes_and_charges` AS `taxes`
        FROM `tabSales Invoice Item`
        LEFT JOIN `tabSales Invoice` ON `tabSales Invoice Item`.`parent` = `tabSales Invoice`.`name`
        WHERE
        `tabSales Invoice`.`posting_date` >= "{from_date}"
        AND `tabSales Invoice`.`posting_date` <= "{to_date}"
        AND `tabSales Invoice`.`docstatus` = 1;""".format(from_date=filters.from_date, to_date=filters.to_date)
    data = frappe.db.sql(sql_query, as_dict=True)
    return data
