frappe.pages['sales_dashboard'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __('Sales Dashboard'),
        single_column: true
    });

    frappe.sales_dashboard.make(page);
    frappe.sales_dashboard.run("", new Date().getFullYear() + "-12-31");
    
    // add the application reference
    frappe.breadcrumbs.add("Finkzeit");
}

frappe.sales_dashboard = {
    start: 0,
    make: function(page) {
        var me = frappe.sales_dashboard;
        me.page = page;
        me.body = $('<div></div>').appendTo(me.page.main);
        var data = "";
        $(frappe.render_template('sales_dashboard', data)).appendTo(me.body);
        // enable KST-switcher for System Manager
        if ((frappe.user.has_role("System Manager")) || (frappe.user.has_role("Verwaltungsrat"))) {
            var kst_switcher = document.getElementById("kst-switcher");
            if (kst_switcher) {
                kst_switcher.style.visibility = "visible";
                // attach change handler
                kst_switcher.addEventListener('change', function() {
                    console.log("Loading " + kst_switcher.value);
                    frappe.sales_dashboard.run(kst_switcher.value, fiscal_year_switcher.value + "-12-31");
                });
            }
        }
        // add fiscal year switcher
        var fiscal_year_switcher = document.getElementById("fiscal_year");
        if (fiscal_year_switcher) {
            // attach change handler
            fiscal_year_switcher.addEventListener('change', function() {
                console.log("Loading " + fiscal_year_switcher.value);
                frappe.sales_dashboard.run(kst_switcher.value, fiscal_year_switcher.value + "-12-31");
            });
        }
        // populate fiscal years
        frappe.call({
            method: 'finkzeit.finkzeit.page.sales_dashboard.sales_dashboard.get_fiscal_years',
            callback: function(r) {
                if (r.message) {
                    var select = document.getElementById("fiscal_year");
                    for (var i = 0; i < r.message.fiscal_years.length; i++) {
                        var opt = document.createElement("option");
                        opt.value = r.message.fiscal_years[i];
                        opt.innerHTML = r.message.fiscal_years[i];
                        select.appendChild(opt);
                    }
                } 
            }
        }); 
    },
    run: function(filter, date) {
        // get cashflows
        frappe.call({
            method: 'finkzeit.finkzeit.page.sales_dashboard.sales_dashboard.get_cashflow_for_user',
            args: {
                'user': frappe.user.name,
                'filter': filter,
                'date': date
            },
            callback: function(r) {
                if (r.message) {
                    try {
                        console.log(r.message.toSource());
                    } catch { console.log("debug only available in Firefox"); }
                    // create chart
                    frappe.sales_dashboard.make_chart(r.message.cashflows);
                    // create KPIs
                    var revenue_container = document.getElementById("revenue-placeholder");
                    var content = frappe.render_template('kpi', r.message.cashflows.revenue);
                    revenue_container.innerHTML = content;
                    var expenses_container = document.getElementById("expenses-placeholder");
                    var content = frappe.render_template('kpi', r.message.cashflows.expenses);
                    expenses_container.innerHTML = content;
                    var profit_container = document.getElementById("profit-placeholder");
                    var content = frappe.render_template('kpi', r.message.cashflows.profit);
                    profit_container.innerHTML = content;                    
                    // control: show cost center
                    var kst_container = document.getElementById("kst-placeholder");
                    kst_container.innerHTML = r.message.cashflows.cost_center;
                } 
            }
        }); 

        // get documents
        frappe.call({
            method: 'finkzeit.finkzeit.page.sales_dashboard.sales_dashboard.get_documents_for_user',
            args: {
                'user': frappe.user.name,
                'filter': filter,
                'date': date
            },
            callback: function(r) {
                if (r.message) {
                    try {
                        console.log(r.message.toSource());
                    } catch { console.log("debug only available in Firefox"); }
                    // create document card
                    var documents_container = document.getElementById("documents-placeholder");
                    var content = frappe.render_template('docs', r.message.documents);
                    documents_container.innerHTML = content;
                }
            }
        });

        // get service shares
        frappe.call({
            method: 'finkzeit.finkzeit.page.sales_dashboard.sales_dashboard.get_service_share_for_user',
            args: {
                'user': frappe.user.name,
                'filter': filter,
                'date': date
            },
            callback: function(r) {
                if (r.message) {
                    try {
                        console.log(r.message.toSource());
                    } catch { console.log("debug only available in Firefox"); }
                    // create service share card
                    var service_share_container = document.getElementById("service-share-placeholder");
                    var content = frappe.render_template('svc', r.message.shares);
                    service_share_container.innerHTML = content;
                }
            }
        });
    },
    make_chart: function(cashflows) {
        const chart = new frappe.Chart( "#main-chart", { 
            data: {
                labels: ["Jan", "Feb", "Mär", "Apr",
                    "Mai", "Jun", "Jul", "Aug",
                    "Sep", "Okt", "Nov", "Dez"],

                datasets: [
                    {
                        name: __("Revenue YTD"), chartType: 'line',
                        values: cashflows.monthly_revenue_ytd
                    },
                                        {
                        name: __("Revenue PY"), chartType: 'line',
                        values: cashflows.monthly_revenue_py
                    },
                                        {
                        name: __("Expenses YTD"), chartType: 'line',
                        values: cashflows.monthly_expenses_ytd
                    },
                                        {
                        name: __("Expenses PY"), chartType: 'line',
                        values: cashflows.monthly_expenses_py
                    }
                ],

                /*yMarkers: [{ label: "Marker", value: 70, options: { labelPos: 'left' }}], */
                /*yRegions: [{ label: "Region", start: -10, end: 50, options: { labelPos: 'right' }}] */
            },
            type: 'line', 
            height: 300,
            colors: ['#229954', '#7DCEA0', '#CB4335', '#F1948A'],

            tooltipOptions: {
                formatTooltipX: d => (d + '').toUpperCase(),
                formatTooltipY: d => d + ' EUR',
            }
        });
        
        setTimeout(function() { chart.draw(!0)}, 1);
    }
}
