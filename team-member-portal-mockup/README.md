# TLC Team Member Portal — interactive mockup

This is a separate, dependency-free concept based on the complete Team Member Portal PRD. It does not connect to Planning Center or store personal data.

## Preview

Serve the repository root and open `/team-member-portal-mockup/`:

```bash
python3 -m http.server 8080
```

Use the role switcher at the top to review the team-member, team-lead and Talent Management experiences. The **Review decisions** screen makes key product choices selectable during stakeholder review.

## Included journeys

- Church Center sign-in and one-time-code fallback concept
- Personal serving record and development progress
- Next-step prompt and correction route
- Planning Center-sourced team directory
- Restricted team-lead roster
- Talent Management metrics, filters and member table
- In-portal documentation hub
- Responsive phone, tablet and desktop layouts
- Interactive product-decision review
- Working fallback-verification demo (use code `246810`)
- Lead/staff access-gate and quarterly-review screens
- Staff audit-log concept with SharePoint retention messaging
- Complete guide-reading and incorrect-information reporting flows
- Working team/location/status filters and demo CSV export
- Member-to-team requests with team-lead approval or decline
- Talent Management role appointments for existing platform members
- Editable documentation workspace with DOCX, PDF and CSV uploads
- Document version history and lead-controlled read/edit permissions

Direct demo views can be opened with query parameters, for example:

- `?role=member&page=teams`
- `?role=lead&page=requests`
- `?role=staff&page=roles`
- `?role=staff&page=docs`

All names and figures in the interface are mock data.
