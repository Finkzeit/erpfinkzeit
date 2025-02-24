frappe.listview_settings['Payment Proposal'] = {
    onload: function(listview) {
        listview.page.add_menu_item( __("Create Payment Return Proposal"), function() {
            create_payment_return_proposal();
        });
    }
}

function prepare_payment_return_proposal() {
    create_payment_return_proposal(frappe.defaults.get_default("Company")); 
}

function create_payment_proposal(date, company, currency) {
    frappe.call({
        "method": "finkzeit.finkzeit.credit_controller.create_payment_return_proposal",
        "args": { 
            "company": company
        },
        "callback": function(response) {
            if (response.message) {
                // redirect to the new record
                window.location.href = response.message;
            } else {
                // no records found
                frappe.show_alert( __("No suitable invoices found.") );
            }
        }
    });
}
