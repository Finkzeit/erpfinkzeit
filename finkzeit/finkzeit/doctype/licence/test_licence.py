# -*- coding: utf-8 -*-
# Copyright (c) 2018, Fink Zeitsysteme/libracore and Contributors
# See license.txt
from __future__ import unicode_literals

import frappe
import unittest
import licence
from datetime import datetime

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
    
def test_bind():
    #sinvs = frappe.get_all("Sales Invoice", filters={'docstatus': 1}, fields=['name'])
    sinv_list = ["SINV-00038"]
    #for s in sinvs:
    #    sinv_list.append(s['name'])
    #now = datetime.now()
    #licence.print_bind(sinv_list, format="QR Sales Invoice", dest=str("/home/frappe/test_bind_{year}-{month}-{day}.pdf".format(day=now.day, month=now.month, year=now.year)) )
    print(frappe.get_print("Sales Invoice", "SINV-00038", None))
    return
