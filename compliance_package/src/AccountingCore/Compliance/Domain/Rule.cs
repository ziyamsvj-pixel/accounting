namespace AccountingCore.Compliance.Domain;

public enum RuleSeverity { Informational, Warning, Blocking }
public enum RuleStatus { Draft, Reviewed, Approved, Active, Superseded, Retired }

public sealed record ComplianceRule(
    string RuleId,
    string Version,
    string Authority,
    string SourceType,
    string SourceReference,
    DateOnly EffectiveFrom,
    DateOnly? EffectiveTo,
    RuleSeverity Severity,
    RuleStatus Status,
    int Priority,
    string Explanation);
