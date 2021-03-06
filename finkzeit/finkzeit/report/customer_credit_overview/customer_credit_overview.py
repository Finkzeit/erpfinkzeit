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
        {"label": _("Balance"), "fieldname": "balance", "fieldtype": "Currency", "width": 100},
        {"label": _("Phone"), "fieldname": "phone", "fieldtype": "Data", "width": 150},
        {"label": _(""), "fieldname": "empty", "fieldtype": "Data", "width": 10}
    ]

def get_values(filters):
    # get customers
    credit_account = frappe.get_value("Finkzeit Settings", "Finkzeit Settings", "credit_account")
    sql_query = """SELECT 
                DISTINCT(`raw`.`party`) AS `customer`, 
                `tabCustomer`.`customer_name`,
                (SELECT `tabAddress`.`phone` 
                 FROM `tabAddress` 
                 WHERE `tabAddress`.`name` IN (SELECT `tabDynamic Link`.`parent`
                                              FROM `tabDynamic Link`
                                              WHERE `tabDynamic Link`.`parenttype` = "Address"
                                                AND `tabDynamic Link`.`link_doctype` = "Customer"
                                                AND `tabDynamic Link`.`link_name` = `tabCustomer`.`name`)
                 ORDER BY `tabAddress`.`is_primary_address` DESC
                 LIMIT 1) AS `phone`
            FROM
            (SELECT 
                `tabPayment Entry`.`party`
            FROM `tabPayment Entry Deduction`
            LEFT JOIN `tabPayment Entry` ON `tabPayment Entry`.`name` = `tabPayment Entry Deduction`.`parent`
            WHERE 
                `tabPayment Entry Deduction`.`account` = "{account}"
                AND `tabPayment Entry`.`docstatus` = 1
            UNION SELECT
                `tabPayment Entry`.`credit_party`
            FROM `tabPayment Entry`
            WHERE 
                `tabPayment Entry`.`paid_to` = "{account}"
                AND `tabPayment Entry`.`docstatus` = 1
            UNION SELECT
                `tabJournal Entry Account`.`credit_party`
            FROM `tabJournal Entry Account`
            LEFT JOIN `tabJournal Entry` ON `tabJournal Entry`.`name` = `tabJournal Entry Account`.`parent`
            WHERE 
                `tabJournal Entry Account`.`account` = "{account}"
                AND `tabJournal Entry`.`docstatus` = 1
            ) AS `raw`
            LEFT JOIN `tabCustomer` ON `tabCustomer`.`name` = `raw`.`party`
            ORDER BY `customer` ASC;""".format(account=credit_account)
    customers = frappe.db.sql(sql_query, as_dict=True)
    # enrich balances
    data = []
    for i in range(0, len(customers)):
        balance = get_credit_account_balance(customers[i]['customer'], filters.date)
        if balance != 0:
            data.append({
                'customer': customers[i]['customer'],
                'customer_name': customers[i]['customer_name'],
                'balance': balance,
                'phone': customers[i]['phone']
            })
    # return data
    return data
