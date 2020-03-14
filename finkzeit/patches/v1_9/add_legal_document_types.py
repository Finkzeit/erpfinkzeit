# Copyright (c) 2020, Finkzeit/libracore and Contributors
# For license information, please see license.txt
from __future__ import unicode_literals
import frappe

def execute():
    # create legal document types if they do not exist yet
    add_document_type("Datenschutzverordnung")
    add_document_type("Technisch-organisatorische Massnahme")
    add_document_type("Geheimhaltevereinbarung")
    add_document_type("Fingerabdruck")
    add_document_type("Anderes")
	return
    
def add_document_type(title):
    if not frappe.db.exists("Dokumententyp", title):
        new_document_type = frappe.get_doc({
            "doctype": "Dokumententyp",
            "title": title
        })
        new_document_type.insert()
        return
