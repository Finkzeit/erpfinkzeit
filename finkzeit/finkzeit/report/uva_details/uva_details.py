# Copyright (c) 2019, Fink Zeitsysteme/libracore and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe

def execute(filters=None):
    columns, data = [], []
    
    # prepare columns
    columns = ["Datum::100", 
        "Beleg::100", 
        "Basis:Currency:100", 
        "Netto:Currency:100", 
        "Steuerregel::200", 
        "Steuer:Currency:100"
    ]
    
    # prepare filters
    if filters.code:
        view = "viewATVAT_{0}".format(filters.code)
    else:
        view = "viewATVAT_000"
    if filters.from_date:
        from_date = filters.from_date
    else:
        from_date = "2000-01-01"
    if filters.to_date:
        to_date = filters.to_date
    else:
        to_date = "2999-12-31"
        
    # VAT control view
    sql_query = """SELECT *
                FROM `{view}`
                WHERE 
                  `{view}`.`posting_date` >= '{from_date}'
                  AND `{view}`.`posting_date` <= '{to_date}';""".format(view=view, from_date=from_date, to_date=to_date)
    data = frappe.db.sql(sql_query, as_list = True)
    
    # return data
    return columns, data

