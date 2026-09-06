# Compliance Persistence

Recommended tables:
- compliance_rules
- compliance_rule_versions
- regulatory_sources
- compliance_decisions
- compliance_alerts
- compliance_user_acknowledgements
- compliance_rule_tests

Enforce uniqueness of rule identity/version, effective-date consistency,
traceable sources, append-only decisions, and tenant/company isolation.
