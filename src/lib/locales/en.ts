/**
 * English dictionary for Wewala POS
 * Keys structured hierarchically for clean translation into Sinhala (si) and Tamil (ta).
 */
export const en = {
  // Navigation & Shell
  'nav.pos': 'POS Terminal',
  'nav.sales': 'Sales & Bills',
  'nav.my_sales': 'My Sales',
  'nav.products': 'Products & Catalog',
  'nav.inventory': 'Inventory & Batches',
  'nav.customers': 'Customers & Credit',
  'nav.suppliers': 'Suppliers',
  'nav.purchasing': 'Purchases & Receiving',
  'nav.shifts': 'Cashier Shifts',
  'nav.reports': 'Reports & Z-Reports',
  'nav.settings': 'Shop Settings',
  'nav.staff': 'Staff Management',
  'nav.audit': 'Security Audit Log',
  'nav.lock': 'Lock Terminal',
  'nav.logout': 'Sign Out',

  // Status & Connectivity
  'status.online': 'Online',
  'status.offline': 'Offline',
  'status.connecting': 'Connecting...',
  'status.shift_open': 'Shift Active',
  'status.shift_closed': 'No Active Shift',
  'status.active': 'Active',
  'status.inactive': 'Inactive',

  // Common Actions
  'action.save': 'Save',
  'action.cancel': 'Cancel',
  'action.delete': 'Delete',
  'action.edit': 'Edit',
  'action.create': 'Create',
  'action.add': 'Add',
  'action.search': 'Search...',
  'action.filter': 'Filter',
  'action.clear': 'Clear',
  'action.close': 'Close',
  'action.confirm': 'Confirm',
  'action.retry': 'Retry',
  'action.print': 'Print Receipt',
  'action.hold_cart': 'Hold Cart',
  'action.resume_cart': 'Resume Cart',

  // Common Labels
  'label.total': 'Total',
  'label.subtotal': 'Subtotal',
  'label.discount': 'Discount',
  'label.tax': 'Tax',
  'label.cash': 'Cash',
  'label.card': 'Card',
  'label.change': 'Change Due',
  'label.quantity': 'Quantity',
  'label.price': 'Price',
  'label.sku': 'SKU',
  'label.barcode': 'Barcode',
  'label.name': 'Name',
  'label.phone': 'Phone Number',
  'label.role': 'Role',
  'label.date': 'Date',

  // Empty & Error States
  'empty.no_data': 'No records found',
  'empty.no_results': 'No results match your search',
  'error.general': 'An unexpected error occurred. Please try again.',
  'error.not_found_title': 'Page Not Found',
  'error.not_found_desc': 'The requested POS page does not exist or has been moved.',
  'error.not_found_btn': 'Return to POS Terminal',
  'error.unauthorized_title': 'Not Authorised',
  'error.unauthorized_desc': 'You do not have permission to view this section.',
} as const;

export type TranslationKey = keyof typeof en;

