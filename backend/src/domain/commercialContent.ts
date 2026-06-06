// Bilingual (EN + AR) boilerplate for the commercial offer, transcribed from
// the reference offer QTN-26-00992. Arabic is kept in clean LOGICAL order;
// rendering applies shapeAr() (see pdf-commercial.service) to fix the digit/
// Latin runs that PDFKit would otherwise reverse.

export const INTRO_EN =
  "Powerline is one of the lead Egyptian manufacturers of electrification " +
  "solutions who cares to satisfy the market needs and fulfil many inquiries in " +
  "the electrical market by offering diversified solutions for electrical " +
  "distribution and also, certified from ABB as a qualified assembly " +
  "manufacturer to use their products.";

export const PRODUCT_LABELS = [
  "LV Main Distribution Boards",
  "LV Sub-Distribution Panels",
  "MV SF6 Ring Main Units",
  "MV AIR-Insulated Ring Main Units",
];

export const PRICE_NOTE_EN =
  "Prices are linked to the US Dollar exchange rate at the Central Bank until the date of receipt.";
export const PRICE_NOTE_AR =
  "الأسعار مرتبطة بسعر صرف الدولار في البنك المركزي حتى تاريخ الإستلام.";

export interface BiTerm {
  enHeading: string;
  arHeading: string;
  enBullets: string[];
  arBullets: string[];
}

export const GENERAL_TITLE_EN = "General Terms & Conditions";
export const GENERAL_TITLE_AR = "الشروط والأحكام العامة";

export const GENERAL_TERMS: BiTerm[] = [
  {
    enHeading: "Validity of the Offer",
    arHeading: "صلاحية العرض",
    enBullets: [
      "The offer is valid for a period of ONE week starting from the offer date.",
      "The offer validity can be extended with a written request before offer expiry.",
      "Powerline has the right to change prices, terms and conditions after offer expiry.",
    ],
    arBullets: [
      "يسري هذا العرض لمدة أسبوع تبدأ من تاريخ إرسال العرض.",
      "يمكن تمديد صلاحية العرض بطلب كتابي قبل انتهاء صلاحية العرض.",
      "يحق لشركة باورلاين تغيير الأسعار والشروط والأحكام بعد انتهاء صلاحية العرض.",
    ],
  },
  {
    enHeading: "Shop Drawings Approvals",
    arHeading: "اعتماد الرسومات الفنية",
    enBullets: [
      "Shop drawings shall be provided within 10 days from the date of purchase order, letter of award and advance payment whichever comes the latest, and the customer shall approve shop drawings within 5 days from receiving them.",
    ],
    arBullets: [
      "سيتم إنهاء الرسومات الفنية خلال 10 أيام من تاريخ أمر التوريد أو خطاب الترسية أو الدفعة المقدمة أيهما الأحق، وعلى العميل اعتماد هذه الرسومات خلال 5 أيام من استلام الرسومات.",
    ],
  },
  {
    enHeading: "Taxes",
    arHeading: "الضرائب",
    enBullets: [
      "The offer excludes any applicable taxes, stamps and insurance and excludes sales taxes, value added taxes.",
    ],
    arBullets: [
      "عرض السعر لا يشمل أي دمغات أو ضرائب أو تأمينات واجبة التطبيق، ولا يشمل ضريبة المبيعات وضريبة القيمة المضافة.",
    ],
  },
  {
    enHeading: "Warranty",
    arHeading: "فترة الضمان",
    enBullets: [
      "Powerline's warranty policy will not cover normal wears of the equipment, neglecting maintenance, operation by unqualified persons or improper use of the equipment.",
      "The Company warrants its (Products/Works) against manufacturing defects for a period of (12) months starting from the provisional acceptance date of receiving the (Products/Works) or deemed acceptance date which is passing 2 weeks from informing the customer that (Products/Works) are ready to be tested and delivered while the customer's default doing the same during this period.",
    ],
    arBullets: [
      "لن تغطي سياسة ضمان باورلاين التآكل العادي للمعدات أو إهمال الصيانة أو التشغيل من قبل أشخاص غير مؤهلين أو الاستخدام غير السليم للمعدات.",
      "تضمن الشركة (معداتها/أعمالها) ضد عيوب التصنيع لمدة 12 شهرًا بدءًا من تاريخ الاستلام الابتدائي لـ(المعدات/الأعمال) أو تاريخ القبول المعتبر وهو مرور أسبوعين بعد إخطار العميل بأن (المعدات/الأعمال) جاهزة للاختبار والتسليم في حين تقصير العميل القيام بالشيء نفسه في غضون تلك المدة.",
    ],
  },
  {
    enHeading: "Variations",
    arHeading: "تغيير قيمة العقد",
    enBullets: [
      "Customer has the right within one week from purchase order or contract date to change the value of the contract in the range of ±15% by a written variation contract approved by both sides.",
      "In the event of a change in the foreign currency rate from the Central Bank during the validity period of the offer, Powerline has the right to review and amend the prices.",
    ],
    arBullets: [
      "يحق للعميل في غضون أسبوع واحد فقط من أمر الشراء أو تاريخ العقد تغيير قيمة العقد في نطاق ±15% بموجب عقد تغيير مكتوب معتمد من كلا الجانبين.",
      "في حالة تغيير سعر العملة الأجنبية بالبنك المركزي في فترة التنفيذ، يحق لشركة باورلاين مراجعة وتعديل الأسعار.",
    ],
  },
  {
    enHeading: "Contract Termination",
    arHeading: "إنهاء العقد",
    enBullets: [
      "Should the purchaser cancel the order after signature during preparation of the supplier in executing the contract (studies, purchasing materials, etc.) the purchaser pays the supplier all expenses and compensations for these losses.",
      "In the event of the purchaser cancel the order after supplier starts manufacturing, the supplier have the right to hold the down payment, also the supplier will have the right to ask the purchaser for compensation for his losses.",
    ],
    arBullets: [
      "يجب على العميل في حالة إلغاء الأمر بعد التوقيع أثناء تجهيز المورد لتنفيذ العقد (دراسات، مواد شراء، إلخ...) أن يدفع العميل للمورد جميع النفقات والتعويضات عن هذه الخسائر.",
      "إذا ألغى المشتري الطلب بعد تصنيع المهمات، فسيكون للمورد الحق في تأجيل الدفعة المقدمة، كما يحق للمورد مطالبة العميل بتعويض عن خسائره.",
    ],
  },
  {
    enHeading: "Applicable Laws",
    arHeading: "النزاع والخلافات",
    enBullets: [
      "In case any conflict happens between both parties, they dedicate all their appropriate means to settle the issue amicably. In case attempts fails, Egyptian Laws shall be applied in front of Cairo concerned Courts.",
    ],
    arBullets: [
      "في حالة حدوث أي نزاع بين الطرفين، سيتم محاولة كل الطرق المناسبة لتسوية النزاع وديًا. في حالة فشل المحاولات تطبق القوانين المصرية أمام محاكم القاهرة المختصة.",
    ],
  },
  {
    enHeading: "Force Majeure",
    arHeading: "القوى القهرية",
    enBullets: [
      "In case of devaluation of EGP conducted by CBE during the offer validity period, Powerline has the right to reprice the offer to imbed such currency effect in the pricing.",
      "Powerline will not be liable for any delay in delivery time mentioned in this offer which result attributable to COVID-19 Ramifications.",
    ],
    arBullets: [
      "في حالة قيام البنك المركزي المصري بتخفيض قيمة الجنيه المصري خلال فترة التنفيذ، يحق لشركة باورلاين إعادة تسعير العرض لفرض قيمة تأثير العملة.",
      "باورلاين غير مسؤولة عن أي تأخير في مدة التسليم المذكورة في العرض والذي قد ينتج عن تداعيات COVID-19.",
    ],
  },
];

export const SPECIAL_TITLE_EN = "Special Terms & Conditions";
export const SPECIAL_TITLE_AR = "الشروط والأحكام الخاصة";

export const SPECIAL_TERMS: BiTerm[] = [
  {
    enHeading: "Payment Terms",
    arHeading: "شروط الدفع",
    enBullets: [
      "(50)% Of the total price as an advance payment by a certified check or in cash.",
      "(50)% of the total price after testing at factory and before the delivery by certified check or in cash.",
      "In case of delaying the advance payment more than two weeks from purchase order / contract date, Powerline has the right to terminate the contract.",
    ],
    arBullets: [
      "(50%) من السعر الإجمالي كدفعة مقدمة عند صدور أمر التوريد بشيك بنكي مقبول الدفع أو نقدًا.",
      "(50%) من السعر الإجمالي بعد اختبار المهمات بالمصنع وقبل الاستلام وذلك بشيك مقبول الدفع أو نقدًا.",
      "في حالة تأخر الدفعة المقدمة أكثر من أسبوعين من تاريخ أمر التوريد أو من تاريخ العقد، يحق لشركة باورلاين إلغاء العقد.",
    ],
  },
  {
    enHeading: "Delivery Period",
    arHeading: "مدة التوريد",
    enBullets: [
      "(3-4) Months.",
      "All delivery periods will be calculated from the date of purchase order, receiving the advance payment and receiving drawings approval whichever comes the latest.",
    ],
    arBullets: [
      "(3-4) شهر.",
      "سيتم احتساب جميع فترات التسليم من تاريخ أمر الشراء واستلام الدفعة المقدمة واستلام اعتماد الرسومات الفنية أيهما الأحق.",
    ],
  },
  {
    enHeading: "Delivery Place",
    arHeading: "الإستلام",
    enBullets: [
      "Delivery from our factories at 10th of Ramadan city.",
      "Powerline has the right to charge the customer 1% of the total contract value for each week in case of delaying in receiving the equipment as storing costs.",
    ],
    arBullets: [
      "يتم الاستلام من مصانعنا بالعاشر من رمضان.",
      "يحق لشركة باورلاين فرض غرامة (تكاليف تخزين) بقيمة 1% من إجمالي العقد في حالة تأخر العميل في استلام المهمات من المصنع عن أسبوعين من تاريخ الإخطار بجاهزية المهمات أو تاريخ الاختبار أيهما الأحق.",
    ],
  },
];

export const OFFICES = [
  { name: "Head Office", address: "20 Ammar Ibn Yasser, Heliopolis, Cairo", tel: "+2 02 2621 5022" },
  { name: "Alex Branch", address: "392-A El Horeya, Roof Mustafa Kamel, Alexandria", tel: "+2 03 5465 801" },
  { name: "Factory", address: "10th of Ramadan, Industrial Area C3, Block 112", tel: "+2 055 4363 832" },
];
export const CONTACT_EMAIL = "info@powerline.com.eg";
