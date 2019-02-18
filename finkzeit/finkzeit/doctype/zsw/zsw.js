// Copyright (c) 2019, Fink Zeitsysteme/libracore and contributors
// For license information, please see license.txt

frappe.ui.form.on('ZSW', {
	refresh: function(frm) {
            /* add as custom script to make use of the tenant parameter
            frm.add_custom_button(__("Create ZSW Invoices"), function() {
                create_zsw_invoices(frm);
            }); */
	}
});

function create_zsw_invoices(frm) {
    var d = new frappe.ui.Dialog({
        'fields': [
            {'fieldname': 'from_date', 'fieldtype': 'Date', 'label': __('From Date'), 'reqd': 1},
            {'fieldname': 'to_date', 'fieldtype': 'Date', 'label': __('To Date'), 'reqd': 1},
            {'fieldname': 'kst', 'fieldtype': 'Link', 'options': 'Cost Center', 'label': __('Cost Center')},
            {'fieldname': 'service_type', 'fieldtype': 'Data', 'label': __("Service Type (T01, T02)")}
        ],
        primary_action: function(){
            d.hide();
            var values = d.get_values();
            console.log(values.toSource());
            enqueue_create_invoices(d.get_values());
        },
        primary_action_label: __('Create Invoices')
    });
    d.show();
}

function enqueue_create_invoices(from_date, to_date, kst_filter, service_filter) {
    frappe.call({
        "method": "finkzeit.finkzeit.zsw.enqueue_create_invoices",
        "args": {
            'tenant': 'AT',
            'from_date': from_date,
            'to_date': to_date,
            'kst_filter': kst_filter,
            'service_filter': service_filter)
        },
        "callback": function(response) {
            frappe.show_alert( __("ZSW invoice creation started") );
        }
    });
}
