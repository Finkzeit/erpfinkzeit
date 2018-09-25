frappe.listview_settings['Licence'] = {
    onload: function(listview) {
        listview.page.add_menu_item( __("Create Invoice Cycle"), function() {
            create_invoice_cycle();
        });
    }
}

function create_invoice_cycle() {
    frappe.call({
        "method": "finkzeit.finkzeit.doctype.licence.licence.enqueue_invoice_cycle",
        "callback": function(response) {
            frappe.show_alert( __("Creation of Invoices started...") );
        }
    });
}
