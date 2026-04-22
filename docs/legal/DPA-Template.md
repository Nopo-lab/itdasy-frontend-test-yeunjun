# Data Processing Agreement (DPA) — Template (GDPR Art. 28)

**Version:** 1.0 · **Effective:** 2026-04-22

This Data Processing Agreement ("DPA") forms part of the Terms of Service between:

- **Controller:** [Salon owner / customer name], acting on behalf of their end-customers whose personal data is entered into the Service.
- **Processor:** Y2do ("Itdasy"), Business Registration No. 179-36-01681, Republic of Korea.

The DPA applies only when the Controller processes personal data of natural persons (end-customers) located in the EU/EEA, UK, or other jurisdictions requiring a written processor agreement.

---

## 1. Subject Matter and Duration
Processing of personal data of the Controller's end-customers for the sole purpose of providing the Itdasy service (customer management, bookings, revenue tracking, AI-augmented assistance). Duration coincides with the term of the Controller's subscription, terminating upon account deletion.

## 2. Nature and Purpose of Processing
- Storage, retrieval, organization, analysis, and display of customer records entered by the Controller.
- Generation of derivative data (captions, retention risk scores, booking reminders) on Controller's behalf.
- Transmission of pseudonymized records to AI providers as instructed.

## 3. Categories of Data Subjects
End-customers of the Controller's beauty salon business.

## 4. Categories of Personal Data
Name, phone (optional), birthday (MM-DD optional), visit history, memos (Controller-entered free text), revenue transactions, NPS responses, photos (optional).

## 5. Controller Obligations
- Obtain valid consent from data subjects before entering their data.
- Provide notice to data subjects of the cross-border transfer and AI processing disclosed in Itdasy's Privacy Policy.
- Instruct the Processor only in writing or via app settings; changes take effect upon configuration.

## 6. Processor Obligations (Art. 28(3))
Processor shall:

- (a) Process personal data only on documented instructions of the Controller, including regarding transfers, unless required by Union or Member-State law (in which case the Processor shall inform the Controller unless prohibited by law).
- (b) Ensure personnel authorized to process personal data are under a duty of confidentiality.
- (c) Implement appropriate technical and organizational measures (see Section 9).
- (d) Respect the conditions for engaging sub-processors (Section 7).
- (e) Assist the Controller in responding to data subject requests (Art. 15–22).
- (f) Assist the Controller in compliance with Art. 32–36 (security, breach notification, DPIA).
- (g) Upon termination, delete or return all personal data, at the Controller's choice.
- (h) Make available all information necessary to demonstrate compliance and allow for audits once per year (reasonable notice).

## 7. Sub-processors (Art. 28(4))
Controller grants general authorization for the following sub-processors, subject to 30-day advance notice of material changes:

| Sub-processor | Location | Purpose |
|---|---|---|
| Google LLC | US | Gemini AI (pseudonymized inputs only) |
| Meta Platforms, Inc. | US/IE | Instagram API (OAuth, publishing) |
| Railway App, Inc. | US | Application hosting |
| Supabase, Inc. | US | Managed Postgres + storage |
| Cloudflare, Inc. | US | CDN, R2 object storage (optional) |
| Replicate, Inc. / Remove.bg | US/DE | AI image background removal |
| Sentry (Functional Software, Inc.) | US | Error monitoring (opt-in, PII-scrubbed) |

Processor will impose equivalent data protection obligations on each sub-processor through written contracts (SCCs where applicable).

## 8. International Transfers (Art. 46)
Where data flows outside the EU/EEA/UK, the Processor relies on:
- The 2021 EU Standard Contractual Clauses (Module 2 or 3 as applicable) with US sub-processors.
- South Korea adequacy decision (2021) for transfers to the Processor's home jurisdiction.
- Supplementary measures: TLS 1.2+ in transit, encryption at rest, pseudonymization of customer identifiers before AI provider calls, least-privilege access.

## 9. Security of Processing (Art. 32)
- bcrypt for password hashing; Fernet (AES) for Instagram tokens.
- HTTPS/TLS enforced on every endpoint.
- Multi-tenant isolation by user_id on every query.
- Audit logs retained 90 days.
- Incident response playbook; breach notification within 72 hours.
- Annual review of measures.

## 10. Data Subject Rights Support
Processor exposes the following endpoints/features to assist the Controller and data subjects:
- In-app account deletion (Art. 17) — `DELETE /auth/delete-account`
- Data portability (Art. 20) — `GET /data-export/{json|csv}`
- Rectification via Controller's edit screens
- Objection to AI processing via Settings → AI disable (consent withdrawal)
- Content reporting — `POST /moderation/report` (24-hour SLA)

## 11. Breach Notification (Art. 33)
Processor will notify Controller without undue delay (and in any event within 48 hours) after becoming aware of a personal data breach, providing the information reasonably available at the time.

## 12. Audits
Processor shall make available to Controller, upon reasonable written request, documentation demonstrating compliance. Third-party audits are limited to once per calendar year and are at the requesting party's expense. On-site audits are replaced by written responses where reasonable.

## 13. Return/Deletion upon Termination
Upon termination of the principal agreement, Processor shall, at Controller's choice, return or delete all personal data within 30 days, unless Union or Member-State law requires storage. Certified deletion statement will be issued on request.

## 14. Liability, Governing Law
This DPA is governed by the laws of the Republic of Korea, without prejudice to mandatory EU/UK law. For EU/UK consumers, the mandatory rules of the Member State of habitual residence prevail where applicable.

## 15. Order of Precedence
In case of conflict between this DPA and the Terms of Service, this DPA prevails with respect to the processing of personal data.

---

**Signed / Accepted (electronic acceptance upon subscription):**
- Controller: [Name / Business]
- Processor: Y2do — Yeonjun Kang (CEO)
- Effective: [Subscription Start Date]

_This template is executable upon request by enterprise customers; contact contact@itdasy.com._
