import type { WorkflowGraph } from "./graph";

// Prebuilt workflows. All are seeded as DRAFT (disabled). An admin must review wording,
// publish the referenced message templates, configure providers and test-send first.

type Tpl = { key: string; name: string; description: string; graph: WorkflowGraph };

const S = (stopOn: WorkflowGraph["settings"]["stopOn"], goalStatuses: WorkflowGraph["settings"]["goalStatuses"] = []) => ({
  stopOn, goalStatuses, allowReenrollment: false,
});

export const WORKFLOW_TEMPLATES: Tpl[] = [
  {
    key: "new_lead",
    name: "New lead: acknowledge + follow-up task",
    description: "Creates a reception task with a response SLA and optionally sends a service acknowledgement on the requested channel.",
    graph: {
      nodes: [
        { id: "trigger", type: "trigger", config: { events: ["lead.created"] } },
        { id: "task", type: "action", label: "Call back within 1 hour", config: { action: "create_task", title: "Respond to new inquiry", dueInMinutes: 60, assignTo: "owner" } },
        { id: "can_email", type: "condition", config: { check: "has_permission", channel: "EMAIL", purpose: "SERVICE" } },
        { id: "ack", type: "action", config: { action: "send_message", channel: "EMAIL", purpose: "SERVICE", templateKey: "lead_ack" } },
        { id: "done", type: "exit", config: { reason: "acknowledged" } },
        { id: "no_email", type: "exit", config: { reason: "no email permission" } },
      ],
      edges: [
        { from: "trigger", to: "task" }, { from: "task", to: "can_email" },
        { from: "can_email", to: "ack", branch: "true" }, { from: "can_email", to: "no_email", branch: "false" }, { from: "ack", to: "done" },
      ],
      settings: S([]),
    },
  },
  {
    key: "lead_nurture",
    name: "Consented lead nurture",
    description: "Two useful follow-ups for leads who opted in to marketing. Stops on booking, reply, opt-out, bounce or human hold.",
    graph: {
      nodes: [
        { id: "trigger", type: "trigger", config: { events: ["lead.created"] } },
        { id: "wait1", type: "delay", config: { mode: "clinic_time", afterDays: 2, time: "10:00" } },
        { id: "perm1", type: "condition", config: { check: "has_permission", channel: "EMAIL", purpose: "MARKETING" } },
        { id: "status1", type: "condition", config: { check: "lead_status_in", statuses: ["NEW", "CONTACTED", "QUALIFIED", "NURTURE"] } },
        { id: "send1", type: "action", config: { action: "send_message", channel: "EMAIL", purpose: "MARKETING", templateKey: "nurture_1" } },
        { id: "wait2", type: "delay", config: { mode: "clinic_time", afterDays: 5, time: "10:00" } },
        { id: "replied", type: "condition", config: { check: "replied_since_enrollment" } },
        { id: "task", type: "action", config: { action: "create_task", title: "Lead replied to nurture email", dueInMinutes: 120, assignTo: "owner" } },
        { id: "send2", type: "action", config: { action: "send_message", channel: "EMAIL", purpose: "MARKETING", templateKey: "nurture_2" } },
        { id: "end", type: "exit", config: { reason: "nurture complete" } },
        { id: "skip", type: "exit", config: { reason: "not eligible" } },
        { id: "end_task", type: "exit", config: { reason: "handed to staff" } },
      ],
      edges: [
        { from: "trigger", to: "wait1" }, { from: "wait1", to: "perm1" },
        { from: "perm1", to: "status1", branch: "true" }, { from: "perm1", to: "skip", branch: "false" },
        { from: "status1", to: "send1", branch: "true" }, { from: "status1", to: "end", branch: "false" },
        { from: "send1", to: "wait2" }, { from: "wait2", to: "replied" },
        { from: "replied", to: "task", branch: "true" }, { from: "replied", to: "send2", branch: "false" },
        { from: "task", to: "end_task" }, { from: "send2", to: "end" },
      ],
      settings: S(["appointment.requested", "appointment.confirmed", "message.replied", "message.unsubscribed", "message.bounced", "lead.human_hold"], ["APPOINTMENT_CONFIRMED", "WON"]),
    },
  },
  {
    key: "booking_abandonment",
    name: "Booking abandonment reminder",
    description: "At most one reminder, only after privacy/policy review of tracking and outreach. Stops if booking completes.",
    graph: {
      nodes: [
        { id: "trigger", type: "trigger", config: { events: ["booking.abandoned"] } },
        { id: "wait", type: "delay", config: { mode: "duration", minutes: 180 } },
        { id: "perm", type: "condition", config: { check: "has_permission", channel: "EMAIL", purpose: "MARKETING" } },
        { id: "send", type: "action", config: { action: "send_message", channel: "EMAIL", purpose: "MARKETING", templateKey: "abandonment" } },
        { id: "end", type: "exit", config: { reason: "reminded" } },
        { id: "skip", type: "exit", config: { reason: "no permission" } },
      ],
      edges: [
        { from: "trigger", to: "wait" }, { from: "wait", to: "perm" },
        { from: "perm", to: "send", branch: "true" }, { from: "perm", to: "skip", branch: "false" }, { from: "send", to: "end" },
      ],
      settings: S(["appointment.requested", "message.unsubscribed", "lead.human_hold"]),
    },
  },
  {
    key: "appointment_reminders",
    name: "Appointment reminders (48h / 24h / 2h)",
    description: "Service reminders for confirmed appointments. Rescheduling or cancelling stops pending reminders automatically.",
    graph: {
      nodes: [
        { id: "trigger", type: "trigger", config: { events: ["appointment.confirmed", "appointment.rescheduled"] } },
        { id: "d48", type: "delay", config: { mode: "before_appointment", minutes: 2880 } },
        { id: "c48", type: "condition", config: { check: "appointment_status_is", status: "CONFIRMED" } },
        { id: "r48", type: "action", config: { action: "send_message", channel: "EMAIL", purpose: "SERVICE", templateKey: "appt_reminder" } },
        { id: "d24", type: "delay", config: { mode: "before_appointment", minutes: 1440 } },
        { id: "c24", type: "condition", config: { check: "appointment_status_is", status: "CONFIRMED" } },
        { id: "r24", type: "action", config: { action: "send_message", channel: "WHATSAPP", purpose: "SERVICE", templateKey: "appt_reminder" } },
        { id: "d2", type: "delay", config: { mode: "before_appointment", minutes: 120 } },
        { id: "c2", type: "condition", config: { check: "appointment_status_is", status: "CONFIRMED" } },
        { id: "r2", type: "action", config: { action: "send_message", channel: "WHATSAPP", purpose: "SERVICE", templateKey: "appt_reminder_short" } },
        { id: "end", type: "exit", config: { reason: "reminders sent" } },
        { id: "x48", type: "exit", config: { reason: "appointment no longer confirmed" } },
        { id: "x24", type: "exit", config: { reason: "appointment no longer confirmed" } },
        { id: "x2", type: "exit", config: { reason: "appointment no longer confirmed" } },
      ],
      edges: [
        { from: "trigger", to: "d48" }, { from: "d48", to: "c48" }, { from: "c48", to: "r48", branch: "true" }, { from: "c48", to: "x48", branch: "false" },
        { from: "r48", to: "d24" }, { from: "d24", to: "c24" }, { from: "c24", to: "r24", branch: "true" }, { from: "c24", to: "x24", branch: "false" },
        { from: "r24", to: "d2" }, { from: "d2", to: "c2" }, { from: "c2", to: "r2", branch: "true" }, { from: "c2", to: "x2", branch: "false" },
        { from: "r2", to: "end" },
      ],
      settings: S(["appointment.cancelled", "appointment.no_show", "appointment.completed"]),
    },
  },
  {
    key: "cancellation_recovery",
    name: "Cancellation recovery",
    description: "Creates a staff task and, where permitted, sends one neutral rescheduling message.",
    graph: {
      nodes: [
        { id: "trigger", type: "trigger", config: { events: ["appointment.cancelled"] } },
        { id: "task", type: "action", config: { action: "create_task", title: "Offer to reschedule cancelled appointment", dueInMinutes: 240, assignTo: "owner" } },
        { id: "perm", type: "condition", config: { check: "has_permission", channel: "EMAIL", purpose: "SERVICE" } },
        { id: "send", type: "action", config: { action: "send_message", channel: "EMAIL", purpose: "SERVICE", templateKey: "cancellation" } },
        { id: "end", type: "exit", config: { reason: "done" } },
        { id: "skip", type: "exit", config: { reason: "task only" } },
      ],
      edges: [{ from: "trigger", to: "task" }, { from: "task", to: "perm" }, { from: "perm", to: "send", branch: "true" }, { from: "perm", to: "skip", branch: "false" }, { from: "send", to: "end" }],
      settings: S(["appointment.requested", "appointment.confirmed"]),
    },
  },
  {
    key: "no_show",
    name: "No-show follow-up",
    description: "Staff task plus at most one neutral rebooking message. No pressure, no clinical detail.",
    graph: {
      nodes: [
        { id: "trigger", type: "trigger", config: { events: ["appointment.no_show"] } },
        { id: "task", type: "action", config: { action: "create_task", title: "Check in after missed appointment", dueInMinutes: 1440, assignTo: "owner" } },
        { id: "wait", type: "delay", config: { mode: "clinic_time", afterDays: 1, time: "11:00" } },
        { id: "perm", type: "condition", config: { check: "has_permission", channel: "EMAIL", purpose: "SERVICE" } },
        { id: "send", type: "action", config: { action: "send_message", channel: "EMAIL", purpose: "SERVICE", templateKey: "no_show" } },
        { id: "end", type: "exit", config: { reason: "done" } },
        { id: "skip", type: "exit", config: { reason: "task only" } },
      ],
      edges: [{ from: "trigger", to: "task" }, { from: "task", to: "wait" }, { from: "wait", to: "perm" }, { from: "perm", to: "send", branch: "true" }, { from: "perm", to: "skip", branch: "false" }, { from: "send", to: "end" }],
      settings: S(["appointment.requested", "appointment.confirmed", "message.replied"]),
    },
  },
  {
    key: "review_request",
    name: "Post-visit review request",
    description: "Clinic-approved wording asking every visiting patient (not only happy ones) for honest feedback. No incentives.",
    graph: {
      nodes: [
        { id: "trigger", type: "trigger", config: { events: ["appointment.completed"] } },
        { id: "wait", type: "delay", config: { mode: "clinic_time", afterDays: 2, time: "12:00" } },
        { id: "perm", type: "condition", config: { check: "has_permission", channel: "EMAIL", purpose: "MARKETING" } },
        { id: "send", type: "action", config: { action: "send_message", channel: "EMAIL", purpose: "MARKETING", templateKey: "review_request" } },
        { id: "end", type: "exit", config: { reason: "sent" } },
        { id: "skip", type: "exit", config: { reason: "no permission" } },
      ],
      edges: [{ from: "trigger", to: "wait" }, { from: "wait", to: "perm" }, { from: "perm", to: "send", branch: "true" }, { from: "perm", to: "skip", branch: "false" }, { from: "send", to: "end" }],
      settings: S(["message.unsubscribed", "lead.human_hold"]),
    },
  },
  {
    key: "inactive_lead",
    name: "Inactive lead task",
    description: "After 14 days without progress, creates an owner task. Never markets automatically to old leads.",
    graph: {
      nodes: [
        { id: "trigger", type: "trigger", config: { events: ["lead.created"] } },
        { id: "wait", type: "delay", config: { mode: "duration", minutes: 14 * 24 * 60 } },
        { id: "still", type: "condition", config: { check: "lead_status_in", statuses: ["NEW", "CONTACTED", "QUALIFIED"] } },
        { id: "task", type: "action", config: { action: "create_task", title: "Inactive lead: decide next step or move to nurture/lost", dueInMinutes: 1440, assignTo: "owner" } },
        { id: "end", type: "exit", config: { reason: "task created" } },
        { id: "active", type: "exit", config: { reason: "lead progressed" } },
      ],
      edges: [{ from: "trigger", to: "wait" }, { from: "wait", to: "still" }, { from: "still", to: "task", branch: "true" }, { from: "still", to: "active", branch: "false" }, { from: "task", to: "end" }],
      settings: S([], ["APPOINTMENT_CONFIRMED", "WON", "LOST"]),
    },
  },
  {
    key: "campaign_response",
    name: "Campaign response follow-up",
    description: "A reply or click (never an open alone) creates a staff task.",
    graph: {
      nodes: [
        { id: "trigger", type: "trigger", config: { events: ["message.replied", "message.clicked"] } },
        { id: "tag", type: "action", config: { action: "add_tag", tag: "engaged" } },
        { id: "task", type: "action", config: { action: "create_task", title: "Follow up on campaign response", dueInMinutes: 240, assignTo: "owner" } },
        { id: "end", type: "exit", config: { reason: "task created" } },
      ],
      edges: [{ from: "trigger", to: "tag" }, { from: "tag", to: "task" }, { from: "task", to: "end" }],
      settings: S([]),
    },
  },
];

// Draft message templates. Wording is placeholder for clinic review; no medical details.
type MsgTpl = { key: string; channel: "EMAIL" | "WHATSAPP"; locale: "en" | "tr"; purpose: "SERVICE" | "MARKETING"; subject?: string; body: string; providerTemplateName?: string };
const pair = (key: string, purpose: MsgTpl["purpose"], en: [string, string], tr: [string, string], channels: MsgTpl["channel"][] = ["EMAIL"]): MsgTpl[] =>
  channels.flatMap((channel) => [
    { key, channel, locale: "en" as const, purpose, subject: channel === "EMAIL" ? en[0] : undefined, body: en[1], providerTemplateName: channel === "WHATSAPP" ? `${key}_en` : undefined },
    { key, channel, locale: "tr" as const, purpose, subject: channel === "EMAIL" ? tr[0] : undefined, body: tr[1], providerTemplateName: channel === "WHATSAPP" ? `${key}_tr` : undefined },
  ]);

export const MESSAGE_TEMPLATES: MsgTpl[] = [
  ...pair("lead_ack", "SERVICE",
    ["We received your request", "Hello {{firstName}},\n\nThank you for contacting Dent Flex. We have received your request (reference {{reference}}). This is not yet a confirmed appointment — our reception team will contact you to arrange a time.\n\nDent Flex"],
    ["Talebinizi aldık", "Merhaba {{firstName}},\n\nDent Flex ile iletişime geçtiğiniz için teşekkürler. Talebinizi aldık (referans {{reference}}). Bu henüz kesinleşmiş bir randevu değildir — resepsiyon ekibimiz saat belirlemek için sizinle iletişime geçecek.\n\nDent Flex"]),
  ...pair("nurture_1", "MARKETING",
    ["What to expect at your first visit", "Hello {{firstName}},\n\nIf you are still thinking about a visit, here is what a first consultation at Dent Flex involves. [Clinic-approved content]\n\nReply to this email if you have questions."],
    ["İlk ziyaretinizde sizi neler bekliyor", "Merhaba {{firstName}},\n\nZiyaret etmeyi hâlâ düşünüyorsanız, Dent Flex'te ilk muayenenin nasıl geçtiğini anlattık. [Klinik onaylı içerik]\n\nSorularınız için bu e-postayı yanıtlayabilirsiniz."]),
  ...pair("nurture_2", "MARKETING",
    ["Any questions we can answer?", "Hello {{firstName}},\n\nWe're happy to answer any questions before you decide. [Clinic-approved content]"],
    ["Yanıtlayabileceğimiz sorular var mı?", "Merhaba {{firstName}},\n\nKarar vermeden önce sorularınızı yanıtlamaktan memnuniyet duyarız. [Klinik onaylı içerik]"]),
  ...pair("abandonment", "MARKETING",
    ["Did you mean to finish your request?", "Hello {{firstName}},\n\nIt looks like your appointment request wasn't completed. You can finish it any time on our website or reply to this email."],
    ["Talebinizi tamamlamak ister misiniz?", "Merhaba {{firstName}},\n\nRandevu talebiniz tamamlanmamış görünüyor. İstediğiniz zaman web sitemizden tamamlayabilir veya bu e-postayı yanıtlayabilirsiniz."]),
  ...pair("appt_reminder", "SERVICE",
    ["Appointment reminder", "Hello {{firstName}}, this is a reminder of your Dent Flex appointment on {{appointmentTime}}. To change it, please contact the clinic."],
    ["Randevu hatırlatması", "Merhaba {{firstName}}, {{appointmentTime}} tarihindeki Dent Flex randevunuzu hatırlatırız. Değiştirmek için lütfen klinikle iletişime geçin."], ["EMAIL", "WHATSAPP"]),
  ...pair("appt_reminder_short", "SERVICE",
    ["See you soon", "Hello {{firstName}}, see you at {{appointmentTime}}. — Dent Flex"],
    ["Yakında görüşmek üzere", "Merhaba {{firstName}}, {{appointmentTime}} saatinde görüşmek üzere. — Dent Flex"], ["WHATSAPP"]),
  ...pair("cancellation", "SERVICE",
    ["Your appointment was cancelled", "Hello {{firstName}}, your appointment has been cancelled. If you'd like a new time, just reply or contact the clinic."],
    ["Randevunuz iptal edildi", "Merhaba {{firstName}}, randevunuz iptal edildi. Yeni bir saat isterseniz bu mesajı yanıtlayın veya klinikle iletişime geçin."]),
  ...pair("no_show", "SERVICE",
    ["We missed you", "Hello {{firstName}}, we're sorry we didn't see you today. If you'd like to arrange another time, reply or contact the clinic."],
    ["Sizi göremedik", "Merhaba {{firstName}}, bugün sizi göremediğimiz için üzgünüz. Başka bir zaman ayarlamak isterseniz yanıtlayın veya klinikle iletişime geçin."]),
  ...pair("review_request", "MARKETING",
    ["How was your visit?", "Hello {{firstName}}, thank you for visiting Dent Flex. If you're willing, we'd value your honest feedback: [review link to be configured]."],
    ["Ziyaretiniz nasıldı?", "Merhaba {{firstName}}, Dent Flex'i ziyaret ettiğiniz için teşekkürler. Uygun görürseniz dürüst görüşlerinizi duymak isteriz: [yorum bağlantısı yapılandırılacak]."]),
];
