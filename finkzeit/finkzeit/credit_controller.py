# -*- coding: utf-8 -*-
# Copyright (c) 2018-2024, Fink Zeitsysteme/libracore and contributors
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

"""
Create a credit activation journal entry

This takes the credit out of the credit account and books it into the debtors account

Like this it becomes linkable in future payment entries
"""
@frappe.whitelist()
def create_credit_advance(payment_entry, naming_series="GS-.#####", taxes="Ohne Verkaufssteuern - FZAT"): 
    credit_account = frappe.get_value("Finkzeit Settings", "Finkzeit Settings", "credit_account")
    credit_amount = 0
    jv_doc = None
    # find if there are applicable credits
    pe = frappe.get_doc("Payment Entry", payment_entry)
    if pe.deductions:
        for deduction in pe.deductions:
            if deduction.account == credit_account and deduction.amount < 0:
                credit_amount += ((-1) * deduction.amount)
                
    if credit_amount:
        # create journal entry
        """ THIS DOES NOT WORK DUE TO JV VALIDATION ON PAYMENT ENTRY
        jv = frappe.get_doc({
            'doctype': "Journal Entry",
            'company': pe.company,
            'posting_date': pe.posting_date,
            'accounts': [
                {
                    'account': credit_account,
                    'debit_in_account_currency': credit_amount
                },
                {
                    'account': frappe.get_value("Company", pe.company, 'default_receivable_account'),
                    'party_type': pe.party_type,
                    'party': pe.party,
                    'credit_in_account_currency': credit_amount
                }
            ],
            'user_remark': "Kundenguthaben aus {0} aktivieren.".format(pe.name)
        })
        jv.insert()
        jv.submit()
        """
        sinv = frappe.get_doc({
            'doctype': "Sales Invoice",
            'company': pe.company,
            'posting_date': pe.posting_date,
            'set_posting_time': 1,
            'due_date': pe.posting_date,
            'is_return': 1,
            'naming_series': naming_series,
            'customer': pe.party,
            'items': [{
                'item_code': frappe.get_value("Finkzeit Settings", "Finkzeit Settings", "credit_item"),
                'qty': -1,
                'rate': credit_amount,
                'income_account': credit_account
            }],
            'taxes_and_charges': taxes
        })
        sinv.insert()
        sinv.submit()
        frappe.db.commit()
        jv_doc = sinv.name
        
    return jv_doc
