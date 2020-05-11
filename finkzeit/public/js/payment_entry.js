frappe.ui.form.on('Payment Entry', {
	refresh(frm) {
        get_customer_credit_balance(frm);
	},
	party(frm) {
	    get_customer_credit_balance(frm);
	}
});

function get_customer_credit_balance(frm) {
	if ((frm.doc.docstatus === 0) && (frm.doc.party_type === "Customer") && (frm.doc.party)) {
	    frappe.call({
        	method: 'finkzeit.finkzeit.credit_controller.get_credit_account_balance',
        	args: {
        		customer: frm.doc.party
        	},
        	callback: function(r) {
        		if (r.message) {
        			cur_frm.set_df_property('customer_credit_html','options',"<p>" + __("Customer credit balance") + ": EUR " + r.message.toLocaleString() + "</p>");
        		} else {
        		    cur_frm.set_df_property('customer_credit_html','options',"<p></p>");
        		}
        	}
        });
	} else {
	    cur_frm.set_df_property('customer_credit_html','options',"<p></p>");
	}
}
