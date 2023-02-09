# -*- coding: utf-8 -*-
# Copyright (c) 2018, Fink Zeitsysteme/libracore and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe.model.document import Document
from collections import OrderedDict
from erpnextswiss.erpnextswiss.attach_pdf import execute

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
        no = self.get_next_no()
        transaction_records = OrderedDict(sorted(transactions.items(), key=lambda t:t[1]))

        # create the transaction records
        balance = self.anfangssaldo
        idx = 1
        for key, value in transaction_records.items():
            # try to fetch expense
            is_out = frappe.get_all('Kassa Out', filters={'name': key}, fields=['name'])
            if is_out:
                entry = frappe.get_doc('Kassa Out', key)
                balance -= entry.gross_amount
                self.create_transaction(no = no, 
                    date = entry.date, 
                    description = entry.description, 
                    cash_out = entry.gross_amount, 
                    balance = balance,
                    idx = idx)
            else:
                # fetch income
                entry = frappe.get_doc('Kassa In', key)
                balance += entry.gross_amount
                self.create_transaction(no = no, 
                    date = entry.date, 
                    description = entry.description, 
                    cash_in = entry.gross_amount, 
                    balance = balance,
                    idx = idx)
            no += 1
            idx += 1
            
        frappe.db.commit()
        
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
        
        # create and attach the print pdf
        execute("Kassa", self.name, title=self.name.replace("ä", "ae"), print_format="Kassa")
        frappe.db.commit()
        
        return
    
    def get_next_no(self):
        # return the next available number for transactions
        sql_query = """SELECT MAX(`no`) AS `no` FROM `tabKassa Transaction`"""
        no = frappe.db.sql(sql_query, as_dict=True)
        if no[0]['no']:
            return int(no[0]['no']) + 1
        else:
            return 1
        
    def create_transaction(self, no, date, description, cash_in = 0.0, cash_out = 0.0, balance = 0.0, idx = 0):
        child = frappe.get_doc({
            'doctype': 'Kassa Transaction',
            'no': no,
            'date': date,
            'description': description,
            'cash_in': cash_in,
            'cash_out': cash_out,
            'balance': balance,
            'parent': self.name,
            'parenttype': 'Kassa',
            'parentfield': 'transactions',
            'idx': idx
        })
        child_record = child.insert()
        return
