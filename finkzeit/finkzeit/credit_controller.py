# -*- coding: utf-8 -*-
# Copyright (c) 2018-2020, Fink Zeitsysteme/libracore and contributors
# For license information, please see license.txt
#

# imports
from __future__ import unicode_literals
import frappe
from frappe import _

"""
 This function will return the credit ledget for the specified customer
"""
@frappe.whitelist()   
def get_credit_account_ledger(customer, date=None):
    credit_account = frappe.get_value("Finkzeit Settings", "Finkzeit Settings", "credit_account")
    if not date:
        date = "2999-12-31"
    sql_query = """SELECT 
            `raw`.`date`,
            `raw`.`amount`,
            `raw`.`reference`
        FROM
        (SELECT 
            `tabPayment Entry`.`posting_date` AS `date`, 
            (-1) * `tabPayment Entry Deduction`.`amount` AS `amount`,
            `tabPayment Entry`.`name` AS `reference` 
        FROM `tabPayment Entry Deduction`
        LEFT JOIN `tabPayment Entry` ON `tabPayment Entry`.`name` = `tabPayment Entry Deduction`.`parent`
        WHERE 
            `tabPayment Entry Deduction`.`account` = "{account}"
            AND `tabPayment Entry`.`party` = "{customer}"
            AND `tabPayment Entry`.`docstatus` = 1
            AND `tabPayment Entry`.`posting_date` <= "{date}"
        UNION SELECT
            `tabPayment Entry`.`posting_date` AS `date`,
            (-1) * `tabPayment Entry`.`paid_amount` AS `amount`,
            `tabPayment Entry`.`name` AS `reference`
        FROM `tabPayment Entry`
        WHERE 
            `tabPayment Entry`.`paid_to` = "{account}"
            AND `tabPayment Entry`.`credit_party` = "{customer}"
            AND `tabPayment Entry`.`docstatus` = 1
            AND `tabPayment Entry`.`posting_date` <= "{date}"
        UNION SELECT
            `tabJournal Entry`.`posting_date`  AS `date`,
            (-1) * (`tabJournal Entry Account`.`debit` - `tabJournal Entry Account`.`credit`) AS `amount`,
            `tabJournal Entry`.`name` AS `reference`
        FROM `tabJournal Entry Account`
        LEFT JOIN `tabJournal Entry` ON `tabJournal Entry`.`name` = `tabJournal Entry Account`.`parent`
        WHERE 
            `tabJournal Entry Account`.`account` = "{account}"
            AND `tabJournal Entry Account`.`credit_party` = "{customer}"
            AND `tabJournal Entry`.`docstatus` = 1
            AND `tabJournal Entry`.`posting_date` <= "{date}"
        ) AS `raw`
        ORDER BY `raw`.`date` ASC;""".format(customer=customer, account=credit_account, date=date)
    ledger = frappe.db.sql(sql_query, as_dict=True)
    # add balance value
    balance = 0
    for i in range(0, len(ledger)):
        balance = round((balance + ledger[i]['amount']), 2)
        ledger[i]['balance'] = balance
        
    return ledger

"""
 This function will return the current credit balance for the selected customer
"""
@frappe.whitelist()    
def get_credit_account_balance(customer, date=None):
    balance = 0
    ledger = get_credit_account_ledger(customer, date)
    if len(ledger) > 0:
        balance = ledger[-1]['balance']
    return balance

