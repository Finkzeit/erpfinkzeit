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
        // set only once password fields: lock if set
        if (frm.doc.project_pw) {
            cur_frm.set_df_property('project_pw', 'read_only', 1);
        }
        if (frm.doc.wavenet_pw) {
            cur_frm.set_df_property('wavenet_pw', 'read_only', 1);
        }
        if (frm.doc.lock_pw) {
            cur_frm.set_df_property('lock_pw', 'read_only', 1);
        }
        if (frm.doc.key_a) {
            cur_frm.set_df_property('key_a', 'read_only', 1);
        }
        if (frm.doc.key_b) {
            cur_frm.set_df_property('key_b', 'read_only', 1);
        }
        if (frm.doc.master_key) {
            cur_frm.set_df_property('master_key', 'read_only', 1);
        }
        if (frm.doc.app_master_key) {
            cur_frm.set_df_property('app_master_key', 'read_only', 1);
        }
        if (frm.doc.app_read_key) {
            cur_frm.set_df_property('app_read_key', 'read_only', 1);
        }
        // buttons
        frm.add_custom_button(__("Keys erzeugen"), function() {
            create_keys(frm);
        });
        frm.add_custom_button(__("Projekt-PW"), function() {
            copy_key(frm, 'project_pw');
        }, __("Keys"));
        frm.add_custom_button(__("Wavenet-PW"), function() {
            copy_key(frm, 'wavenet_pw');
        }, __("Keys"));
        frm.add_custom_button(__("Lock-PW"), function() {
            copy_key(frm, 'lock_pw');
        }, __("Keys"));
        frm.add_custom_button(__("Key A"), function() {
            copy_key(frm, 'key_a');
        }, __("Keys"));
        frm.add_custom_button(__("Key B"), function() {
            copy_key(frm, 'key_b');
        }, __("Keys"));
        frm.add_custom_button(__("Master Key"), function() {
            copy_key(frm, 'master_key');
        }, __("Keys"));
        frm.add_custom_button(__("App Master Key"), function() {
            copy_key(frm, 'app_master_key');
        }, __("Keys"));
        frm.add_custom_button(__("App Read Key"), function() {
            copy_key(frm, 'app_read_key');
        }, __("Keys"));
        
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

function create_keys(frm) {
    frappe.call({
        'method': 'create_keys',
        'doc': frm.doc,
        'callback': function(response) {
            cur_frm.refresh_fields();
            cur_frm.dirty();
        }
    });
}

function copy_key(frm, key) {
    frappe.call({
        'method': 'copy_key',
        'doc': frm.doc,
        'args': {
            'key': key
        },
        'callback': function(response) {
            navigator.clipboard.writeText(response.message).then(function() {
                frappe.show_alert("Key in der Zwischenablage");
              }, function() {
                 frappe.show_alert("Kein Zugriff auf Zwischenablage");
            });
        }
    });
}
