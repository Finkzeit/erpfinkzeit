# -*- coding: utf-8 -*-
# Copyright (c) 2018-2025, Fink Zeitsysteme/libracore and contributors
# For license information, please see license.txt
#

# imports
import frappe
from frappe import _
from erpnext.accounts.report.accounts_receivable.accounts_receivable import ReceivablePayableReport
from frappe.utils import flt, rounded

"""
 This function will return the credit ledget for the specified customer
"""
@frappe.whitelist()   
def get_credit_account_ledger(customer, date=None):
    filters = frappe._dict({
        'company': frappe.defaults.get_global_default('company'),
        'report_date': date or "2999-12-31",
        'customer': customer,
        'range1': 30,
        'range2': 60,
        'range3': 90,
        'range4': 120
    })
    args = {
        "party_type": "Customer",
        "naming_by": ["Selling Settings", "cust_master_name"],
    }
    columns, data, more, chart, *_ = ReceivablePayableReport(filters).run(args)
    credits = []
    for d in data:
        if flt(d.get('outstanding')) < 0:
            credits.append({
                'date': d.get('posting_date'),
                'amount': d.get('outstanding'),
                'reference': d.get('voucher_no')
            })
    # add balance value
    balance = 0
    for i in range(0, len(credits)):
        balance = round((balance + credits[i]['amount']), 2)
        credits[i]['balance'] = balance
        
    return credits

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
        # add a comment on the payment entry
        new_comment = frappe.get_doc({
            'doctype': 'Communication',
            'comment_type': "Comment",
            'content': "Doppelzahlung: Gutschrift eingebucht in {0}".format(sinv.name),
            'reference_doctype': pe.doctype,
            'status': "Linked",
            'reference_name': pe.name
        })
        new_comment.insert()
        frappe.db.commit()
        jv_doc = sinv.name
        
    return jv_doc
