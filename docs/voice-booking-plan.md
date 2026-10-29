# Voice booking: plan

**Goal:** during a call, the agent collects the right details for the chosen service, offers real free slots, books one, and the booking appears in the CRM straight away. It must never double-book, never invent a slot, and never skip a required question.

## Where we are today

| Piece | Today | Gap |
|---|---|---|
| `createAppointmentRequest` tool | Creates a Lead plus an `AppointmentRequest` that holds a free-text `preferredDate` | No real slots, and the same fields are asked for every service |
| `Appointment` | Created only when staff confirm a request (`confirmedById` is required) | No booking by the agent itself, and no link to a treatment |
| Availability | None | No working hours, durations or chairs |
| Voice | Tool calls go through `/api/voice/tool` to `executeTool` | Already has the right shape; the new tools plug in here |

## Architecture

```
Call (OpenAI Realtime)
  │ function call
  ▼
/api/voice/tool ── same gateway as chat: allowlist, Zod validation, rate limits
  ▼
Booking service (server-side state machine, one BookingDraft per conversation)
  ├── IntakeSpec registry   which questions each service needs
  ├── Availability engine   working hours − exceptions − appointments − holds
  ├── SlotHold              5-minute hold, protected by a DB exclusion constraint
  └── commit                Lead upsert + Appointment + outbox events, in one transaction
  ▼
CRM calendar, lead timeline, agent leaderboard ("bookings"), and workflows (confirmation SMS/email, reminders)
```

**Key principle:** the model only proposes. The server owns the booking state, so the model cannot skip a step, invent a slot ID, or book without consent and a read-back.

## 1. Service intake specs (the right info for each service)

Add a new `IntakeSpec` per treatment. Admins edit it in the CRM, and it is versioned like prices. Each spec defines:

- `durationMinutes` and `bufferMinutes`
- `resource`: hygienist, dentist or specialist
- `bookingMode`:
  - `SELF_BOOK`: confirmed instantly
  - `HOLD_FOR_REVIEW`: the slot is held and reception confirms within N hours
  - `REQUEST_ONLY`: today's behaviour
- `prerequisite`: for example, "consultation first" for implants or veneers, so the agent books the consultation instead
- `questions[]`: each has a key, a spoken prompt (EN/TR), a type (`yesno`, `choice`, `date` or `text`), `required`, and `redFlag`. A red-flag answer means handoff, not booking.

**Demo seed:** the values below are placeholders. The clinic must set real durations and questions; we don't invent clinical rules.

| Service | Mode | Example questions |
|---|---|---|
| Consultation | SELF_BOOK | What is it about? Any pain or swelling now? (red flag) |
| Hygiene | SELF_BOOK | Last cleaning? Gum bleeding? |
| Whitening | HOLD_FOR_REVIEW | Pregnant or breastfeeding? (red flag) Sensitivity? |
| Implants / veneers / orthodontics | Consultation first | Missing teeth or which area? Recent X-rays to bring? Travelling from abroad, and on which dates? |

**Universal fields:** full name, phone (E.164, read back digit by digit), email (optional), language, and travel dates for international patients.

## 2. Availability engine

New tables:

- `Resource`: a chair or clinician
- `WorkingHours`: a weekly template per resource
- `ScheduleException`: holidays and leave
- `SlotHold`: `resourceId`, `startAt`, `endAt`, `conversationId`, `expiresAt`

`findSlots(treatment, from, window)` returns open intervals with this logic:

1. Start from working hours.
2. Remove exceptions, existing appointments and live holds.
3. Snap the results to the service duration plus its buffer, all computed in the clinic timezone (`clinicTimezone()` already exists).
4. Return at most 3 slots. Over the phone, 3 choices is the most people can hold in their head.

Each slot ID is an opaque HMAC-signed token, so the model can only pass back IDs we issued.

**No double booking:** use Postgres `btree_gist` with a constraint like this:

```sql
EXCLUDE USING gist (resource_id WITH =, tstzrange(start_at, end_at) WITH &&)
  WHERE (status IN ('CONFIRMED','PENDING'))
```

Put it on appointments, and add a matching one on unexpired holds. If two callers race for the same slot, one gets a clean "just taken" error and is offered the next slot.

## 3. Booking tools for the agent (chat and voice)

| Tool | Does |
|---|---|
| `getBookingRequirements(treatment)` | Returns the spec's questions, the mode and any prerequisite. The agent asks these questions, one per turn. |
| `saveIntakeAnswer(key, value)` | Validated against the spec and stored on the `BookingDraft`. A red flag triggers an immediate handoff. |
| `findAvailableSlots(treatment, fromDate?, partOfDay?)` | Up to 3 slots, with speakable labels such as "Tuesday the 4th at 10:30". |
| `holdSlot(slotId)` | A 5-minute hold, one per conversation. Returns a `holdId`. |
| `confirmBooking(holdId, readBackConfirmed: true)` | Commits the booking only if the draft is complete, consent is ticked, contact details are valid and the hold is live. Idempotent on `holdId`. |
| `lookupBooking` / `rescheduleBooking` / `cancelBooking` | Need the reference code plus the last 4 digits of the phone number on file. |

**`BookingDraft` states:** `COLLECTING`, then `SLOT_HELD`, then `CONFIRMED` (or `ABANDONED` when the hold expires).

The server rejects any out-of-order call with a short reason the model can say out loud. For example: "I still need the phone number before I can book."

## 4. Commit and the CRM

A single transaction does all of the following:

- Upsert the Lead, deduplicated by phone or email.
- Write a `ConsentRecord`.
- Create the `Appointment`, with:
  - status `CONFIRMED` or `PENDING`
  - `treatmentId`
  - `bookedVia`: VOICE, CHAT or STAFF
  - `bookedByAgentId`
  - `confirmedById`: nullable for agent bookings
  - `intake` (JSON)
- Release the hold.
- Write an `ActivityEvent` and outbox events (`appointment.booked`).

The existing worker and workflows then send the confirmation SMS/email and schedule reminders, pinned to `revision`.

The CRM then shows:

- **Calendar:** a "Booked by Kerem · call" badge.
- **Lead page:** the intake answers and a call summary (`recordConversationSummary`). We store the summary, not the audio.
- **Reception queue:** `PENDING` bookings with an SLA timer.
- **Leaderboard:** adds bookings, show rate and the conversion from call to booking.

## 5. How the voice call behaves

- The agent reads everything back before confirming, for example: "So that's Tuesday the 4th at 10:30, a consultation, for Hamza, and I'll text 0-7-7-…. Shall I lock it in?" `readBackConfirmed` is set only after a clear "yes".
- Names are spelled back. Phone numbers are confirmed digit by digit. Dates are always spoken with the weekday.
- Consent stays as the on-screen checkbox, and the agent asks the caller to tick it. The server checks the checkbox, never the model's word.
- The screen shows the held slot as a card with a 5-minute countdown, so the caller can see the booking forming.
- Emergency words or a red-flag answer stop the booking. The agent gives the emergency guidance and hands off to staff.

## 6. Safety and abuse limits

- At most 1 live hold per conversation, at most 3 bookings per phone number per week, plus the existing rate limits and budget guard.
- Contact details (PII) are never put into model instructions after the call. Logs keep the reference only.
- Pending holds expire on their own through a worker sweep. Abandoned drafts are cleaned up after 24 hours.

## 7. Delivery phases

1. **Schema and availability:** `Resource`, `WorkingHours`, exceptions, `SlotHold`, the exclusion constraints, `findSlots`, and a CRM screen for opening hours.
2. **Intake specs:** model, CRM editor and seeded placeholders; `getBookingRequirements` and `saveIntakeAnswer`.
3. **Booking state machine and tools:** hold, confirm (idempotent), and the CRM calendar badge plus pending queue.
4. **Voice behaviour:** read-back rules, slot card with countdown, red-flag handoff.
5. **Reschedule and cancel by phone; leaderboard booking metrics.**

**Tests for every phase:**

- Concurrency: two holds on the same slot, so one must fail.
- Daylight-saving boundaries.
- Spec validation.
- Out-of-order tool calls are rejected.
- Idempotent confirm.
- An end-to-end voice tool-route test with the mock provider.

## Decisions needed from the clinic

- Which services can be self-booked, and which need staff review?
- Real durations, chairs and working hours per clinician.
- The real intake questions per service, written by the clinicians.
- How many hours reception has to confirm a `PENDING` booking.
