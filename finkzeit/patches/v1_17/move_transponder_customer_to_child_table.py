# Copyright (c) 2025, Finkzeit/libracore and Contributors
# For license information, please see license.txt
import frappe
from tqdm import tqdm

def execute():
    frappe.reload_doc("finkzeit", "doctype", "Transponder Configuration Customer")
    frappe.reload_doc("finkzeit", "doctype", "Transponder Configuration")
    
    configs = frappe.get_all("Transponder Configuration", fields=['name', 'customer', 'customer_name', 'licence', 'licence_name'])
    
    for config in tqdm(configs, desc="moving customer links", unit="configs"):
        if config.get('customer') or config.get('licence'):
            config_doc = frappe.get_doc("Transponder Configuration", config.get('name'))
            config_doc.append("customers", {
                'customer': config.customer,
                'customer_name': config.customer_name,
                'licence': config.licence,
                'licence_name': config.licence_name
            })
            config_doc.save()
            frappe.db.commit()
            
    return

