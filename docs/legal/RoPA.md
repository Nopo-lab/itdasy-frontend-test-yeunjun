# Records of Processing Activities (RoPA)

**Required by:** GDPR Art. 30 / UK GDPR Art. 30
**Version:** 1.0 · **Last Updated:** 2026-04-22 · **Maintained by:** Y2do — Yeonjun Kang

---

## Part A — Processing as Controller

### A-1. Member (salon owner) account management
| Field | Value |
|---|---|
| Purpose | Authentication, support, billing |
| Categories of data subjects | Salon owners (adults, 14+) |
| Categories of personal data | Email, hashed password, name, shop info, IAP transaction IDs |
| Recipients | Internal; Apple/Google (IAP); Railway/Supabase (hosting) |
| International transfers | US processors under SCCs; KR ↔ EU covered by adequacy decision |
| Retention | Until account deletion; legal min. 5y for IAP records |
| Security measures | bcrypt, TLS, MFA for admins, audit logs |
| Lawful basis | Art. 6(1)(b) Contract + Art. 6(1)(c) Legal obligation (tax) |

### A-2. In-app support conversations
| Field | Value |
|---|---|
| Purpose | Customer support |
| Data subjects | Members |
| Categories | Messages, timestamps |
| Recipients | Internal (CEO as support); Supabase |
| Transfers | US SCCs |
| Retention | Until account deletion |
| Security | TLS, DB encryption |
| Lawful basis | Art. 6(1)(b) Contract |

### A-3. Error / crash monitoring (Sentry)
| Field | Value |
|---|---|
| Purpose | Service integrity and debugging |
| Data subjects | Members |
| Categories | Stack traces, device info, URL. PII auto-scrubbed (email/phone regex). |
| Recipients | Functional Software, Inc. (Sentry, US) |
| Transfers | US SCCs |
| Retention | 30 days |
| Security | DSN scoping; PII scrubbing in beforeSend |
| Lawful basis | Art. 6(1)(f) Legitimate interest; EU users additionally via opt-in consent banner |

## Part B — Processing as Processor (end-customer data)

### B-1. End-customer CRM records (entered by salon owner as Controller)
| Field | Value |
|---|---|
| Controller | Salon owner |
| Purpose | Enable salon's own CRM functions |
| Data subjects | End-customers of salons |
| Categories | Name, phone (optional), birthday MM-DD (optional), memos, visit history |
| Recipients (our sub-processors) | Railway, Supabase, Cloudflare (storage); Google Gemini (pseudonymized only), Sentry (PII-scrubbed) |
| Transfers | US under SCCs |
| Retention | Per Controller's instructions (typically until Controller account deletion) |
| Security | Multi-tenant isolation, encryption, bcrypt/Fernet |
| Pseudonymization | Names replaced with "Customer#N" before Gemini calls |

### B-2. Photos uploaded by salon owner (depicting end-customers potentially)
| Field | Value |
|---|---|
| Controller | Salon owner |
| Purpose | Portfolio, AI background removal |
| Data subjects | End-customers (if recognizable in photo) |
| Categories | Image files |
| Recipients | Supabase Storage / Cloudflare R2; Replicate or Remove.bg for processing (then purged) |
| Retention | Until Controller deletes |
| Security | HTTPS upload, signed URLs |

---

## Part C — DPO / Contact

- Data Protection Officer (equivalent): Yeonjun Kang, CEO, Y2do
- Email: contact@itdasy.com
- Business Address: Republic of Korea (details on business registration)
- Business Registration No.: 179-36-01681

## Part D — Supervisory Authorities

- Lead (KR): Personal Information Protection Commission of Korea (PIPC) — www.pipc.go.kr
- EU complaints: user's local DPA (see Privacy Policy Section 11-5)
- UK: ICO — ico.org.uk

---

## Change Log

| Date | Change |
|---|---|
| 2026-04-22 | Initial RoPA created |
