// Copyright (c) 2023, Fink Zeitsysteme/libracore and contributors
// For license information, please see license.txt

// filters
cur_frm.fields_dict['customer'].get_query = function(doc) {
     return {
         filters: {
             "disabled": 0
         }
     }
}
cur_frm.fields_dict['item'].get_query = function(doc) {
     return {
         filters: {
             "disabled": 0
         }
     }
}
cur_frm.fields_dict['licence'].get_query = function(doc) {
     return {
         filters: {
             "customer": cur_frm.doc.customer
         }
     }
}
    
frappe.ui.form.on('Transponder Configuration', {
    refresh: function(frm) {

    },
    mfcl: function(frm) {
        if (frm.doc.mfcl === 1) {
            cur_frm.set_value("mfdf", 0);
        }
    },
    mfdf: function(frm) {
        if (frm.doc.mfdf === 1) {
            cur_frm.set_value("mfcl", 0);
        }
    },
    ht1: function(frm) {
        if (frm.doc.ht1 === 1) {
            cur_frm.set_value("em", 0);
        }
    },
    em: function(frm) {
        if (frm.doc.em === 1) {
            cur_frm.set_value("ht1", 0);
        }
    },
    customer: function(frm) {
        if (frm.doc.customer) {
            if (!locals.from_licence) {
                cur_frm.set_value("licence", null);
                cur_frm.set_value("licence_name", null);
            } else {
                locals.from_licence = false;
            }
        } else {
            cur_frm.set_value("customer_name", null);
            cur_frm.set_value("licence", null);
            cur_frm.set_value("licence_name", null);
        }
    },
    licence: function(frm) {
        if ((frm.doc.licence) && (!frm.doc.customer)) {
            frappe.call({
                'method': 'frappe.client.get',
                'args': {
                    'doctype': 'Licence',
                    'name': frm.doc.licence
                },
                'callback': function(response) {
                    var licence = response.message;
                    if (licence) {
                        locals.from_licence = true;
                        cur_frm.set_value("customer", licence.customer);
                        cur_frm.set_value("customer_name", licence.customer_name);
                    }
                }
            });
        }
    }
});
