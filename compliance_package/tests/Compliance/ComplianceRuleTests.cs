using AccountingCore.Compliance.Domain;
using Xunit;

namespace AccountingCore.Compliance.Tests;

public class ComplianceRuleTests
{
    [Fact]
    public void Rule_version_is_preserved()
    {
        var rule = new ComplianceRule(
            "COM-TAX-EXP-001", "1", "Official Authority",
            "Regulation", "SOURCE-001",
            new DateOnly(2026, 3, 21), null,
            RuleSeverity.Warning, RuleStatus.Active, 100,
            "Shared expense allocation");

        Assert.Equal("1", rule.Version);
    }
}
