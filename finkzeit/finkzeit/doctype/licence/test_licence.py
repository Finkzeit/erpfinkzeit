# -*- coding: utf-8 -*-
# Copyright (c) 2018, Fink Zeitsysteme/libracore and Contributors
# See license.txt
from __future__ import unicode_literals

import frappe
import unittest

# import sending emails
from frappe.email.queue import send

class TestLicence(unittest.TestCase):
	pass

def send_mail(recipient):
    # get first sales invoice
    sinvs = frappe.get_all("Sales Invoice", filters=None, fields=['name'])
    if sinvs:
        send(recipients=recipient,
            subject="Test mail",
            message="This is a test message",
            reference_doctype="Sales Invoice",
            reference_name=sinvs[0]['name'],
            attachments={"print_format_attachment": 1, "doctype": "Sales Invoice", "name": sinvs[0]['name'], "print_format": "Standard"}
        )
        print("Sent")
    return
    
