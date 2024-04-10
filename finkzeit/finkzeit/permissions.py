# -*- coding: utf-8 -*-
# Copyright (c) 2018-2024, Fink Zeitsysteme/libracore and contributors

import frappe
from frappe.utils import cint
from frappe.permissions import add_permission, setup_custom_perms

# Function to restore special user permission model
#
# run 
#   $ bench execute finkzeit.finkzeit.permissions.restore_permissions
#

def restore_permissions():
    add_permission("Item Group", "Verkauf")
    add_permission("Item Group", "Administration")
    add_extended_permission("Item Group", "Arbeitsvorbereitung", read=True, write=True, create=True)
    add_permission("Item Group", "Mitarbeiter Administration")
    return

def add_extended_permission(doctype, role, permlevel=0, read=True, write=False, create=False):
    setup_custom_perms(doctype)

    if frappe.db.get_value('Custom DocPerm', dict(parent=doctype, role=role,
        permlevel=permlevel, if_owner=0)):
        return

    custom_docperm = frappe.get_doc({
        "doctype": "Custom DocPerm",
        "__islocal": 1,
        "parent": doctype,
        "parenttype": "DocType",
        "parentfield": "permissions",
        "role": role,
        "read": cint(read),
        "write": cint(write),
        "create": cint(create),
        "permlevel": permlevel,
    })

    custom_docperm.save()

    return
