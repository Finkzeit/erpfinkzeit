frappe.listview_settings['Purchase Invoice'] = {
    add_fields: ["supplier", "supplier_name", "base_grand_total", "outstanding_amount", "due_date", "company",
        "currency", "is_return", "release_date", "on_hold"],
    get_indicator: function(doc) {
        if ((doc.is_proposed) && (flt(doc.outstanding_amount) !== 0) && (doc.docstatus==1)) {
            if ((doc.payment_terms_terms_template || "").includes("Einzug")) {
                return [__("im Einzug"), "green", `is_proposed,=,1`];
            } else {
                return [__("in Zahlungslauf"), "green", `is_proposed,=,1`];
            }
        } else {
            if(flt(doc.outstanding_amount) < 0 && doc.docstatus == 1) {
                return [__("Debit Note Issued"), "darkgrey", "outstanding_amount,<,0"]
            } else if(flt(doc.outstanding_amount) > 0 && doc.docstatus==1) {
                if(cint(doc.on_hold) && !doc.release_date) {
                    return [__("On Hold"), "darkgrey"];
                } else if(cint(doc.on_hold) && doc.release_date && frappe.datetime.get_diff(doc.release_date, frappe.datetime.nowdate()) > 0) {
                    return [__("Temporarily on Hold"), "darkgrey"];
                } else if(frappe.datetime.get_diff(doc.due_date) < 0) {
                    return [__("Overdue"), "red", "outstanding_amount,>,0|due_date,<,Today"];
                } else {
                    return [__("Unpaid"), "orange", "outstanding_amount,>,0|due,>=,Today"];
                }
            } else if(cint(doc.is_return)) {
                return [__("Return"), "darkgrey", "is_return,=,Yes"];
            } else if(flt(doc.outstanding_amount)==0 && doc.docstatus==1) {
                return [__("Paid"), "green", "outstanding_amount,=,0"];
            }
        }
    }
};
