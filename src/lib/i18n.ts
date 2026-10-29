import { cookies } from "next/headers";

export type Lang = "en" | "tr";
export const LANG_COOKIE = "df_lang";

export async function getLang(): Promise<Lang> {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return v === "tr" ? "tr" : "en";
}

// Turkish copy is a draft for clinic review before launch.
export const dict = {
  en: {
    nav: { treatments: "Treatments", team: "Our team", visit: "Your visit", contact: "Contact", book: "Request an appointment" },
    hero: {
      eyebrow: "Dent Flex · Istanbul",
      title: "Unhurried dental care, explained clearly.",
      body: "Tell us what you are looking for and our reception team will get back to you to arrange a consultation. No account needed.",
      primary: "Request an appointment",
      secondary: "Get a free treatment plan",
    },
    trust: {
      title: "What we can tell you today",
      note: "Credentials, accreditations and reviews will appear here once the clinic has verified them. We do not show ratings or badges we cannot evidence.",
    },
    treatments: { title: "Treatments", intro: "Descriptions and prices shown here are those approved and published by the clinic.", noPrice: "Contact the clinic for an estimate", details: "Ask about this treatment", empty: "Treatment information is being prepared by the clinic." },
    team: { title: "The people you will meet", intro: "Profiles are published only after the clinic verifies names, roles and credentials.", placeholder: "Profile placeholder" },
    comfort: {
      title: "What to expect",
      steps: [
        ["Get in touch", "Send a short request, call, or use the assistant. We only ask for what we need to reply."],
        ["We call you back", "A member of the reception team contacts you to understand what you need and find a time."],
        ["Your consultation", "A dentist examines you and explains options. Treatment is only planned after an examination."],
        ["Clear next steps", "You receive a written plan and can take time to decide. No pressure, no surprises."],
      ],
    },
    testimonials: { title: "Patient stories", placeholder: "Genuine patient reviews will be shown here once the clinic supplies them with permission." },
    faq: { title: "Questions", empty: "Frequently asked questions are being prepared by the clinic." },
    contact: { title: "Visit or contact us", hours: "Opening hours", address: "Address", phone: "Phone", email: "Email", placeholder: "Clinic details below are placeholders until confirmed by the clinic." },
    form: {
      title: "Request an appointment",
      intro: "This sends a request. Your appointment is only confirmed once our team contacts you and agrees a time.",
      name: "Full name", email: "Email", phone: "Phone (with country code)", contactHint: "Give us at least one: phone or email.",
      language: "Preferred language", treatment: "Treatment you are interested in (optional)", notSure: "Not sure yet",
      channel: "How should we contact you? (optional)", time: "Best time to reach you (optional)", timePh: "e.g. weekday mornings",
      timeframe: "When would you like to visit? (optional)", timeframePh: "e.g. within the next two weeks",
      wantsAppointment: "I would like to book a consultation", nextStep: "What would help most? (optional)",
      nextSteps: { PRICE_INFO: "Price information", CONSULTATION_DETAILS: "Consultation details", CALLBACK: "A call back" },
      message: "Anything else? (optional)", messageHint: "Please don't include detailed medical history here — the dentist will discuss it with you in person.",
      privacy: "I have read the privacy notice and agree that Dent Flex may contact me about this request.",
      marketing: "Optional: send me occasional clinic news by email/WhatsApp. I can unsubscribe at any time.",
      submit: "Send request", sending: "Sending…",
      successTitle: "Thank you — your request has been received.",
      successBody: "Your reference is {ref}. This is not yet a confirmed appointment; our reception team will contact you to arrange a time.",
      errorSummary: "Please fix the following:", networkError: "We couldn't send your request. Please check your connection and try again, or call the clinic.",
    },
    footer: { privacy: "Privacy notice", rights: "Demo build — clinic facts, prices and team details must be verified before launch.", emergency: "Emergency" },
    home: {
      introTitle: "Dental care, considered",
      introBody: "We take the time to examine, explain and plan with you, so you understand every option before anything begins.",
      splitTitle: "A calm clinic built around clear answers",
      splitBody: "Reception helps you arrange a consultation. The dentist examines you and explains your options in plain language. You leave with a written plan and time to decide — no pressure, no surprises.",
      splitCta: "Your visit",
      statValue: "EN · TR",
      statLabel: "Care in English and Turkish",
      teamTitleA: "The people behind",
      teamTitleB: "every visit.",
      teamBody: "Dentist profiles appear here once the clinic has verified names, roles and credentials.",
      servicesTitle: "Our Treatments",
      servicesCta: "View all treatments",
      reviewsTitle: "Patient stories",
      pricingTitle: "Clear, Published Pricing",
      pricingBody: "Where the clinic has approved a price, you will find it on the treatments page together with what it includes. A final plan and price always follow an examination.",
      pricingCta: "See treatments & prices",
      comfortTitleA: "Comfort, from",
      comfortTitleB: "first call to follow-up",
      comfortBody: "A dental visit should not feel rushed. We keep appointments unhurried, explain each step before it happens and check in afterwards, so you always know what comes next.",
      apartTitle: "Why Dent Flex?",
      apartBody: "A few principles shape every visit.",
      apart: [
        ["Explained, not rushed", "Every option is set out in plain language, with time for your questions before you decide."],
        ["Published prices", "Approved prices are shown openly, with inclusions and exclusions — never invented or improvised."],
        ["Your language", "Talk to us in English or Turkish, by form, phone or our website assistant."],
        ["A person within reach", "The assistant can answer questions at any hour, but a member of our team follows up every request."],
      ],
      stepsTitle: "Your visit, step by step",
      faqTitleA: "Answers",
      faqTitleB: "Before You Visit",
      faqBody: "Common questions from new patients. Can't find yours? Send us a message and our team will reply.",
      visitTitle: "Visit Us",
      directions: "Get directions",
      closingTitle: "Keep your natural smile",
      closingBody: "Whether it is a check-up or a second opinion, we are ready to help. Send a request and our team will be in touch.",
    },
    menu: {
      open: "Open menu", close: "Close menu",
      groups: [
        ["Treatments", [["/treatments", "All treatments"], ["/treatments#consultation", "Consultation"], ["/treatments#implants", "Implants"], ["/treatments#whitening", "Whitening"]]],
        ["Patients", [["/#visit", "Your visit"], ["/#faq", "Questions"], ["/contact#request", "Request an appointment"], ["/privacy", "Privacy notice"]]],
        ["Clinic", [["/team", "Our team"], ["/contact", "Contact & location"]]],
      ],
    },
    assistant: { open: "Ask the assistant", title: "Dent Flex assistant", disclosure: "Our patient coordinators are AI-powered and work from the clinic's published information — ask for a person any time. No medical advice in chat.", placeholder: "Type your question…", send: "Send", human: "Talk to a person", close: "Close" },
  },
  tr: {
    nav: { treatments: "Tedaviler", team: "Ekibimiz", visit: "Ziyaretiniz", contact: "İletişim", book: "Randevu talep et" },
    hero: {
      eyebrow: "Dent Flex · İstanbul",
      title: "Acelesiz, açıkça anlatılan diş bakımı.",
      body: "Ne aradığınızı bize iletin; resepsiyon ekibimiz muayene planlamak için size dönüş yapsın. Hesap oluşturmanız gerekmez.",
      primary: "Randevu talep et",
      secondary: "Ücretsiz tedavi planı al",
    },
    trust: {
      title: "Bugün size söyleyebileceklerimiz",
      note: "Sertifikalar, akreditasyonlar ve yorumlar klinik tarafından doğrulandıktan sonra burada yer alacaktır. Kanıtlayamadığımız puan veya rozet göstermiyoruz.",
    },
    treatments: { title: "Tedaviler", intro: "Burada gösterilen açıklamalar ve fiyatlar klinik tarafından onaylanıp yayımlananlardır.", noPrice: "Fiyat bilgisi için kliniğe ulaşın", details: "Bu tedavi hakkında sorun", empty: "Tedavi bilgileri klinik tarafından hazırlanmaktadır." },
    team: { title: "Tanışacağınız ekip", intro: "Profiller, klinik isimleri, unvanları ve yetkinlikleri doğruladıktan sonra yayımlanır.", placeholder: "Profil yer tutucusu" },
    comfort: {
      title: "Sizi neler bekliyor",
      steps: [
        ["Bize ulaşın", "Kısa bir talep gönderin, arayın ya da asistanı kullanın. Yalnızca size dönmek için gerekenleri isteriz."],
        ["Sizi arıyoruz", "Resepsiyon ekibimiz ihtiyacınızı anlamak ve uygun bir zaman bulmak için sizinle iletişime geçer."],
        ["Muayeneniz", "Diş hekimi sizi muayene eder ve seçenekleri açıklar. Tedavi yalnızca muayeneden sonra planlanır."],
        ["Net sonraki adımlar", "Yazılı bir plan alırsınız ve karar vermek için zaman tanınır. Baskı yok, sürpriz yok."],
      ],
    },
    testimonials: { title: "Hasta deneyimleri", placeholder: "Gerçek hasta yorumları, klinik izinli olarak sağladığında burada gösterilecektir." },
    faq: { title: "Sorular", empty: "Sıkça sorulan sorular klinik tarafından hazırlanmaktadır." },
    contact: { title: "Bizi ziyaret edin veya ulaşın", hours: "Çalışma saatleri", address: "Adres", phone: "Telefon", email: "E-posta", placeholder: "Aşağıdaki klinik bilgileri, klinik onaylayana kadar yer tutucudur." },
    form: {
      title: "Randevu talep et",
      intro: "Bu bir taleptir. Randevunuz, ekibimiz sizinle iletişime geçip bir saat üzerinde anlaştığında kesinleşir.",
      name: "Ad soyad", email: "E-posta", phone: "Telefon (ülke koduyla)", contactHint: "En az birini girin: telefon veya e-posta.",
      language: "Tercih edilen dil", treatment: "İlgilendiğiniz tedavi (isteğe bağlı)", notSure: "Henüz emin değilim",
      channel: "Size nasıl ulaşalım? (isteğe bağlı)", time: "Size ulaşmak için en uygun zaman (isteğe bağlı)", timePh: "örn. hafta içi sabah",
      timeframe: "Ne zaman gelmek istersiniz? (isteğe bağlı)", timeframePh: "örn. önümüzdeki iki hafta içinde",
      wantsAppointment: "Muayene randevusu almak istiyorum", nextStep: "En çok ne işinize yarar? (isteğe bağlı)",
      nextSteps: { PRICE_INFO: "Fiyat bilgisi", CONSULTATION_DETAILS: "Muayene detayları", CALLBACK: "Geri arama" },
      message: "Eklemek istediğiniz bir şey var mı? (isteğe bağlı)", messageHint: "Lütfen buraya ayrıntılı sağlık geçmişi yazmayın — diş hekimi bunu sizinle yüz yüze konuşacaktır.",
      privacy: "Aydınlatma metnini okudum; Dent Flex'in bu talep hakkında benimle iletişime geçmesini kabul ediyorum.",
      marketing: "İsteğe bağlı: bana ara sıra e-posta/WhatsApp ile klinik haberleri gönderin. İstediğim zaman çıkabilirim.",
      submit: "Talebi gönder", sending: "Gönderiliyor…",
      successTitle: "Teşekkürler — talebiniz alındı.",
      successBody: "Referans numaranız {ref}. Bu henüz kesinleşmiş bir randevu değildir; resepsiyon ekibimiz saat belirlemek için sizinle iletişime geçecek.",
      errorSummary: "Lütfen şunları düzeltin:", networkError: "Talebiniz gönderilemedi. Bağlantınızı kontrol edip tekrar deneyin veya kliniği arayın.",
    },
    footer: { privacy: "Aydınlatma metni", rights: "Demo sürüm — klinik bilgileri, fiyatlar ve ekip bilgileri yayından önce doğrulanmalıdır.", emergency: "Acil durum" },
    home: {
      introTitle: "Özenle düşünülmüş diş bakımı",
      introBody: "Sizi muayene etmek, açıklamak ve birlikte planlamak için zaman ayırıyoruz; böylece hiçbir şey başlamadan önce tüm seçenekleri anlarsınız.",
      splitTitle: "Net yanıtlar üzerine kurulu sakin bir klinik",
      splitBody: "Resepsiyon muayene ayarlamanıza yardımcı olur. Diş hekimi sizi muayene eder ve seçenekleri sade bir dille açıklar. Yazılı bir plan ve karar vermek için zamanla ayrılırsınız — baskı yok, sürpriz yok.",
      splitCta: "Ziyaretiniz",
      statValue: "EN · TR",
      statLabel: "İngilizce ve Türkçe hizmet",
      teamTitleA: "Her ziyaretin",
      teamTitleB: "arkasındaki ekip.",
      teamBody: "Hekim profilleri, klinik isimleri, unvanları ve yetkinlikleri doğruladıktan sonra burada yer alır.",
      servicesTitle: "Tedavilerimiz",
      servicesCta: "Tüm tedaviler",
      reviewsTitle: "Hasta deneyimleri",
      pricingTitle: "Açık, Yayımlanmış Fiyatlar",
      pricingBody: "Klinik bir fiyatı onayladıysa, neleri kapsadığıyla birlikte tedaviler sayfasında bulursunuz. Kesin plan ve fiyat her zaman muayeneden sonra verilir.",
      pricingCta: "Tedaviler ve fiyatlar",
      comfortTitleA: "İlk aramadan",
      comfortTitleB: "kontrole kadar konfor",
      comfortBody: "Diş ziyareti aceleye gelmemeli. Randevuları sakin tutar, her adımı önceden açıklar ve sonrasında sizi ararız; böylece sırada ne olduğunu hep bilirsiniz.",
      apartTitle: "Neden Dent Flex?",
      apartBody: "Her ziyareti şekillendiren birkaç ilke.",
      apart: [
        ["Aceleye getirilmeden, açıklanarak", "Her seçenek sade bir dille anlatılır; karar vermeden önce sorularınıza zaman ayrılır."],
        ["Yayımlanmış fiyatlar", "Onaylı fiyatlar, dahil olan ve olmayanlarla birlikte açıkça gösterilir — asla uydurulmaz."],
        ["Kendi dilinizde", "Bize İngilizce veya Türkçe; form, telefon ya da web asistanı ile ulaşın."],
        ["Her zaman ulaşılabilir bir kişi", "Asistan her saatte soruları yanıtlayabilir, ancak her talebi ekibimizden biri takip eder."],
      ],
      stepsTitle: "Adım adım ziyaretiniz",
      faqTitleA: "Ziyaretten",
      faqTitleB: "Önce Yanıtlar",
      faqBody: "Yeni hastaların sık sorduğu sorular. Sorunuzu bulamadınız mı? Bize mesaj gönderin, ekibimiz yanıtlasın.",
      visitTitle: "Bizi Ziyaret Edin",
      directions: "Yol tarifi",
      closingTitle: "Doğal gülüşünüzü koruyun",
      closingBody: "İster kontrol ister ikinci görüş olsun, yardıma hazırız. Bir talep gönderin, ekibimiz sizinle iletişime geçsin.",
    },
    menu: {
      open: "Menüyü aç", close: "Menüyü kapat",
      groups: [
        ["Tedaviler", [["/treatments", "Tüm tedaviler"], ["/treatments#consultation", "Muayene"], ["/treatments#implants", "İmplant"], ["/treatments#whitening", "Beyazlatma"]]],
        ["Hastalar", [["/#visit", "Ziyaretiniz"], ["/#faq", "Sorular"], ["/contact#request", "Randevu talep et"], ["/privacy", "Aydınlatma metni"]]],
        ["Klinik", [["/team", "Ekibimiz"], ["/contact", "İletişim ve konum"]]],
      ],
    },
    assistant: { open: "Asistana sor", title: "Dent Flex asistanı", disclosure: "Hasta koordinatörlerimiz yapay zekâ destekli olup kliniğin yayımladığı bilgilerle çalışır — dilediğiniz an bir kişiyle görüşebilirsiniz. Sohbette tıbbi tavsiye verilmez.", placeholder: "Sorunuzu yazın…", send: "Gönder", human: "Bir kişiyle görüş", close: "Kapat" },
  },
} as const;

export type Dict = (typeof dict)["en"];

export async function getDict(): Promise<{ lang: Lang; t: Dict }> {
  const lang = await getLang();
  return { lang, t: dict[lang] as unknown as Dict };
}
