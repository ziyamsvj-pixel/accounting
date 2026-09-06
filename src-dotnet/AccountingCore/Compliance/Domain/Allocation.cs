namespace AccountingCore.Compliance.Domain;

public enum AllocationBasis
{
    RevenueRatio, AreaRatio, Headcount, ActualConsumption,
    CostCenter, Project, Custom
}

public sealed record AllocationResult(
    decimal TotalAmount,
    IReadOnlyDictionary<string, decimal> Allocations,
    AllocationBasis Basis,
    string RuleId,
    string RuleVersion);
