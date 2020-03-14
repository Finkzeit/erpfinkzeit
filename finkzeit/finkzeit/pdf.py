# -*- coding: utf-8 -*-
# Copyright (c) 2018-2020, Fink Zeitsysteme/libracore and contributors
# For license information, please see license.txt
#

# imports
import frappe
from frappe.utils.pdf import read_options_from_html
from datetime import datetime
from frappe.utils.file_manager import save_file

# rewritten prepare options function
def finkzeit_prepare_options(html, options):
	if not options:
		options = {}

	options.update({
		'print-media-type': None,
		'background': None,
		'images': None,
		'quiet': None,
		# 'no-outline': None,
		'encoding': "UTF-8",
		#'load-error-handling': 'ignore',
		'disable-smart-shrinking': None,
		# defaults
		'margin-right': '15mm',
		'margin-left': '15mm'
	})

	html, html_options = read_options_from_html(html)
	options.update(html_options or {})

	# cookies
	if frappe.session and frappe.session.sid:
		options['cookie'] = [('sid', '{0}'.format(frappe.session.sid))]

	# page size
	if not options.get("page-size"):
		options['page-size'] = frappe.db.get_single_value("Print Settings", "pdf_page_size") or "A4"
	frappe.log_error("Shrinking removed")
	return html, options

# async background pdf creationg
@frappe.whitelist()
def enqueue_create_pdf(doctype, docname, printformat):
    frappe.enqueue(method=create_pdf, queue='long', timeout=30,
        **{'doctype': doctype, 'docname': docname, 'printformat': printformat})
    return

#background printing to attachment
def create_pdf(doctype, docname, printformat):
    # create html
    html = frappe.get_print(doctype, docname, print_format=printformat)
    # create pdf
    pdf = frappe.utils.pdf.get_pdf(html)
    # save and attach pdf
    now = datetime.now()
    ts = "{0:04d}-{1:02d}-{2:02d}".format(now.year, now.month, now.day)
    file_name = "{0}_{1}.pdf".format(ts, docname.replace(" ", "_").replace("/", "_"))
    save_file(file_name, pdf, doctype, docname, is_private=1)
    return
