from __future__ import unicode_literals
from frappe import _

def get_data():
    return[
        {
            "label": _("Deckungsbeitrag"),
            "icon": "fa fa-money",
            "items": [
                   {
					   "type": "report",
                       "doctype": "GL Entry",
                       "name": "Deckungsbeitrag",
                       "label": _("Deckungsbeitrag"),
                       "description": _("Deckungsbeitrag"),
                       "is_query_report": True
                   },
                   {
                       "type": "doctype",
                       "name": "Budget Overhead",
                       "label": _("Budget Overhead"),
                       "description": _("Budget Overhead")
                   }
            ]
        },
        {
            "label": _("Lizenzen"),
            "icon": "fa fa-file-text-o",
            "items": [
                   {
                       "type": "doctype",
                       "name": "Licence",
                       "label": _("Licence"),
                       "description": _("Licence")
                   },
                   {
                       "type": "doctype",
                       "name": "Invoice Cycle Log",
                       "label": _("Invoice Cycle Log"),
                       "description": _("Invoice Cycle Log")
                   },
                   {
                       "type": "doctype",
                       "name": "Retailer",
                       "label": _("Retailer"),
                       "description": _("Retailer")
                   }                   
            ]
        },
        {
            "label": _("Lists"),
            "icon": "octicon octicon-list-ordered",
            "items": [
                   {
                       "type": "doctype",
                       "name": "Beschriftung",
                       "label": _("Beschriftung"),
                       "description": _("Beschriftung")
                   },
                   {
                       "type": "doctype",
                       "name": "Seriennummer",
                       "label": _("Seriennummer"),
                       "description": _("Seriennummer")
                   }				   
            ]
        },
        {
            "label": _("Finanzbuchhaltung"),
            "icon": "octicon octicon-repo",
            "items": [
                   {
                       "type": "doctype",
                       "name": "Kassa",
                       "label": _("Kassa"),
                       "description": _("Kassa")
                   },
                   {
                       "type": "doctype",
                       "name": "Buchhaltungsperiode",
                       "label": _("Buchhaltungsperiode"),
                       "description": _("Buchhaltungsperiode")
                   },
                   {
                       "type": "doctype",
                       "name": "Payment Reminder",
                       "label": _("Payment Reminder"),
                       "description": _("Payment Reminder")
                   },
                   {
                       "type": "doctype",
                       "name": "Direct Debit Proposal",
                       "label": _("Direct Debit Proposal"),
                       "description": _("Direct Debit Proposal")
                   },
                   {
                       "type": "doctype",
                       "name": "Payment Proposal",
                       "label": _("Payment Proposal"),
                       "description": _("Payment Proposal")
                   },
                   {
                       "type": "page",
                       "name": "bank_wizard",
                       "label": _("Bank Wizard"),
                       "description": _("Bank Wizard")
                   }
            ]
        }
    ]
