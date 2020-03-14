/* add Rechtliches to supplier dashboard, only works for v11 and above */
try {
    cur_frm.dashboard.add_transactions([
        {
            'label': __('Rechtliches'),
            'items': ['Rechtliches Dokument']
        }
    ]);
} catch { /* do nothing for older versions */ }
