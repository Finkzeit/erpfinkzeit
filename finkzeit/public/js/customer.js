/* add Rechtliches to supplier dashboard, only works for v11 and above */
try {
    cur_frm.dashboard.add_transactions([
        {
            'label': __('Rechtliches'),
            'items': ['Rechtliches Dokument']
        }
    ]);
} catch { /* do nothing for older versions */ }

frappe.ui.form.on('Customer', {
	refresh(frm) {
        check_credit_balance(frm);
	}
});

function check_credit_balance(frm) {
    if (!frm.doc.__islocal) {
        frappe.call({
        	method: 'finkzeit.finkzeit.credit_controller.get_credit_account_balance',
        	args: {
        		customer: frm.doc.name
        	},
        	callback: function(r) {
        		if (r.message) {
                    frm.add_custom_button((__("Customer credit") + ": EUR " + r.message.toLocaleString()), function() {
                        frappe.set_route("query-report", "Customer Credit Ledger", {"customer": frm.doc.name});
                    });
        		} 
        	}
        });
    }
    

}
