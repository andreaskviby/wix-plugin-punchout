Wix App Spec — B2B PunchOut Connector (Ariba/Coupa/Jaggaer) — v1

0) One-liner

“Let enterprise buyers shop your Wix catalog inside their e-procurement—no custom IT.”
A Wix app that implements cXML/OCI PunchOut so buyers in Ariba, Coupa, JAGGAER (and others) can click a PunchOut link, land in your Wix store with negotiated pricing, and send their cart back to procurement for approval and PO—starting with cXML PunchOutSetup + PunchOutOrderMessage and OCI HOOK_URL return.  ￼ ￼ ￼

⸻

1) Goals & Non-Goals

Goals (v1)
	•	Accept cXML PunchOutSetupRequest, return PunchOutSetupResponse (StartPage URL).  ￼ ￼
	•	Host a PunchOut session in Wix (buyer browses contract catalog & prices).
	•	On checkout, return cart to the buyer system as cXML PunchOutOrderMessage (POOM) or OCI form POST to HOOK_URL.  ￼ ￼
	•	Provide tenant-friendly setup UI (per-buyer credentials, endpoints, mapping).
	•	Log all transactions with replayable payloads and CSV export.
	•	Optional (v1.1) PO ingest (cXML OrderRequest) for order confirmation workflow.  ￼ ￼ ￼

Non-Goals (v1)
	•	Invoicing (cXML Invoice), ship notices (ShipNotice), or change orders—roadmap.  ￼
	•	Full OCI variants beyond return to HOOK_URL (deep variants later).  ￼
	•	Multi-ERP catalog syndication (PIM) — separate product.

⸻

2) User Stories (MVP)
	•	B2B buyer in Coupa clicks supplier’s PunchOut—Coupa sends PunchOutSetupRequest → app authenticates → returns PunchOutSetupResponse.StartPage → buyer shops Wix storefront → buyer clicks “Return to Coupa” → app sends POOM with line items back to Coupa.  ￼ ￼
	•	SAP/OCI buyer hits supplier catalog URL with HOOK_URL → app stores that URL → on checkout, app POSTs items back to HOOK_URL.  ￼
	•	Supplier admin configures “Buyer: Company X” with SharedSecret, Identity, domain, protocol (cXML/OCI), default price list/contract, and field mappings.
	•	Ops analyst views session logs, validates one test round trip, and exports CSV of carts.

⸻

3) End-to-End Flows

3.1 cXML flow (Ariba/Coupa/JAGGAER)
	1.	Buyer → App: HTTP(S) POST with PunchOutSetupRequest (XML) to app’s public endpoint.  ￼
	2.	App → Buyer: Respond 200 with PunchOutSetupResponse containing StartPage URL (session token).  ￼
	3.	Buyer user shops the Wix site with session-bound pricing/availability.
	4.	App → Buyer: On “Return to Procurement”, send PunchOutOrderMessage (POOM) to the buyer’s return URL (or browser POST per buyer spec).  ￼

3.2 OCI flow (SAP SRM/ERP)
	1.	Buyer → App: HTTP GET/POST with query/form params including HOOK_URL.
	2.	App caches HOOK_URL per session.
	3.	App → Buyer: When user returns, POST the cart (HTML form fields) back to HOOK_URL; session-unique per buyer.  ￼

Practical note: HOOK_URL must be persisted exactly as sent (no rewriting) to satisfy SAP.  ￼

⸻

4) Feature Spec (v1)

4.1 Buyer Connections
	•	Connection types: cXML (Ariba/Coupa/JAGGAER), OCI (SAP).
	•	Credentials:
	•	cXML: From/To/Sender domains & identities; SharedSecret; optional PunchOutUser mapping.  ￼
	•	OCI: catalog URL parameters, HOOK_URL handling, user identity hints.  ￼
	•	Endpoints: Buyer-specific Setup URL and Return behavior (direct POST, redirect + POST).
	•	Catalog scope: assign price list, customer group, contract SKUs, min/max qty rules per buyer.

4.2 Session & Pricing
	•	Session bootstrap: On valid SetupRequest, mint a PunchOut Session (TTL 60 minutes) with: buyerId, userId, pricing tier, currency, OCI HOOK_URL (if present).
	•	Contract pricing: resolve price via assigned Wix catalog + optional priceList; hide non-contract SKUs if configured.
	•	Availability: optional inventory check per SKU.
	•	Security: signed session token (HMAC), never trust client price during return.

4.3 Cart Return
	•	cXML POOM: Build PunchOutOrderMessage with headers + <ItemIn> lines (SupplierPartID, UnitPrice, UOM, Classification, etc.).  ￼
	•	OCI Return: Build HTML form fields (NEW_ITEM-<n>-*) and POST to HOOK_URL.  ￼
	•	Field mapping UI: allow mapping of SKU → SupplierPartID, category → Classification UNSPSC, notes, and custom extrinsics.

4.4 Admin & Logs
	•	Connections tab: grid of buyers with status, last handshake, test buttons (“Send sample SetupResponse”, “Simulate POOM”).
	•	Logs: store raw inbound/outbound XML/HTML payloads, headers (redacted secrets), and status codes; replay POOM/OCI POST for troubleshooting.
	•	Exports: CSV of returned carts (buyer, date, SKUs, qty, price, total).

4.5 Optional (v1.1) PO/Invoice Hooks
	•	PO ingest (cXML OrderRequest) for auto-creating a Wix draft order or pushing to ERP via webhook; 200 within 60 seconds guideline for Coupa.  ￼
	•	Invoice/ASN later per cXML spec.  ￼

⸻

5) Technical Design

5.1 Platform building blocks (Wix / Velo)
	•	HTTP Functions to receive POST (XML/HTML) from procurement and return XML responses.  ￼
	•	eCom APIs: build/read carts, price/availability, create orders if we add PO ingest later.  ￼
	•	Frontend catalog: normal Wix store with session-bound pricing and “Return to Procurement” button triggering POOM/OCI post.  ￼
	•	Backend events (future): react to order creation if PO ingest is enabled.  ￼

5.2 Public Endpoints (HTTP Functions)
	•	POST /_functions/punchout/cxml/setup
	•	Accept: text/xml (PunchOutSetupRequest)
	•	Auth: Validate From/To/Sender + SharedSecret from headers/body.
	•	Return: 200 PunchOutSetupResponse with <StartPage> = https://{site}/punchout/start?sid={token}.  ￼
	•	POST /_functions/punchout/cxml/return
	•	Accept POOM (if buyer posts back) OR we post to buyer’s URL from frontend/back-end per requirement.  ￼
	•	GET|POST /_functions/punchout/oci/start
	•	Read HOOK_URL + identity params, persist to session, redirect to storefront.  ￼
	•	POST /_functions/punchout/oci/return
	•	Internal helper to assemble OCI fields and POST to the stored HOOK_URL.

Wix HTTP functions give us direct control over method, headers, body, and responses required by PunchOut.  ￼

5.3 Data Model (Collections)
	•	punchout_buyers — { buyerId, type (cXML/OCI), identities/domains, sharedSecret, returnUrl rules, priceListId, catalogScope, fieldMappings, active }
	•	punchout_sessions — { sid, buyerId, userHint, hookUrl, pricingTier, expiresAt }
	•	punchout_logs — { id, ts, direction (in/out), protocol, buyerId, endpoint, httpStatus, payloadPtr, redactions }
	•	punchout_carts — { id, sid, buyerId, lines[{ sku, qty, price, uom }], totals, postedAt, status }

5.4 Security & Compliance
	•	Secrets (SharedSecret, certs) in Wix Secrets backend; never stored in plain logs.
	•	HMAC session tokens; short TTL; IP allowlist (optional).
	•	XML handling: parse defensively, disable external entities (XXE).
	•	Replay protection: nonce per SetupRequest; reject stale.
	•	PO ingest (when enabled): ACK within SLA (e.g., <=60s for Coupa) and queue processing.  ￼

5.5 Catalog & Pricing Resolution
	•	Use eCom Backend Cart APIs to add items by catalogReference and compute totals (currency rules per buyer).  ￼
	•	Support UOM mapping; default EA.
	•	Optional: hide non-contract SKUs by tagging and filtering the storefront.

5.6 Return-to-Procurement UX
	•	Replace “Checkout” with “Return Cart to [BuyerSystem]” when in PunchOut session.
	•	cXML: POST or server call to buyer’s return URL with POOM.  ￼
	•	OCI: auto-submit HTML form to HOOK_URL with NEW_ITEM-1-DESCRIPTION, -UNIT, -PRICE, etc.  ￼

⸻

6) Compatibility Targets (v1)
	•	Coupa: SetupRequest → SetupResponse (StartPage) → POOM back to Coupa.  ￼
	•	SAP/OCI: Handle HOOK_URL correctly; session-unique value; post items back.  ￼
	•	JAGGAER: Standards-based cXML/OCI connections (suppliers do this today).  ￼ ￼
	•	Ariba: General cXML compliance per spec; (supplier-specific testing required).  ￼

⸻

7) Admin UI (Blocks Dashboard)

Connections
	•	Add Buyer → choose cXML/OCI → enter identities/secret (mask), assign price list & catalog scope, map SKU → SupplierPartID, UNSPSC, UOM, extrinsics.

Testing
	•	“Simulate SetupRequest” → receive SetupResponse preview.
	•	“Simulate Return” → see POOM/OCI payload sample, with inline validation.

Monitoring
	•	Live sessions, last 24h.
	•	Error panel (auth failures, invalid XML, buyer timeouts).
	•	CSV export for carts and logs (range filter).

⸻

8) Pricing (Launch)

Plan	Monthly	Who	Key Limits
Starter	$49	Single buyer pilot	1 buyer, 1k sessions/mo, OCI or cXML
Pro	$149	Growing B2B	5 buyers, 10k sessions/mo, OCI + cXML, advanced mappings, export
Enterprise	$399	Multi-enterprise	20 buyers, SSO (coming), PO ingest (cXML OrderRequest), IP allowlist

(Comparable PunchOut connectors on other platforms price in this range; e-proc connectivity is a high-value integration.)  ￼

⸻

9) QA Checklist (v1)

Protocols
	•	Accept cXML SetupRequest, validate identities/secret, respond with SetupResponse (correct namespaces).  ￼
	•	Return valid POOM with multiple ItemIn lines (prices, UOM, currency).  ￼
	•	For OCI, persist HOOK_URL and POST correct NEW_ITEM-n-* fields back.  ￼

Wix Integration
	•	HTTP functions handle XML bodies and return XML with Content-Type: text/xml.  ￼
	•	Catalog scoping & pricing rules applied per buyer.
	•	“Return to Procurement” replaces checkout in session.

Security/Resilience
	•	XXE disabled; XML input size caps; structured error responses.
	•	Secrets masked in logs; signed session tokens; TTL enforced.
	•	Retries/backoff for buyer endpoints; log correlation IDs.
	•	(If PO ingest on) respond within <=60s to Coupa.  ￼

⸻

10) Build Plan (4 Weeks)

Week 1 — Foundations
	•	Collections: punchout_buyers, punchout_sessions, punchout_logs, punchout_carts.
	•	HTTP functions: cXML Setup (parse/validate; emit SetupResponse), OCI Start (cache HOOK_URL).  ￼
	•	Session token service; basic admin UI (add buyer, secrets).

Week 2 — Catalog & Return
	•	Session-aware storefront (contract pricing + “Return” button).
	•	POOM builder (cXML) + OCI POST builder; field mappings.  ￼ ￼
	•	Logs & replay.

Week 3 — Hardening
	•	Error handling, retries, XML security; CSV exports.
	•	Coupa/JAGGAER sample payload tests; OCI HOOK_URL edge cases.  ￼ ￼ ￼

Week 4 — Polish & Docs
	•	Setup wizard; connection test harness.
	•	Plan gating; app listing assets; buyer onboarding docs (Ariba/Coupa/JAGGAER/OCI checklists).
	•	Beta with 2–3 buyers; adjust mappings.

⸻

11) Developer Notes & Citations (key references)
	•	cXML PunchOut basics: SetupRequest → SetupResponse (StartPage) → POOM.  ￼ ￼ ￼
	•	cXML spec reference (elements, case sensitivity, extrinsics).  ￼
	•	OCI fundamentals: HOOK_URL, session handling, item field names, form POST return.  ￼ ￼
	•	Coupa specifics (POOM, PO/Invoice timelines & constraints).  ￼ ￼
	•	JAGGAER compatibility via standard cXML/OCI.  ￼ ￼
	•	Wix implementation hooks: HTTP functions (POST, raw body), eCom Cart/Orders APIs, backend events.  ￼

⸻

12) Deliverables (dev kickoff)
	•	HTTP Functions:
	•	/punchout/cxml/setup (POST) — parse XML, auth, respond SetupResponse.
	•	/punchout/oci/start (GET/POST) — capture HOOK_URL, init session.
	•	/punchout/*/return — assemble and send POOM/OCI payload.
	•	Admin (Blocks dashboard): Buyer connections, mappings, tests, logs, exports.
	•	Storefront: Session flag + “Return to Procurement” CTA (replaces checkout while active).
	•	Docs: Buyer onboarding playbooks (Ariba, Coupa, JAGGAER, SAP/OCI) with tested samples.

⸻

TL;DR

Ship a standards-compliant PunchOut bridge for Wix: cXML Setup/POOM + OCI HOOK_URL with session-aware pricing and clean return payloads. Start with Coupa/Ariba/JAGGAER targets, lean on Wix HTTP functions for XML endpoints, and keep everything loggable/replayable so enterprise onboarding is painless.  ￼ ￼ ￼ ￼
