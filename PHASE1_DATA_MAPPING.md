# Phase 1 data mapping

## Identity and account creation

| Signup input | Planning Center comparison | Portal storage | Behaviour |
|---|---|---|---|
| First and last name | `People.person.first_name`, `last_name` | Display name only after verification | Used to locate candidates; punctuation, spacing and casing are normalized |
| Email | Included `emails.address` | HMAC hash only | Exact normalized match; the plaintext address is not copied into the portal account |
| Mobile | Included `phone_numbers.e164`, international or number | Encrypted only inside the 15-minute challenge | Never entered or displayed; used solely as the Twilio Verify destination |
| SMS code | Twilio Verify check | Not stored | Three attempts maximum per challenge |
| Planning Center person ID | `People.person.id` | `portal_accounts.person_id` | Stable account key shared by web and mobile |

The API always returns a generic message after signup submission. It does not reveal whether a matching Planning Center person exists.

Email is the unique identity anchor. The server searches by full name, surname and first name, then accepts only one candidate carrying the submitted email and a stored mobile number. This tolerates common-name variations while the SMS sent to the independently stored Planning Center number provides the decisive proof. Ambiguous or duplicate candidates are never selected automatically.

After the one-time SMS verification, the member creates a password of at least 10 characters. It is stored only as a salted `scrypt` hash. Everyday web and mobile sign-in uses email plus password; SMS is reserved for account creation and recovery. Member sessions last up to 30 days, while elevated Team Lead and Talent Management sessions expire after 12 hours.

## Serving-group mapping

Signup uses the existing cached `pc_groups` catalogue. It permits multiple active groups only from these Planning Center Group Types:

| Planning Center group type | ID | Included in signup |
|---|---:|---|
| Team Members [Service Teams] | `495375` | Yes |
| Team Members [Life Stage Ministries] | `511634` | Yes |
| Location Teams | `515439` | Yes |
| Small Groups | `459560` | No |
| Life Groups | `484487` | No |
| Growth Track and other catalogue types | Various | No |

Each selection maps as follows:

| Cached field | Portal field |
|---|---|
| `pc_groups.id` | `portal_account_groups.group_id` |
| `pc_groups.name` | `portal_account_groups.group_name` snapshot |
| `pc_groups.group_type_id` | `portal_account_groups.group_type_id` |
| Member selection | `status = claimed` |
| Admin confirmation | `status = confirmed`, `confirmed_by` set |

Signup selections do not write to Planning Center. They tell administrators where the member says they currently serve and can be reconciled against Planning Center later.

## Positions and permissions

Every verified account starts as `member`. Elevated positions are separate assignments created by Talent Management:

| Portal position | Scope | Mapping |
|---|---|---|
| Team Member | Own account and own serving information | Default; no elevated assignment |
| Team Lead | One or more serving-group IDs | One `portal_role_assignments` row per group |
| Talent Management | All volunteer teams | `role = staff`, no group ID |

The session is calculated from active assignments at sign-in. A person may lead multiple serving groups. Team Leads can see and decide requests only for their assigned group IDs. Talent Management can appoint or revoke positions for existing verified accounts.

## Ownership boundaries

| Data | Owner |
|---|---|
| Person name, email, mobile | Planning Center |
| Planning Center group catalogue | Planning Center; read-only cached copy |
| Events, rotas, assignments and responses | TLC portal |
| Verified portal account | TLC portal |
| Claimed serving groups | TLC portal pending confirmation |
| Team Lead / Talent Management position | TLC portal |
| Join requests, guide permissions and audit history | TLC portal |

## Member journey and next steps

The portal's core purpose includes showing each member what TLC currently records about their serving, training and progression, together with the next action they should take. The PRD names these Planning Center-backed fields: Serve Location, Primary and Secondary Serve Team, Attended Serve, Completed Serve 1, Completed Serve 2 and Completed Connect Track. It also references Master Life / Connect Track language that must be confirmed with TLC before labels and progression rules are finalised.

Journey data stays separate from rota data. Planning Center remains the source for recorded completion values; the portal will calculate and present the member's current stage and next step without exposing safeguarding, pastoral, medical, giving, DBS, address or birthdate fields.

The same account, session contract and API are used by the responsive web interface and the planned mobile app.
