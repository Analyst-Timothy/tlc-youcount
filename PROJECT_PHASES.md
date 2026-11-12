# TLC Team Member & Volunteer Platform — phased delivery plan

## Product direction

The first audience is TLC team members, volunteers, team leads and Talent Management. Planning Center remains the system of record for people, teams and serving schedules. The TLC platform becomes the simpler, branded experience for serving, onboarding, team communication and editable knowledge.

The architecture must allow a later church-wide member experience without exposing volunteer-only information or rebuilding the foundation. Expansion is a future decision gate, not part of the initial launch scope.

## Current position

- Full-scope interactive concept: `https://team-member-portal-mockup.vercel.app`
- Working production-track foundation: `https://team-member-portal-mockup.vercel.app/new/`
- Existing TLC database and Planning Center environment are connected to the production-track backend.
- The current role selector is preview authentication and must not be treated as real member authentication.

The mockup is the approved experience reference. The production-track build will converge on it phase by phase.

## Phase 0 — scope, ownership and data mapping

**Outcome:** confirm what TLC owns, what Planning Center owns and who may access each function.

- Confirm the initial volunteer/team-member population.
- Map Planning Center People, Groups and Services fields to portal views.
- Confirm Team Lead and Talent Management appointment rules.
- Confirm inactive-member and access-expiry rules.
- Confirm document ownership and migration priorities from Slab.
- Agree the authentication route: Church Center OAuth if approved and sufficient, otherwise verified email/SMS OTP against Planning Center contact data.
- Confirm privacy notice, retention, audit and safeguarding requirements.

**Exit gate:** signed data map, role matrix and launch audience.

## Phase 1 — secure web beta

**Outcome:** selected real volunteers can sign in safely and use core self-service functions.

- Replace preview role selection with real identity verification.
- Match the authenticated identity to one Planning Center person ID server-side.
- Member home, serving profile and read-only rota.
- Team directory and request-to-join flow.
- Correct Team Lead approval/decline flow, limited to their team.
- Talent Management role appointments and access removal.
- Notifications for request submitted, approved or declined.
- Audit all elevated access and administrative actions.
- Responsive phone, tablet and desktop experience aligned with the mockup.

**Pilot:** Talent Management, two Team Leads and 15–30 volunteers.

**Exit gate:** authentication, permissions and join workflow pass user acceptance and security checks.

## Phase 2 — team knowledge and operational beta

**Outcome:** the portal becomes useful every week and reduces the operational limitation experienced with Slab.

- Documentation home and team-specific guides.
- DOCX, PDF and CSV source-file uploads.
- Preserve original files while maintaining editable portal content.
- Version history, owner, updated date and restoration.
- Read-only by default; Team Leads may grant named members edit access within their scope.
- Review/publish workflow for important guides.
- Search, read acknowledgements and document audit history.
- Planning Center Services rota sync with call time, role, event and location.
- Google Calendar and Outlook calendar actions.
- Correction/report-an-issue route to Talent Management.

**Exit gate:** selected teams can use the portal for four consecutive weeks without relying on mock data.

## Phase 3 — mobile app beta

**Outcome:** volunteers receive a focused native mobile experience using the same production backend as the web portal.

- Build with Expo/React Native for iOS and Android.
- Reuse the existing backend, database, permissions and Planning Center integration; do not create a second data system.
- Secure sign-in and stored session using Keychain/Keystore.
- Home, next serving assignment, rota, teams, join requests and guides.
- Push notifications for upcoming serving dates, rota changes, join decisions and important team announcements.
- Deep links from notifications to the relevant assignment, request or guide.
- Add to Google Calendar or Outlook/device calendar.
- Basic offline access to previously opened guides and upcoming assignments.
- App privacy controls, logout, session revocation and notification preferences.
- TestFlight distribution first, followed by a small Android closed test.

**Pilot:** the same web-beta group, then expand to 50–100 volunteers.

**Exit gate:** stable TestFlight/Android beta, reliable notifications and satisfactory weekly-active usage.

## Phase 4 — volunteer platform launch

**Outcome:** production launch for all approved TLC team members and volunteers.

- Complete migration of agreed team guides.
- Onboard all Team Leads and Talent Management users.
- Support process, incident response and access-review schedule.
- Usage, notification-delivery and workflow analytics.
- App Store and Google Play release if the beta meets the agreed quality bar.
- Quarterly access review and inactive-member expiry.

**Exit gate:** volunteer adoption and operational targets met for at least eight weeks.

## Phase 5 — church-wide expansion decision

**Outcome:** decide from evidence whether to extend the platform beyond volunteers.

Potential additions include member profile, events, groups, giving journeys, pastoral requests, church announcements and family records. These require a new privacy and permissions review and should not be exposed merely by changing a role flag.

**Decision evidence:** volunteer adoption, support workload, Planning Center coverage, unresolved feature gaps, mobile engagement and total cost of ownership.

## Studio C decision gate

Do not frame the platform as replacing Studio C before the church has compared like-for-like capabilities. Instead, use the phased beta to answer whether Studio C adds enough unique value beyond Planning Center plus the TLC platform.

Before any purchase, compare:

- Features Studio C uniquely provides and TLC genuinely needs.
- Planning Center functions already available and adopted.
- Functions covered by the TLC web and mobile platform.
- Integration, migration, support and annual licensing costs.
- Data ownership, exportability and vendor lock-in.
- Time to launch and internal maintenance responsibility.

The recommended commercial checkpoint is after Phase 3. By then TLC will have evidence from a working web beta and TestFlight app, rather than comparing Studio C with a concept.

See [`STUDIOC_SCOPE.md`](STUDIOC_SCOPE.md) for the capability map, TLC-native option, hybrid integration architecture and vendor due-diligence checklist.

## Delivery order

1. Secure identity and permissions.
2. Real Planning Center people, teams and rota mapping.
3. Join request and role-administration workflows.
4. Documentation, uploads, editing and audit.
5. Mobile app and push notifications.
6. Volunteer-wide launch.
7. Church-wide and Studio C decisions based on evidence.

## Non-negotiable boundaries

- Planning Center remains read-only from this platform unless TLC explicitly approves a controlled write operation later.
- Preview authentication must be disabled before inviting real users.
- Team Leads see only the teams they are appointed to lead.
- Sensitive pastoral, giving and safeguarding information is excluded from the volunteer portal.
- Web and mobile use the same backend and permission model.
- A church-wide extension is a separately approved product phase.
