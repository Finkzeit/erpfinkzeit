# -*- coding: utf-8 -*-
# Copyright (c) 2018, Fink Zeitsysteme/libracore and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe.model.document import Document

class Kassa(Document):
    def validate(self):
        if not self.anfangssaldo:
            self.anfangssaldo = 0.0
        total_in = 0.0
        for cash_in in self.cash_ins:
            if (cash_in.tax_amount):
                if (cash_in.gross_amount != cash_in.net_amount + cash_in.tax_amount):
                    cash_in.net_amount = cash_in.gross_amount - cash_in.tax_amount
            else:
                if (cash_in.gross_amount != cash_in.net_amount):
                    cash_in.net_amount = cash_in.gross_amount
            total_in += cash_in.gross_amount
        total_out = 0.0
        for cash_out in self.cash_outs:
            if (cash_out.tax_amount):
                if (cash_out.gross_amount != cash_out.net_amount + cash_out.tax_amount):
                    cash_out.net_amount = cash_out.gross_amount - cash_out.tax_amount
            else:
                if (cash_out.gross_amount != cash_out.net_amount):
                    cash_out.net_amount = cash_out.gross_amount
            total_out += cash_out.gross_amount
        self.endsaldo = self.anfangssaldo + total_in - total_out
        return
        
    def on_submit(self):
        # assemble the kassa transaction view
        transactions = {}
        # collect all entries
        for cash_in in self.cash_ins:
            transactions[cash_in.name] = str(cash_in.date)
        for cash_out in self.cash_outs:
            transactions[cash_out.name] = str(cash_out.date)
        # sort by date
        transaction_records = []
        no = self.get_next_no()
        for key, value in sorted(transactions.iteritems(), key=lambda (k,v): (v,k)):
            transaction_records.append({'no': no, 'date': value, 'description': key})
            no += 1
            
        frappe.throw(transaction_records)
        
        # create journal entries for each entry
        for cash_in in self.cash_ins:
            accounts = [
                    {
                        'account': self.account,
                        'debit_in_account_currency': cash_in.gross_amount
                    },
                    {
                        'account': cash_in.in_account,
                        'credit_in_account_currency': cash_in.net_amount
                    }
                ]
            if cash_in.tax_account:
                accounts.append({
                    'account': cash_in.tax_account,
                    'credit_in_account_currency': cash_in.tax_amount
                })
            journal_entry = frappe.get_doc({
                'doctype': 'Journal Entry',
                'voucher_type': 'Journal Entry',
                'posting_date': cash_in.date,
                'accounts': accounts,
                'user_remark': cash_in.description
            })
            journal_entry_record = journal_entry.insert()
            journal_entry_record.submit()
            
        for cash_out in self.cash_outs:
            accounts = [
                    {
                        'account': self.account,
                        'credit_in_account_currency': cash_out.gross_amount
                    },
                    {
                        'account': cash_out.out_account,
                        'debit_in_account_currency': cash_out.net_amount
                    }
                ]
            if cash_out.tax_account:
                accounts.append({
                    'account': cash_out.tax_account,
                    'debit_in_account_currency': cash_out.tax_amount
                })
            journal_entry = frappe.get_doc({
                'doctype': 'Journal Entry',
                'voucher_type': 'Journal Entry',
                'posting_date': cash_out.date,
                'accounts': accounts,
                'user_remark': cash_out.description
            })
            journal_entry_record = journal_entry.insert()
            journal_entry_record.submit()
        
        return
    
    def get_next_no(self):
        # return the next available number for transactions
        sql_query = """SELECT MAX(`no`) AS `no` FROM `tabKassa Transaction`"""
        no = frappe.db.sql(sql_query, as_dict=True)
        if no[0]['no']:
            return int(no[0]['no']) + 1
        else:
            return 1
        
	pass

