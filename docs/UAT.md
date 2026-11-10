# User Acceptance Testing (UAT) Runbook & Sign-Off Script

**Document Version:** 1.0  
**Store Location:** Wewala Super Store, Sri Lanka  
**Hardware Profile:** Standard Thermal Printer (80mm / 58mm ESC/POS), USB Barcode Scanner, Cash Drawer (RJ11), Weighing Scale.  
**Audience:** Shop Owner, Store General Manager, Quality Assurance Team.

---

## Instructions for the Shop Owner
1. Perform each scenario on the physical POS register in sequence.
2. Confirm that the **On-Screen Display**, **Physical Printed Receipt**, and **Cash Drawer** behave exactly as described.
3. Sign and date each scenario upon verification.
4. Any row marked **FAIL** must include the observed error and ticket reference.

---

## Printable Acceptance Testing Matrix (30 Scenarios)

| # | Scenario & Category | Exact Inputs & Settings | Expected Mathematical & Printing Output | Step-by-Step Operator Action | Result | Owner Sign & Date |
|---|---------------------|-------------------------|-----------------------------------------|------------------------------|--------|-------------------|
| **01** | **Single Discrete Item (Cash)** | 1x Sunlight Soap Bar 100g<br>Price: Rs. 150.00<br>Payment: Rs. 200.00 Cash | **Subtotal:** Rs. 150.00<br>**Total:** Rs. 150.00<br>**Tendered:** Rs. 200.00<br>**Change:** Rs. 50.00<br>Drawer kicks open. | 1. Scan barcode `8901030...`<br>2. Click Pay -> Enter 200 Cash<br>3. Confirm sale. | [ ] PASS<br>[ ] FAIL | _________________ |
| **02** | **Multiple Discrete Items** | 2x Anchor Butter 200g @ Rs. 850.00<br>1x Tea Leaves 400g @ Rs. 1,200.00<br>Payment: Rs. 3,000.00 Cash | **Gross:** Rs. 2,900.00<br>**Total:** Rs. 2,900.00<br>**Change:** Rs. 100.00<br>Receipt prints 2 lines. | 1. Add 2 Butter, 1 Tea<br>2. Tender Rs. 3,000 Cash<br>3. Check receipt printed neatly. | [ ] PASS<br>[ ] FAIL | _________________ |
| **03** | **Weighed Item (Fractional kg)** | Red Raw Rice @ Rs. 260.00/kg<br>Quantity: 1.750 kg<br>Payment: Exact Rs. 455.00 Cash | **Calc:** 1.750 x 260.00 = 455.00<br>**Total:** Rs. 455.00<br>**Change:** Rs. 0.00<br>Shows `1.750 kg x Rs. 260.00`. | 1. Search `Red Raw Rice`<br>2. In quantity popup, enter `1.750`<br>3. Pay Rs. 455.00. | [ ] PASS<br>[ ] FAIL | _________________ |
| **04** | **Complex Formula with Weighed Item & Tax** | 3x Biscuit @ Rs. 250.00<br>0.750 kg Chicken @ Rs. 1,299.99<br>5% Bill Discount<br>Tax: 18% Excluded | **Gross:** 750.00 + 975.00 = 1,725.00<br>**Bill Disc (5%):** Rs. 86.25<br>**Net:** Rs. 1,638.75<br>**Tax (18%):** Rs. 294.98<br>**Total:** Rs. 1,933.73 | 1. Add 3x Biscuit, 0.750 kg Chicken<br>2. Add 5% bill discount<br>3. Verify on-screen total Rs. 1,933.73. | [ ] PASS<br>[ ] FAIL | _________________ |
| **05** | **Cent Precision Edge Case (1/3 kg)** | Dhal @ Rs. 350.00/kg<br>Quantity: 0.333 kg<br>Payment: Exact cash | **Calc:** 0.333 x 350.00 = 116.55<br>**Total:** Rs. 116.55<br>Rounds half-up accurately to 116.55. | 1. Enter Dhal with `0.333`<br>2. Check line total is Rs. 116.55<br>3. Complete sale. | [ ] PASS<br>[ ] FAIL | _________________ |
| **06** | **Line Percentage Discount** | 1x Milk Powder @ Rs. 1,080.00<br>Line Discount: 10%<br>Payment: Card | **Gross:** Rs. 1,080.00<br>**Line Disc (10%):** Rs. 108.00<br>**Total:** Rs. 972.00<br>Receipt displays discount line. | 1. Scan milk powder<br>2. Select item -> Discount 10%<br>3. Pay via Card. | [ ] PASS<br>[ ] FAIL | _________________ |
| **07** | **Line Fixed Amount Discount** | 1x Washing Powder @ Rs. 650.00<br>Line Discount: Rs. 50.00<br>Payment: Cash Rs. 600.00 | **Gross:** Rs. 650.00<br>**Discount:** Rs. 50.00<br>**Total:** Rs. 600.00<br>Change: Rs. 0.00 | 1. Add item<br>2. Apply flat Rs. 50 discount<br>3. Complete cash payment. | [ ] PASS<br>[ ] FAIL | _________________ |
| **08** | **Cashier Forbidden Discount Guard** | 1x Fan @ Rs. 12,000.00<br>Cashier attempts 20% discount<br>(Cashier limit: 10%) | System blocks discount:<br>`Exceeds authorized limit (10%). Manager PIN required.` | 1. Login as cashier<br>2. Try adding 20% discount<br>3. Verify security rejection. | [ ] PASS<br>[ ] FAIL | _________________ |
| **09** | **Manager PIN Override for High Discount** | 1x Fan @ Rs. 12,000.00<br>Discount: 20% (Rs. 2,400.00)<br>Manager enters PIN | **Gross:** Rs. 12,000.00<br>**Discount:** Rs. 2,400.00<br>**Total:** Rs. 9,600.00<br>Audit log records manager override. | 1. Request manager PIN<br>2. Manager authorizes<br>3. Confirm total Rs. 9,600.00. | [ ] PASS<br>[ ] FAIL | _________________ |
| **10** | **Bill-Level Percentage Discount** | 2 items totaling Rs. 5,000.00<br>Bill Discount: 5%<br>Payment: Card | **Subtotal:** Rs. 5,000.00<br>**Bill Discount:** Rs. 250.00<br>**Total:** Rs. 4,750.00<br>Allocated proportionally across lines. | 1. Add items<br>2. Click Bill Discount -> 5%<br>3. Complete card transaction. | [ ] PASS<br>[ ] FAIL | _________________ |
| **11** | **Bill-Level Fixed Amount Discount** | 3 items totaling Rs. 4,000.00<br>Bill Discount: Rs. 500.00<br>Payment: Cash | **Subtotal:** Rs. 4,000.00<br>**Bill Discount:** Rs. 500.00<br>**Total:** Rs. 3,500.00<br>Largest-Remainder allocation. | 1. Add 3 items<br>2. Apply flat Rs. 500 bill discount<br>3. Verify line totals sum to 3,500. | [ ] PASS<br>[ ] FAIL | _________________ |
| **12** | **Tax Inclusive VAT (18%)** | 1x Blender @ Rs. 5,900.00 (tax incl.)<br>Tax Rate: 18% | **Taxable:** Rs. 5,000.00<br>**Tax (18% incl.):** Rs. 900.00<br>**Total:** Rs. 5,900.00<br>Receipt prints `VAT (18% incl.) Rs. 900.00`. | 1. Ensure shop setting is tax-inclusive<br>2. Ring up Blender<br>3. Verify tax breakdown on slip. | [ ] PASS<br>[ ] FAIL | _________________ |
| **13** | **Tax Exclusive VAT (18%)** | 1x Power Tool @ Rs. 10,000.00<br>Tax Rate: 18% exclusive | **Subtotal:** Rs. 10,000.00<br>**VAT (18% excl.):** Rs. 1,800.00<br>**Total:** Rs. 11,800.00<br>Total = Taxable + Tax. | 1. Set mode to tax-exclusive<br>2. Ring up tool<br>3. Verify bill total Rs. 11,800.00. | [ ] PASS<br>[ ] FAIL | _________________ |
| **14** | **Mixed Tax-Exempt & Taxable Lines** | 1x Rice (tax exempt) @ Rs. 500.00<br>1x Soap (taxable 18% excl.) @ Rs. 1,000.00 | **Taxable:** Rs. 1,000.00<br>**Tax (18%):** Rs. 180.00<br>**Total:** Rs. 1,680.00<br>Zero tax added to rice line. | 1. Add Rice and Soap<br>2. Check itemized line totals<br>3. Verify receipt shows tax-exempt line. | [ ] PASS<br>[ ] FAIL | _________________ |
| **15** | **Split Payment (Cash + Card)** | Cart Total: Rs. 4,500.00<br>Cash: Rs. 2,000.00<br>Card: Rs. 2,500.00 | **Total:** Rs. 4,500.00<br>**Paid:** Rs. 4,500.00<br>**Change:** Rs. 0.00<br>Receipt lists both payment types. | 1. In payment modal, select Split<br>2. Enter Cash 2,000 + Card 2,500<br>3. Complete checkout. | [ ] PASS<br>[ ] FAIL | _________________ |
| **16** | **Split Payment with Cash Change** | Cart Total: Rs. 3,750.00<br>Card: Rs. 2,000.00<br>Cash: Rs. 2,000.00 (Tendered) | **Total:** Rs. 3,750.00<br>**Paid:** Rs. 4,000.00<br>**Change:** Rs. 250.00<br>Change given on cash portion only. | 1. Charge Card 2,000<br>2. Tender Cash 2,000<br>3. Verify change display Rs. 250.00. | [ ] PASS<br>[ ] FAIL | _________________ |
| **17** | **Store Credit Payment** | Cart Total: Rs. 1,500.00<br>Customer Store Credit: Rs. 1,500.00 | **Total:** Rs. 1,500.00<br>**Store Credit Applied:** Rs. 1,500.00<br>Customer balance decreases. | 1. Attach Customer with credit<br>2. Select Store Credit payment<br>3. Confirm sale. | [ ] PASS<br>[ ] FAIL | _________________ |
| **18** | **Customer Loyalty Points Accrual** | Sale Total: Rs. 10,000.00<br>Customer: 077 123 4567<br>Rate: 1 pt per Rs. 100 | **Points Earned:** +100 pts<br>Receipt prints updated loyalty balance and masked phone `077****567`. | 1. Enter customer mobile<br>2. Complete Rs. 10,000 sale<br>3. Check receipt footer points. | [ ] PASS<br>[ ] FAIL | _________________ |
| **19** | **Rapid Barcode Scanner Input** | USB Barcode scanner input simulating hardware keystrokes + Enter | Item added immediately to cart in under 50ms without opening search dropdown. | 1. Focus scan input<br>2. Scan item barcode with handheld gun<br>3. Confirm immediate cart increment. | [ ] PASS<br>[ ] FAIL | _________________ |
| **20** | **Manual SKU and Partial Text Search** | Type `samba` or `RICE-01`<br>Keyboard navigate & select | Search dropdown displays live stock and price. Selecting item adds to cart. | 1. Type `samba`<br>2. Press ArrowDown -> Enter<br>3. Item adds to active cart. | [ ] PASS<br>[ ] FAIL | _________________ |
| **21** | **Reprint Duplicate Copy** | Open completed sale in Sales history -> Click Reprint | Physical receipt prints with bold `*** DUPLICATE COPY ***` at top and bottom. | 1. Go to Sales -> Open bill<br>2. Click Reprint<br>3. Inspect printed duplicate slip. | [ ] PASS<br>[ ] FAIL | _________________ |
| **22** | **Full Sale Return** | Return 1x Soap Bar (Rs. 150.00)<br>Customer brings original receipt | Original bill looked up via Code128 barcode scan. Stock increases by 1. Refund Rs. 150.00. | 1. Click Returns -> Scan bill barcode<br>2. Select return item<br>3. Refund cash Rs. 150.00. | [ ] PASS<br>[ ] FAIL | _________________ |
| **23** | **Partial Weighed Item Return** | Original sale: 2.000 kg Rice<br>Customer returns 0.500 kg | Stock restored by exactly `+0.500 kg`. Cash refund: `0.500 x 260.00 = Rs. 130.00`. | 1. Select original weighed line<br>2. Enter return qty `0.500`<br>3. Complete return refund. | [ ] PASS<br>[ ] FAIL | _________________ |
| **24** | **Void Sale (Cashier Shift Active)** | Manager voids incorrect bill `B-0012` within active shift | Bill status changed to `voided`. Stock restored to original batch. Audit log recorded. | 1. Open bill -> Click Void Sale<br>2. Manager enters reason & PIN<br>3. Check inventory restored. | [ ] PASS<br>[ ] FAIL | _________________ |
| **25** | **Cash Drawer Hardware Kick Trigger** | Cash sale checkout | Receipt printer sends ESC/POS pulse `ESC p 0 25 250` via RJ11 cable; drawer springs open. | 1. Perform cash sale<br>2. Observe drawer trigger<br>3. Confirm drawer opens reliably. | [ ] PASS<br>[ ] FAIL | _________________ |
| **26** | **Shift Open Float Validation** | Cashier opens register with Rs. 5,000.00 opening float | Opening float recorded. Register unlocked for sales. Shift report prints float slip. | 1. Enter float Rs. 5,000.00<br>2. Click Open Shift<br>3. Register opens successfully. | [ ] PASS<br>[ ] FAIL | _________________ |
| **27** | **Mid-Shift Cash Movement (Safe Drop)** | Cash Out: Rs. 20,000.00<br>Reason: `Transfer excess cash to store safe` | Expected drawer cash reduced by Rs. 20,000.00. Movement logged with cashier ID. | 1. In Shifts -> Click Cash Out<br>2. Enter 20000 + Reason<br>3. Confirm cash movement. | [ ] PASS<br>[ ] FAIL | _________________ |
| **28** | **Shift Close with Deliberate Rs. 50 Shortage** | Expected Cash: Rs. 14,250.00<br>Cashier counts: Rs. 14,200.00<br>Difference: -Rs. 50.00 | System prompts mandatory note when difference > Rs. 100. Discrepancy logged on Z-Report. | 1. Close shift -> Enter counted cash<br>2. Enter shortage explanation note<br>3. Print final shift report. | [ ] PASS<br>[ ] FAIL | _________________ |
| **29** | **Printer Paper-Out Recovery** | Paper roll runs out during printing | POS displays `Printer Out of Paper`. Cashier inserts roll and clicks Reprint. Sale intact. | 1. Remove paper roll<br>2. Click Pay (simulates out-of-paper)<br>3. Re-feed paper -> Click Reprint. | [ ] PASS<br>[ ] FAIL | _________________ |
| **30** | **SMS Receipt Delivery to Customer Mobile** | Mobile: `+94 77 123 4567`<br>Sale completed | SMS dispatched via gateway. Customer receives text with Shop Name, Bill No, Total & Link. | 1. Enter valid Sri Lankan mobile<br>2. Complete checkout<br>3. Verify delivery on mobile phone. | [ ] PASS<br>[ ] FAIL | _________________ |

---

## Final Acceptance Sign-Off

**Store Owner Name:** ________________________________________  
**Store Owner Signature:** ____________________________________  
**Date of Sign-off:** _________________________________________  
**POS System Software Version:** `v0.1.0-hardening-pass`  
**Overall Acceptance Status:** [ ] **ACCEPTED FOR PRODUCTION** &nbsp;&nbsp;&nbsp;&nbsp; [ ] **CONDITIONAL ACCEPTANCE**

