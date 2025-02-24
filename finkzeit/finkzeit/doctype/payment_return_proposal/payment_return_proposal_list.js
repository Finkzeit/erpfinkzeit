frappe.listview_settings['Payment Return Proposal'] = {
    onload: function(listview) {
        listview.page.add_menu_item( __("Create Payment Return Proposal"), function() {
            prepare_payment_return_proposal();
        });
    }
}

function prepare_payment_return_proposal() {
    create_payment_return_proposal(frappe.defaults.get_default("Company"), "3400"); 
}

function create_payment_return_proposal(company, account) {
    frappe.call({
        "method": "finkzeit.finkzeit.doctype.payment_return_proposal.payment_return_proposal.create_payment_return_proposal",
        "args": { 
            "company": company,
            "account": account
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
