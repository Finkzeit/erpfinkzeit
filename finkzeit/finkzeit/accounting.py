# -*- coding: utf-8 -*-
# Copyright (c) 2026, Fink Zeitsysteme/libracore and contributors
# For license information, please see license.txt

import frappe

def apply_tax_based_income_accounts(doc, event=None):
    if type(doc) == str:
        if frappe.db.exists("Sales Invoice", doc):
            doc = frappe.get_doc("Sales Invoice", doc)
        else:
            print("Sales Invoice {0} not found.".format(doc))
            return
            
    # check if there are accounting rules present (tax region specific preceeds over *
    accounting_rules = frappe.db.sql("""
        SELECT `taxes_and_charges`, `steuerregion`, `income_account`
        FROM `tabFinkzeit Settings Account`
        WHERE 
            `taxes_and_charges` = %(t)s
            AND (`steuerregion` = %(s)s OR `steuerregion` = "*")
        ORDER BY `steuerregion` DESC;""",
        {
            't': doc.taxes_and_charges,
            's': doc.steuerregion
        },
        as_dict=True
    )
    
    if not accounting_rules or len(accounting_rules) == 0:
        return
        
    # apply target account for items
    for i in doc.items:
        i.income_account = accounting_rules[0]['income_account']
        
    return

