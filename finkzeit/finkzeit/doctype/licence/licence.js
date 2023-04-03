// Copyright (c) 2018-2022, Fink Zeitsysteme/libracore and contributors
// For license information, please see license.txt

frappe.ui.form.on('Licence', {
    refresh: function(frm) {
        if (!frm.doc.__islocal) {
            frm.add_custom_button(__("Create Licence File"), function() {
                generate_licence_file(frm);
            });
            frm.add_custom_button(__("Create Invoice"), function() {
                create_invoice(frm);
            });
        }
        
        // filter for all-in support items
        cur_frm.fields_dict['all_in_item'].get_query = function(doc) {
            return {
                filters: {
                    "is_all_in_support": 1
                }
            }
        }
    },
    validate: function(frm) {
        // check valid invoices per year
        if (!([1,2,4,6,12].includes(frm.doc.invoices_per_year))) {
            // not valid invoice period
            frappe.msgprint(__("Invalid invoice period. Should be 1, 2, 4, 6 or 12") );
            frappe.validated = false;
        }
    },
    before_save: function(frm) {
        update_totals(frm);
        
        // check all in status
        update_all_in(frm);
        update_totals(frm);
    },
    all_in_discount: function(frm) {
        update_totals(frm);
    },
    print_all_in_info: function(frm) {
        if (!locals.prevent_loop) {
            locals.prevent_loop = true;
            if (frm.doc.print_all_in_info) {
                cur_frm.set_value('enable_all_in', 0);
            } else {
                cur_frm.set_value('enable_all_in', 1);
            }
        } else {
            locals.prevent_loop = null;
        }
    },
    enable_all_in: function(frm) {
        if (!locals.prevent_loop) {
            locals.prevent_loop = true;
            if (frm.doc.print_all_in_info) {
                cur_frm.set_value('print_all_in_info', 0);
            } else {
                cur_frm.set_value('print_all_in_info', 2);
            }
        } else {
            locals.prevent_loop = null;
        }
    },
    
});

function generate_licence_file(frm) {
    frappe.call({
        'method': 'generate_licence_file',
        'doc': frm.doc,
        'callback': function(r) {
            if (r.message) {
                // prepare the xml file for download
                download("licence.yaml", r.message.content);
            } 
        }
    });
}
            
function download(filename, content) {
  var element = document.createElement('a');
  element.setAttribute('href', 'data:application/octet-stream;charset=utf-8,' + encodeURIComponent(content));
  element.setAttribute('download', filename);

  element.style.display = 'none';
  document.body.appendChild(element);

  element.click();

  document.body.removeChild(element);
}

// this function will manually trigger the invoice creation for the selected licence
function create_invoice(frm) {
    frappe.confirm(
        'Are you sure that you want to create the invoice(s) for the current period?',
        function(){
            // yes
            frappe.call({
                'method': 'finkzeit.finkzeit.doctype.licence.licence.process_licence',
                'args': {
                        licence_name: frm.doc.name
                },
                'callback': function(r) {
                    if (r.message) {
                        frappe.msgprint( __("Invoice(s) created: ") + r.message);
                    }
                }
            });
        },
        function(){
            // no
        }
    )
}

function update_all_in(frm) {
    if (frm.doc.enable_all_in === 1) {
        // remove duplicate all-in-items
        var occurrence = 0;
        for (var i = frm.doc.invoice_items.length - 1; i >= 0; i--) {
            if (frm.doc.invoice_items[i].item_code === frm.doc.all_in_item) {
                if (occurrence === 0) {
                    occurrence++;
                } else {
                    cur_frm.get_field("invoice_items").grid.grid_rows[i].remove();
                }
            }
        }
        var child;
        if (occurrence === 0) {
            // insert item
            child = cur_frm.add_child('invoice_items');
            frappe.model.set_value(child.doctype, child.name, 'item_code', frm.doc.all_in_item);
        } else {
            // update item
            for (var i = 0; i < frm.doc.invoice_items.length; i++) {
                if (frm.doc.invoice_items[i].item_code === frm.doc.all_in_item) {
                    child = frm.doc.invoice_items[i];
                }
            }
        }
        frappe.model.set_value(child.doctype, child.name, 'qty', 1);
        frappe.model.set_value(child.doctype, child.name, 'rate', frm.doc.all_in_rate);
        frappe.model.set_value(child.doctype, child.name, 'discount', frm.doc.all_in_discount);
        frappe.model.set_value(child.doctype, child.name, 'amount', frm.doc.final_all_in_rate);
        frappe.model.set_value(child.doctype, child.name, 'all_in', 0);

    } else {
        // remove all-in item(s)
        for (var i = frm.doc.invoice_items.length - 1; i >= 0; i--) {
            if (frm.doc.invoice_items[i].item_code === frm.doc.all_in_item) {
                cur_frm.get_field("invoice_items").grid.grid_rows[i].remove();
            }
        }
    }
    cur_frm.refresh_field('invoice_items');
    cur_frm.refresh();
}

/* child table triggers */
frappe.ui.form.on('Licence Item', {
    qty: function(frm, cdt, cdn) {
        update_totals(frm);
    },
    rate: function(frm, cdt, cdn) {
        update_totals(frm);
    },
    discount: function(frm, cdt, cdn) {
        update_totals(frm);
    },
    all_in: function(frm, cdt, cdn) {
        update_totals(frm);
    },
    invoice_items_remove: function(frm, cdt, cdn) {
        update_totals(frm);
    }
});

function update_totals(frm) {
    var total_amount = 0.0;
    var calculation_base = 0.0;
    for (var i = 0; i < frm.doc.invoice_items.length; i++) {
        var item_amount = parseFloat(frm.doc.invoice_items[i].qty || 0) 
            * parseFloat((frm.doc.invoice_items[i].rate || 0) * ((100.0 - parseFloat(frm.doc.invoice_items[i].discount || 0)) / 100.0));
        frappe.model.set_value(frm.doc.invoice_items[i].doctype, frm.doc.invoice_items[i].name, 'amount', item_amount);
        total_amount += item_amount;
        if (!frm.doc.invoice_items[i].group) {
            frappe.model.set_value(frm.doc.invoice_items[i].doctype, frm.doc.items[i].name, 'group', 'empty');
        }
        if (frm.doc.invoice_items[i].all_in === 1) {
            calculation_base += item_amount;
        }
    }
    cur_frm.set_value('total_amount', total_amount);
    cur_frm.set_value('total_amount_with_discount', total_amount * ((100.0 - parseFloat(cur_frm.doc.overall_discount || 0)) / 100.0));
    cur_frm.set_value('calculation_base', calculation_base);
    var all_in_fraction = frm.doc.param_a * Math.pow(calculation_base, frm.doc.param_e);
    cur_frm.set_value('all_in_percent', 100 * all_in_fraction);
    var all_in_rate = calculation_base * all_in_fraction;
    cur_frm.set_value('all_in_rate', all_in_rate);
    cur_frm.set_value('final_all_in_rate', all_in_rate * (100 - parseFloat(frm.doc.all_in_discount || 0)) / 100);
}
