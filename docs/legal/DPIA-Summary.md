# Data Protection Impact Assessment (DPIA) — Summary

**Required by:** GDPR Art. 35 / UK GDPR Art. 35 / LGPD Art. 38
**Completed:** 2026-04-22 · **Version:** 1.0 · **Reviewer:** Y2do DPO-equivalent (Yeonjun Kang)

---

## 1. Context

Itdasy is an AI-augmented CRM for 1-person beauty salons. While our core processing is relatively low-risk (business contact data entered by salon owners about their own customers), the use of generative AI combined with customer data triggers a formal DPIA out of an abundance of caution.

## 2. Processing Operations and Purposes

| Operation | Purpose | Category |
|---|---|---|
| Store customer contact records | Enable CRM features | Contact info |
| Store booking/revenue records | Business tracking | Commercial info |
| Pseudonymize + send to Google Gemini | Caption/chat AI | Special — involves AI |
| Upload photos | Portfolio display | User content |
| Retention risk scoring | Alert for churn | Inference / profiling (limited) |

## 3. Necessity and Proportionality

- Processing is necessary to deliver contracted services.
- Data minimization: only name + phone (optional) + memos required; we collect no IDs, SSNs, passports, biometrics.
- Storage limitation: deletion on account close; legal retention limited to tax/consumer-law minimums.
- Purpose limitation: no secondary uses; no sharing for marketing.

## 4. Risks and Mitigations

| Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|
| Customer names leak via AI provider | Low | Medium | **Pseudonymization** of names to "Customer#N" before API call; AI input not used for model training per Gemini Terms |
| Multi-tenant data bleed | Low | High | user_id filter on every query, integration tests |
| Token theft via MITM | Low | High | HTTPS/TLS 1.2+, HSTS, short-lived JWT (30 days) + blacklist on delete |
| Unauthorized admin access | Low | High | 2FA for admins, IP allowlist for DB |
| AI generates harmful output | Low | Medium | Gemini safety_settings BLOCK_MEDIUM_AND_ABOVE; in-app 🚩 report; 24-hour human review SLA |
| Child data collection | Low | High | Age gate 14+; parental consent flow for younger if required by jurisdiction |
| Cross-border transfer challenges | Medium | Medium | EU adequacy decision for KR; SCCs for US processors; encryption; pseudonymization |
| Backup / exfiltration | Low | High | Encrypted backups; restricted access; breach-notification playbook (72h) |
| Data subject request non-response | Low | Medium | In-app self-service for deletion and export; email DPO address monitored |

## 5. Compliance Checks

- [x] Lawful basis identified for every processing purpose (Art. 6).
- [x] Explicit consent collected for AI processing at signup.
- [x] Privacy Policy discloses all purposes, recipients, retention, rights.
- [x] DPA template available for Controllers (Art. 28).
- [x] Data subject rights operationalized (in-app delete, export, moderation).
- [x] Breach notification procedure documented (Art. 33).
- [x] Security measures aligned with ISO 27001 control families.
- [x] Records of Processing Activities maintained (see RoPA).

## 6. Residual Risk

Overall residual risk assessed as **LOW** after mitigations. Processing does not involve systematic monitoring of public places, large-scale sensitive data, or solely-automated decisions with legal effects. No prior consultation with supervisory authority required under Art. 36(1).

## 7. Review

- DPIA to be reviewed annually or upon material product change (new SDK, new category of data, expansion to regulated industries).
- Next scheduled review: 2027-04-22.

---

**Signature:** Yeonjun Kang, CEO — 2026-04-22
