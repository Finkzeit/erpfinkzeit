// Copyright (c) 2023, Fink Zeitsysteme/libracore and contributors
// For license information, please see license.txt

frappe.ui.form.on('Transponder', {
    refresh: function(frm) {
        if (!frm.doc.__islocal) {
            // lock classic fields
            cur_frm.set_df_property('transponder_configuration', 'read_only', 1);
        }
    }
});
