// Copyright (c) 2019-2022, Fink Zeitsysteme/libracore and contributors
// For license information, please see license.txt

frappe.ui.form.on('Parkordnung', {
	refresh: function(frm) {

	},
	user: function(frm) {
		if (!frm.doc.user) {
			cur_frm.set_value('user_name', null);
		}
	}
});
