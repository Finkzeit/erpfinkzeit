# -*- coding: utf-8 -*-
# Copyright (c) 2018-2024, Fink Zeitsysteme/libracore and contributors

import frappe
from frappe.utils import cint
from frappe.permissions import add_permission

# Function to restore special user permission model
#
# run 
#   $ bench execute finkzeit.finkzeit.permissions.restore_permissions
#

def restore_permissions():
    add_permission("Item Group", "Verkauf")
    return
