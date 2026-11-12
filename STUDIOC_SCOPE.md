# StudioC capability and integration scope

## What StudioC actually provides

StudioC describes itself as intelligent middleware rather than a church management system or mobile app. Its principal value is a church-specific data warehouse and engagement layer that connects systems such as Planning Center, segments people, identifies next steps, automates communication and supplies personalised member dashboards plus ministry insight.

This is broader than the current TLC Team Member & Volunteer Platform, whose first responsibility is secure volunteer access, serving teams, rota, onboarding, guides and team administration.

## Recommended scope decision

Do not attempt a feature-for-feature StudioC clone inside Phase 1. Keep the platform compatible with either route:

1. TLC builds its own targeted engagement layer after the volunteer beta proves adoption.
2. TLC purchases StudioC and integrates its personalised dashboard/messages into the TLC web and mobile clients.
3. TLC uses a hybrid: StudioC calculates journeys and audiences; TLC owns the branded app, volunteer operations, documents and notifications.

The preferred near-term route is **TLC-first, integration-ready**. Complete the volunteer platform and mobile beta, add the event/audience data model below, and make the StudioC commercial decision using real adoption and cost evidence.

## Capability map

| Capability | Current source/owner | TLC build decision | StudioC option |
|---|---|---|---|
| People and households | Planning Center | Read and cache minimum identifiers | StudioC also ingests from Planning Center |
| Serving groups | Planning Center Groups | Already in scope | Not a reason to purchase StudioC |
| Volunteer rota | Planning Center Services | Already in scope | Not a core StudioC differentiator |
| Join requests and team roles | TLC portal | Already in scope | Retain in TLC |
| Team guides and permissions | TLC portal | Already in scope | Retain in TLC |
| Personalised member dashboard | Future TLC engagement layer | Build cards/rules for TLC journeys | Consume StudioC Waypoint dashboard if supported |
| Discipleship pathway/next steps | Future church-wide phase | Build only TLC-approved pathways | Core StudioC value |
| Dynamic segmentation | Future church-wide phase | Rules engine over consented events | Core StudioC value |
| Automated email/SMS/push | Shared notification service | Build transactional volunteer messages first | StudioC can orchestrate broader journeys |
| Ministry follow-up queues | Future church-wide phase | Build small, auditable action queues | Core StudioC value |
| Cross-system warehouse | Not required for volunteer MVP | Defer until more than Planning Center/TLC data is needed | Core StudioC value |
| Engagement analytics | TLC portal event stream | Basic product analytics first | StudioC provides broader ministry insight |

## Integration architecture

Planning Center remains the identity and church-record source. The TLC database remains the operational store for portal accounts, roles, permissions, team claims, documents and audit history.

If StudioC is adopted, integration should use a server-to-server connector—not browser access to either vendor's credentials.

```text
Planning Center ──read/sync──> TLC integration service ──> TLC database
       │                              │                         │
       └────StudioC connector─────────┘                         │
                                      │                         │
                               StudioC journeys/cards           │
                                      │                         │
                                      └────approved API/feed────┤
                                                                │
                                                TLC web + mobile app
```

The integration contract should support:

- Stable Planning Center person ID as the cross-system identifier.
- Inbound personalised cards, pathway state and approved messages.
- Outbound consented engagement events such as card opened, guide read or next step completed.
- Idempotent webhooks or incremental sync cursors.
- Explicit purpose, consent, retention and deletion fields.
- Source and timestamp on every derived status.
- No StudioC credential or Planning Center credential inside the web or mobile client.

## TLC-native engagement layer, if built

The minimum defensible alternative to StudioC would contain:

1. `engagement_events`: consented facts from Planning Center and TLC channels.
2. `segments`: versioned criteria defining a ministry audience.
3. `journeys`: ordered TLC-approved discipleship or volunteer steps.
4. `journey_enrolments`: the person's current step, reason and source.
5. `dashboard_cards`: personalised content with audience, priority and expiry.
6. `message_campaigns`: templates, channel, approval and scheduled delivery.
7. `ministry_tasks`: accountable human follow-up with owner and outcome.
8. `engagement_audit`: why a person entered a segment and what communication occurred.

This must be rule-based and explainable before adding AI. AI may draft summaries or suggest follow-up, but it must not independently classify sensitive pastoral conditions or send messages without approved rules.

## Information required from StudioC before integration approval

Public material confirms Planning Center and custom-app compatibility but does not publish a complete technical API contract. TLC should request:

- API and webhook documentation.
- Authentication method and sandbox access.
- Supported Planning Center objects and sync direction.
- Dashboard embedding or headless/card-feed options.
- Mobile deep-link and push-notification model.
- Data residency, subprocessors, encryption and backup locations.
- UK GDPR controller/processor terms and deletion SLAs.
- Export format and termination assistance.
- Rate limits, uptime commitment and incident notification terms.
- Full implementation, integration and annual subscription costs.

## Decision gate

Make the buy/build/hybrid decision after the volunteer web beta and TestFlight beta generate evidence. Compare:

- Volunteer activation and weekly use.
- Percentage of needed journeys that Planning Center workflows already cover.
- Number of additional data sources that genuinely need unification.
- TLC staff capacity to own segmentation and communication strategy.
- Three-year StudioC cost versus TLC build and maintenance cost.
- Whether StudioC supplies a documented headless integration suitable for the TLC app.

Until those answers exist, the project should remain integration-ready without becoming dependent on StudioC.
