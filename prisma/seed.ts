/* Demo-only seed. Contains NO real clinic facts, prices, staff or patients. */
import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULTS } from "../src/lib/settings";
import { WORKFLOW_TEMPLATES, MESSAGE_TEMPLATES } from "../src/lib/automation/templates";
import { AGENT_SEED } from "../src/lib/assistant/agents";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "admin@dentflex.local").toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe-Demo-Only-123";
  const hash = await bcrypt.hash(adminPassword, 12);

  const admin = await prisma.staffUser.upsert({
    where: { email: adminEmail },
    update: {},
    create: { email: adminEmail, name: "Demo Admin", role: "ADMIN", passwordHash: hash },
  });
  // Demo staff share the admin demo password so role-based access can be tried locally (never on Vercel).
  for (const [email, name, role] of process.env.VERCEL ? [] : [
    ["reception@dentflex.local", "Demo Receptionist", "RECEPTIONIST"],
    ["clinician@dentflex.local", "Demo Clinician", "CLINICIAN"],
  ] as const) {
    await prisma.staffUser.upsert({ where: { email }, update: {}, create: { email, name, role, passwordHash: hash } });
  }

  for (const [key, value] of Object.entries(DEFAULTS)) {
    await prisma.clinicSetting.upsert({ where: { key }, update: {}, create: { key, value: value as Prisma.InputJsonValue } });
  }

  // Treatment categories with neutral placeholder copy. No published prices: the site
  // shows "Contact the clinic for an estimate" until an admin approves and publishes one.
  const treatments = [
    ["consultation", "Consultation & examination", "Muayene ve değerlendirme"],
    ["hygiene", "Professional cleaning", "Profesyonel diş temizliği"],
    ["whitening", "Teeth whitening", "Diş beyazlatma"],
    ["implants", "Dental implants", "Diş implantı"],
    ["veneers", "Veneers", "Lamina / kaplama"],
    ["orthodontics", "Orthodontics & clear aligners", "Ortodonti ve şeffaf plak"],
  ] as const;
  for (const [i, [slug, nameEn, nameTr]] of treatments.entries()) {
    await prisma.treatment.upsert({
      where: { slug },
      update: {},
      create: {
        slug, nameEn, nameTr, sortOrder: i, approved: true,
        summaryEn: "[Placeholder description — the clinic will supply approved wording for this treatment.]",
        summaryTr: "[Yer tutucu açıklama — klinik bu tedavi için onaylı metni sağlayacaktır.]",
      },
    });
  }
  const consult = await prisma.treatment.findUniqueOrThrow({ where: { slug: "consultation" } });
  if (!(await prisma.treatmentPriceVersion.count({ where: { treatmentId: consult.id } }))) {
    await prisma.treatmentPriceVersion.create({
      data: {
        treatmentId: consult.id, version: 1, status: "DRAFT", currency: "TRY", amountMinor: null,
        inclusions: "[DEMO DRAFT — not a real price]", effectiveFrom: new Date(), createdById: admin.id,
      },
    });
  }

  // FAQs about how the service works (not clinical or business facts).
  if (!(await prisma.faq.count())) {
    await prisma.faq.createMany({
      data: [
        {
          sortOrder: 1, status: "PUBLISHED",
          questionEn: "Is my appointment confirmed when I send the form?",
          answerEn: "No. The form sends a request. A member of our reception team will contact you to agree a time, and only then is the appointment confirmed.",
          questionTr: "Formu gönderdiğimde randevum kesinleşiyor mu?",
          answerTr: "Hayır. Form bir talep gönderir. Resepsiyon ekibimiz bir saat belirlemek için sizinle iletişime geçer; randevu ancak o zaman kesinleşir.",
        },
        {
          sortOrder: 2, status: "PUBLISHED",
          questionEn: "Do I need to create an account?",
          answerEn: "No. You only need to give your name and a phone number or email address so we can reply.",
          questionTr: "Hesap oluşturmam gerekiyor mu?",
          answerTr: "Hayır. Size dönebilmemiz için yalnızca adınızı ve bir telefon numarası veya e-posta adresi vermeniz yeterli.",
        },
        {
          sortOrder: 3, status: "PUBLISHED",
          questionEn: "Can I get an exact price before an examination?",
          answerEn: "Where the clinic has published a price it is shown on the treatments page. A final plan and price can only be given after a dentist has examined you.",
          questionTr: "Muayeneden önce kesin fiyat alabilir miyim?",
          answerTr: "Klinik bir fiyat yayımladıysa tedaviler sayfasında gösterilir. Kesin plan ve fiyat ancak diş hekimi muayenesinden sonra verilebilir.",
        },
        {
          sortOrder: 4, status: "PUBLISHED",
          questionEn: "Is the website assistant a person?",
          answerEn: "No, it is an AI assistant. It answers from information the clinic has published and can pass your request to our team. It cannot give medical advice.",
          questionTr: "Web sitesindeki asistan bir insan mı?",
          answerTr: "Hayır, bir yapay zekâ asistanıdır. Kliniğin yayımladığı bilgilerden yanıt verir ve talebinizi ekibimize iletebilir. Tıbbi tavsiye veremez.",
        },
      ],
    });
  }

  if (!(await prisma.teamMember.count())) {
    await prisma.teamMember.createMany({
      data: [1, 2, 3].map((n) => ({
        name: `[Dentist ${n} — name pending]`, title: "[Role and credentials pending verification]",
        bio: "[Biography to be supplied and approved by the clinic.]", isPlaceholder: true, status: "DRAFT" as const, sortOrder: n,
      })),
    });
  }

  for (const tpl of MESSAGE_TEMPLATES) {
    await prisma.messageTemplate.upsert({
      where: { key_channel_locale_version: { key: tpl.key, channel: tpl.channel, locale: tpl.locale, version: 1 } },
      update: {},
      create: { ...tpl, version: 1, status: "DRAFT" },
    });
  }
  for (const wf of WORKFLOW_TEMPLATES) {
    await prisma.workflow.upsert({
      where: { templateKey: wf.key },
      update: {},
      create: { templateKey: wf.key, name: wf.name, description: wf.description, status: "DRAFT", draftGraph: wf.graph as unknown as Prisma.InputJsonValue },
    });
  }

  // Ten named AI sales agents (personas + voices). Safe to re-run: existing agents are kept as edited.
  for (const agent of AGENT_SEED) {
    await prisma.aiAgent.upsert({ where: { slug: agent.slug }, update: {}, create: agent });
  }

  // Researched market reference prices (Oct 2026), loaded as DRAFT for an admin to review and
  // publish. Savings only show once the clinic publishes its own price in the same currency.
  const checkedAt = new Date("2026-10-29");
  const references = [
    ["implants", "GB", "United Kingdom (private, single implant)", "GBP", 2000_00, 3500_00, "WeCovr UK private dental cost guide 2026", "https://wecovr.com/guides/average-cost-of-private-dental-treatment-in-the-uk-2026-price-guide/"],
    ["veneers", "GB", "United Kingdom (porcelain, per tooth)", "GBP", 250_00, 975_00, "TreatCompare survey of 1,622 UK practices, May 2026", "https://www.treatcompare.com/articles/veneer-cost-uk"],
    ["whitening", "GB", "United Kingdom (professional whitening)", "GBP", 150_00, 696_00, "TreatCompare UK teeth whitening prices", "https://www.treatcompare.com/articles/teeth-whitening-cost-uk"],
    ["orthodontics", "GB", "United Kingdom (Invisalign / clear aligners)", "GBP", 1500_00, 5500_00, "Dentists Closeby Invisalign cost guide", "https://dentistscloseby.com/blog/invisalign-cost-uk-complete-guide"],
    ["implants", "US", "United States (single implant, state averages)", "USD", 3759_00, 5733_00, "DataHub US dental costs 2026", "https://datahub.io/us-dental-costs-2026"],
  ] as const;
  for (const [slug, market, marketLabel, currency, minMinor, maxMinor, sourceName, sourceUrl] of references) {
    const treatment = await prisma.treatment.findUnique({ where: { slug } });
    if (!treatment || (await prisma.comparisonPrice.count({ where: { treatmentId: treatment.id, market, sourceName } }))) continue;
    await prisma.comparisonPrice.create({
      data: { treatmentId: treatment.id, market, marketLabel, currency, minMinor, maxMinor, sourceName, sourceUrl, checkedAt, status: "DRAFT", createdById: admin.id },
    });
  }

  console.log(`Seed complete. Demo admin: ${adminEmail} (change the password immediately).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
