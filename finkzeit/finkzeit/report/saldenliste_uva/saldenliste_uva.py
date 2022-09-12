# Copyright (c) 2019-2020, Fink Zeitsysteme/libracore and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from datetime import datetime

def execute(filters=None):
    columns, data = [], []

    # prepare columns
    columns = [
        {'label': "Kontonummer", 'fieldname': 'kontonummer', 'fieldtype': 'Data', 'width': 105},
        {'label': "Konto", 'fieldname': 'konto', 'fieldtype': 'Link', 'options': 'Account', 'width': 355},
        {'label': "Soll", 'fieldname': 'soll', 'fieldtype': 'Currency', 'width': 85},
        {'label': "Haben", 'fieldname': 'haben', 'fieldtype': 'Currency', 'width': 85},
        {'label': "Periodensaldo", 'fieldname': 'periodensaldo', 'fieldtype': 'Currency', 'width': 105},
        {'label': "Typ", 'fieldname': 'typ', 'fieldtype': 'Data', 'width': 105},
        {'label': "KZ", 'fieldname': 'kz', 'fieldtype': 'Data', 'width': 100},
        {'label': "", 'fieldname': 'blank', 'fieldtype': 'Data', 'width': 20}
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
    #prepare account number lists
    accno_xxx = ["2500", "2505", "2510", "3510", "3511", "3512"]
    accno_022 = ["4020", "4220", "4452", "4843", "4844", "4850", "4851", "7810"]
    accno_029 = ["4840", "4841", "4842", "4845"]
    accno_000 = ["4000", "4005", "4200", "4250", "4290", "4455", "4500"] + accno_022 + accno_029
    accno_all = accno_xxx + accno_000
    
    # prepare query
    sql_query = """SELECT 
          `tabAccount`.`account_number` AS `kontonummer`,
          `tabGL Entry`.`account` AS `konto`, 
          ROUND(SUM(`tabGL Entry`.`debit`), 2) AS `soll`, 
          ROUND(SUM(`tabGL Entry`.`credit`), 2) AS `haben`,
          ROUND((SUM(`tabGL Entry`.`debit`) - SUM(`tabGL Entry`.`credit`)), 2) AS `periodensaldo`,
          `tabAccount`.`report_type` AS `typ`
       FROM `tabGL Entry`
       JOIN `tabAccount` ON `tabGL Entry`.`account` = `tabAccount`.`name`
       WHERE `tabGL Entry`.`posting_date` >= '{from_date}' 
         AND `tabGL Entry`.`posting_date` <= '{to_date}'
         AND `tabAccount`.`report_type` LIKE '{report_type}'
         AND `tabAccount`.`account_number` IN (SELECT `account_number` 
                    FROM `tabAccount` AS `tA1` 
                    WHERE `tA1`.`account_number` IN ('{accno_all}'))
       GROUP BY `tabGL Entry`.`account`;""".format(from_date=from_date, to_date=to_date, report_type=report_type, accno_all="', '".join(accno_all))
       
    # run query
    data = frappe.db.sql(sql_query, as_dict = True)
    
    # compile aggregation keys
    for d in data:
        keys = []
        if d.kontonummer in accno_000:
            keys.append("000")
        if d.kontonummer in accno_022:
            keys.append("022")
        if d.kontonummer in accno_029:
            keys.append("029")
        d['kz'] = ", ".join(keys)
    
    # extend summary lines
    vat_keys = {'000': 0.0, '022': 0.0, '029': 0.0}
    for i in range(len(data)):
        if data[i]['kontonummer'] in accno_000:
            vat_keys['000'] += data[i]['periodensaldo']
        if data[i]['kontonummer'] in accno_022:
            vat_keys['022'] += data[i]['periodensaldo']
        if data[i]['kontonummer'] in accno_029:
            vat_keys['029'] += data[i]['periodensaldo']
    data.append({'kontonummer': '', 'konto': '', 'soll': None, 'haben': None, 'periodensaldo': None, 'typ': '', 'kz': None})
    data.append({'kontonummer': '[000]', 'konto': '', 'soll': None, 'haben': None, 'periodensaldo': vat_keys['000'], 'typ': '', 'kz': "000"})
    data.append({'kontonummer': '[022]', 'konto': '', 'soll': None, 'haben': None, 'periodensaldo': vat_keys['022'], 'typ': '', 'kz': "022"})
    data.append({'kontonummer': '[029]', 'konto': '', 'soll': None, 'haben': None, 'periodensaldo': vat_keys['029'], 'typ': '', 'kz': "029"})
    
    return data
