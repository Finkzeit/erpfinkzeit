# -*- coding: utf-8 -*-
from __future__ import unicode_literals
from . import __version__ as app_version

app_name = "finkzeit"
app_title = "Finkzeit"
app_publisher = "Fink Zeitsysteme/libracore"
app_description = "ERPNext Extensions for Fink Zeitsysteme"
app_icon = "octicon octicon-clock"
app_color = "#f1f1f1"
app_email = "info@libracore.com"
app_license = "GPL"

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/finkzeit/css/finkzeit.css"
# app_include_js = "/assets/finkzeit/js/finkzeit.js"
app_include_js = ["/assets/finkzeit/js/fink_common.js", "/assets/finkzeit/js/iban.js"]

# include js, css files in header of web template
# web_include_css = "/assets/finkzeit/css/finkzeit.css"
# web_include_js = "/assets/finkzeit/js/finkzeit.js"

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
doctype_js = {
  "Supplier": "public/js/supplier.js",
  "Customer": "public/js/customer.js"
}
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
#	"Role": "home_page"
# }

# Website user home page (by function)
# get_website_user_home_page = "finkzeit.utils.get_home_page"

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Installation
# ------------

# before_install = "finkzeit.install.before_install"
# after_install = "finkzeit.install.after_install"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "finkzeit.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
# 	"*": {
# 		"on_update": "method",
# 		"on_cancel": "method",
# 		"on_trash": "method"
#	}
# }

# Scheduled Tasks
# ---------------

# speed up email queue
scheduler_events = {
    "cron": {
        "* * * * *": [
            "frappe.email.queue.flush"
        ]
    }
}
# scheduler_events = {
# 	"all": [
# 		"finkzeit.tasks.all"
# 	],
# 	"daily": [
# 		"finkzeit.tasks.daily"
# 	],
# 	"hourly": [
# 		"finkzeit.tasks.hourly"
# 	],
# 	"weekly": [
# 		"finkzeit.tasks.weekly"
# 	]
# 	"monthly": [
# 		"finkzeit.tasks.monthly"
# 	]
# }

# Testing
# -------

# before_tests = "finkzeit.install.before_tests"

# Overriding Whitelisted Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "finkzeit.event.get_events"
# }

# Fixtures (to import DocType customisations)
# --------
fixtures = ["Custom Field"]
