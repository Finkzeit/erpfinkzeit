# Copyright (c) 2013, Fink Zeitsysteme/libracore and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from datetime import datetime

def execute(filters=None):
    columns, data = [], []

    # prepare columns
    columns = [
        "Nr::50",
        "Konto:Link/Account:200",
        "Soll:Currency:100",
        "Haben:Currency:100",
        "Periodensaldo:Currency:100",
        "Typ::150"
    ]

    # prepare filters
    from_date = datetime.today()
    if filters.from_date:
        from_date = filters.from_date
    to_date = datetime.today()
    if filters.to_date:
        to_date = filters.to_date
    
    report_type = "%"
    if filters.report_type:
        report_type = filters.report_type
        
    data = get_data(from_date, to_date, report_type)

    return columns, data

def get_data(from_date, to_date, report_type):   
    # prepare query
    sql_query = """SELECT 
          `tabAccount`.`account_number` AS `Kontonummer`,
          `tabGL Entry`.`account` AS `Konto`, 
          ROUND(SUM(`tabGL Entry`.`debit`), 2) AS `Soll`, 
          ROUND(SUM(`tabGL Entry`.`credit`), 2) AS `Haben`,
          ROUND((SUM(`tabGL Entry`.`debit`) - SUM(`tabGL Entry`.`credit`)), 2) AS `Periodensaldo`,
          `tabAccount`.`report_type` AS `Typ`
       FROM `tabGL Entry`
       JOIN `tabAccount` ON `tabGL Entry`.`account` = `tabAccount`.`name`
       WHERE `tabGL Entry`.`posting_date` >= '{from_date}' 
         AND `tabGL Entry`.`posting_date` <= '{to_date}'
         AND `tabAccount`.`report_type` LIKE '{report_type}'
       GROUP BY `tabGL Entry`.`account`;""".format(from_date=from_date, to_date=to_date, report_type=report_type)
       
    # run query, as list, otherwise export to Excel fails 
    data = frappe.db.sql(sql_query, as_list = True)
    return data
