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
                       "description": _("Deckungsbeitrag")
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
                       "name": "Lizenz",
                       "label": _("Lizenz"),
                       "description": _("Lizenz")
                   }
            ]
        }
    ]
