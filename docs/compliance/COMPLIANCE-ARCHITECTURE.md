# Compliance Architecture

Transaction -> Classification -> Applicable Rules -> Evaluation -> Alert/Education
-> User Decision -> Audit Trail

Bounded contexts:
- Accounting Standards
- Auditing Controls
- Direct Tax
- VAT
- Moadian / e-invoicing
- Withholding
- Regulatory sources

Rule severity:
- INFORMATIONAL
- WARNING
- BLOCKING

A blocking rule is allowed only when a verified mandatory prerequisite exists.
Historical decisions retain the rule version used.
