# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: screenshots.spec.ts >> Automated UI Screen Capture Suite >> Captures screens at tablet-landscape in dark theme
- Location: e2e\screenshots.spec.ts:35:7

# Error details

```
Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e4]:
    - generic [ref=e12]:
      - heading "Wewala Super Store" [level=1] [ref=e13]
      - paragraph [ref=e14]: Retail Point of Sale System
    - generic [ref=e15]:
      - generic [ref=e16]:
        - generic [ref=e17]: Engineered for Speed & Accuracy
        - heading "Calm, trustworthy, sub-second checkout." [level=2] [ref=e19]
        - paragraph [ref=e20]: Precision integer arithmetic with PostgreSQL row-level security. Built for high-volume grocery and supermarket sales.
      - generic [ref=e21]:
        - generic [ref=e26]:
          - heading "Sub-100ms Barcode Scanning" [level=3] [ref=e27]
          - paragraph [ref=e28]: Barcode lookups, weighing scale inputs, and instant cash drawer triggers.
        - generic [ref=e34]:
          - heading "PostgreSQL Strict Hardening" [level=3] [ref=e35]
          - paragraph [ref=e36]: Tamper-evident audit logging, atomic shifts, and MFA security gates.
        - generic [ref=e42]:
          - heading "Byte-Perfect Thermal Printing" [level=3] [ref=e43]
          - paragraph [ref=e44]: Direct 80mm ESC/POS slips, A4 invoices, and Colombo timezone reconciliation.
    - generic [ref=e45]:
      - generic [ref=e46]: Wewala Stores POS • Wewala, Sri Lanka
      - generic [ref=e47]: Precision Engine v1.0
  - generic [ref=e48]:
    - button "Switch to Dark mode" [ref=e50] [cursor=pointer]
    - generic [ref=e53]:
      - generic [ref=e54]:
        - heading "Sign in to Terminal" [level=2] [ref=e55]
        - paragraph [ref=e56]: Enter your authorized staff credentials to begin your shift.
      - generic [ref=e57]: Postgres Row Level Security & Multi-Factor Protected
      - generic [ref=e62]: Incorrect email or password. (4 attempts remaining)
      - generic [ref=e66]:
        - generic [ref=e67]:
          - generic [ref=e68]: Staff Email Address
          - textbox "Staff Email Address" [ref=e70]:
            - /placeholder: cashier@wewala.lk
            - text: manager@wewala.lk
        - generic [ref=e71]:
          - generic [ref=e72]: Password
          - generic [ref=e73]:
            - textbox "Password" [ref=e74]:
              - /placeholder: ••••••••••
              - text: ManagerPass123!
            - button "Show password" [ref=e75] [cursor=pointer]
        - button "Sign In to Terminal" [ref=e80] [cursor=pointer]
      - generic [ref=e81]:
        - paragraph [ref=e82]: Quick Test Credentials
        - generic [ref=e83]:
          - button "Owner" [ref=e84] [cursor=pointer]
          - button "Manager" [ref=e85] [cursor=pointer]
          - button "Cashier" [ref=e86] [cursor=pointer]
    - generic [ref=e87]: Only authorized store operators may log in. All terminal actions are recorded in the immutable audit log.
```