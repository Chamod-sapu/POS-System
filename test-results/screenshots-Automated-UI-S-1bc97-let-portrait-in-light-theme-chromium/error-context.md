# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: screenshots.spec.ts >> Automated UI Screen Capture Suite >> Captures screens at tablet-portrait in light theme
- Location: e2e\screenshots.spec.ts:35:7

# Error details

```
Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=e4]:
  - button "Switch to Dark mode" [ref=e6] [cursor=pointer]
  - generic [ref=e9]:
    - generic [ref=e17]:
      - heading "Wewala Super Store" [level=1] [ref=e18]
      - paragraph [ref=e19]: Wewala POS Terminal
    - generic [ref=e20]:
      - heading "Sign in to Terminal" [level=2] [ref=e21]
      - paragraph [ref=e22]: Enter your authorized staff credentials to begin your shift.
    - generic [ref=e23]: Postgres Row Level Security & Multi-Factor Protected
    - generic [ref=e28]: Incorrect email or password. (4 attempts remaining)
    - generic [ref=e32]:
      - generic [ref=e33]:
        - generic [ref=e34]: Staff Email Address
        - textbox "Staff Email Address" [ref=e36]:
          - /placeholder: cashier@wewala.lk
          - text: manager@wewala.lk
      - generic [ref=e37]:
        - generic [ref=e38]: Password
        - generic [ref=e39]:
          - textbox "Password" [ref=e40]:
            - /placeholder: ••••••••••
            - text: ManagerPass123!
          - button "Show password" [ref=e41] [cursor=pointer]
      - button "Sign In to Terminal" [ref=e46] [cursor=pointer]
    - generic [ref=e47]:
      - paragraph [ref=e48]: Quick Test Credentials
      - generic [ref=e49]:
        - button "Owner" [ref=e50] [cursor=pointer]
        - button "Manager" [ref=e51] [cursor=pointer]
        - button "Cashier" [ref=e52] [cursor=pointer]
  - generic [ref=e53]: Only authorized store operators may log in. All terminal actions are recorded in the immutable audit log.
```