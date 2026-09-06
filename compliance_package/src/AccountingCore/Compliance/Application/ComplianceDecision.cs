namespace AccountingCore.Compliance.Application;

public sealed record ComplianceDecision(
    string RuleId,
    string RuleVersion,
    string Outcome,
    string Explanation,
    bool RequiresUserAcknowledgement,
    bool IsBlocking);
