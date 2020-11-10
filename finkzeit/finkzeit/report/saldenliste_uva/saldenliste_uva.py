# Copyright (c) 2019-2020, Fink Zeitsysteme/libracore and contributors
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
         AND `tabAccount`.`account_number` IN (SELECT `account_number` 
                    FROM `tabAccount` AS `tA1` 
                    WHERE `tA1`.`account_number` IN ("2500", "2505", "2510", "3510", "3511", "3512", "7810") 
                    OR `tA1`.`account_number` LIKE "4%"
                    AND `tA1`.`account_number` NOT IN ("4880"))
       GROUP BY `tabGL Entry`.`account`;""".format(from_date=from_date, to_date=to_date, report_type=report_type)
       
    # run query
    data = frappe.db.sql(sql_query, as_dict = True)
    
    # extend summary lines
    vat_keys = {'000': 0.0, '022': 0.0, '029': 0}
    for i in range(len(data)):
        if data[i]['Kontonummer'].startswith("4") or data[i]['Kontonummer'].startswith("7") and not data[i]['Kontonummer'] == "4880":
            vat_keys['000'] += data[i]['Periodensaldo']
        if data[i]['Kontonummer'] in ["4020", "4220", "4452", "4843", "4844", "4850", "4851", "7810"]:
            vat_keys['022'] += data[i]['Periodensaldo']
        if data[i]['Kontonummer'] in ["4840", "4841", "4842"]:
            vat_keys['029'] += data[i]['Periodensaldo']
    data.append({'Kontonummer': '', 'Konto': '', 'Soll': None, 'Haben': None, 'Periodensaldo': None, 'Typ': ''})
    data.append({'Kontonummer': '[000]', 'Konto': '', 'Soll': None, 'Haben': None, 'Periodensaldo': vat_keys['000'], 'Typ': ''})
    data.append({'Kontonummer': '[022]', 'Konto': '', 'Soll': None, 'Haben': None, 'Periodensaldo': vat_keys['022'], 'Typ': ''})
    data.append({'Kontonummer': '[029]', 'Konto': '', 'Soll': None, 'Haben': None, 'Periodensaldo': vat_keys['029'], 'Typ': ''})
    
    # return data
    return data
