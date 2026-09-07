# Regulatory Source Registry

Recommended fields:

`SourceId`, `Authority`, `DocumentType`, `DocumentNumber`, `Title`, `IssueDate`, `EffectiveDate`, `ExpiryDate`, `Version`, `OfficialReference`, `OfficialUrl`, `ContentHash`, `Status`, `VerificationDate`, `VerifiedBy`, `ApplicabilityScope`.

## Primary and official sources

| Source ID | Authority | Official source | Applicability | Use in catalog |
|---|---|---|---|---|
| IR-LAW | سامانه ملی قوانین و مقررات جمهوری اسلامی ایران | [qavanin.ir](https://qavanin.ir/) | Laws and regulations | Primary legal text and article reference |
| IR-AOI | سازمان حسابرسی | [audit.org.ir](https://audit.org.ir/) | Accounting and auditing standards | Standard number, edition and effective date |
| IR-INTA-MEDIA | سازمان امور مالیاتی کشور | [intamedia.ir](https://www.intamedia.ir/) | Tax notices, instructions and official announcements | Circular or notice identifier and version |
| IR-INTA-DOCS | سازمان امور مالیاتی کشور | [inta.tax.gov.ir/Pages/Action/LastDocs/1](https://inta.tax.gov.ir/Pages/Action/LastDocs/1) | Tax circulars and documents | Official document reference and publication date |
| IR-TAX-PORTAL | سازمان امور مالیاتی کشور | [tax.gov.ir](https://tax.gov.ir/) | Taxpayer services and operational tax workflows | Operational reference; not a substitute for legal text |
| IR-SEO | سازمان بورس و اوراق بهادار | [seo.ir](https://seo.ir/) | Listed companies and regulated capital-market entities | Conditional reporting and disclosure rules |
| IR-CODAL | سامانه کدال | [codal.ir](https://www.codal.ir/) | Issuer disclosures and published financial reports | Operational/disclosure evidence; not a substitute for the issuing authority’s rule |

## Source policy

Prefer official primary sources. Secondary professional bodies, accounting associations and explanatory articles may be used for discovery and cross-checking only; they must not become the sole authority for an active rule.

A rule may enter the active catalog only when its authority, document number or article, official URL or archived official document, version, effective period, verification date and reviewer are recorded. If an official page is unavailable or blocks automated extraction, retain the URL but mark the source `PendingVerification`; do not infer or generate the legal text.

SEO and CODAL are conditional sources: include them only when the product serves listed companies or capital-market reporting. The tax portal is useful for workflow and operational references, while substantive legal requirements must still point to the law, regulation, circular or official instruction.
