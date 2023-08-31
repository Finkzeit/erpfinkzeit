from __future__ import unicode_literals
from frappe import _

def get_data():
    return {
        'fieldname': 'transponder_configuration',
        'transactions': [
            {
                'label': _('Transponders'),
                'items': ['Transponder']
            }
        ]
    }
    
