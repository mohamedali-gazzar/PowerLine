// LV commercial standard Terms & Conditions, ported verbatim from the frontend
// (frontend/src/lv/store.ts) so the RMU commercial carries the SAME company terms.
// The one LV-specific delivery line is adjusted for RMU. English then Arabic.
export interface LvTermSection { title: string; body: string }
export const LV_TERMS_EN: LvTermSection[] = [
  {
    "title": "Validity of the Offer",
    "body": "The offer is valid for a period of three days starting from the offer date. Powerline has the right to change prices, terms and conditions after offer expiry. The offer validity can be extended with a written request before offer expiry."
  },
  {
    "title": "Shop Drawings Approvals",
    "body": "Shop drawings shall be provided within 10 days from the date of purchase order, letter of award and advance payment whichever comes the latest, and the customer shall approve shop drawings within 5 days from receiving them."
  },
  {
    "title": "Taxes",
    "body": "The offer excludes any applicable taxes, stamps and insurance, and excludes sales taxes and value added taxes."
  },
  {
    "title": "Warranty",
    "body": "Powerline's warranty policy will not cover normal wear of the equipment, neglecting maintenance, operation by unqualified persons or improper use of the equipment. The Company warrants its (Products/Works) against manufacturing defects for a period of (12) months starting from the provisional acceptance date of receiving the (Products/Works), or the deemed acceptance date (2 weeks from informing the customer that Products/Works are ready to be tested and delivered while the customer defaults doing the same during this period)."
  },
  {
    "title": "Variations",
    "body": "Customer has the right within one week from purchase order or contract date to change the value of the contract in the range of ±15% by a written variation contract approved by both sides. In the event of a change in the foreign currency rate from the Central Bank during the execution period, prices shall be calculated based on the exchange rate applicable on the actual delivery date for receipt payments."
  },
  {
    "title": "Contract Termination",
    "body": "Should the purchaser cancel the order after signature during preparation of the supplier in executing the contract (studies, purchasing materials, etc.), the purchaser pays the supplier all expenses and compensations for these losses. In the event of the purchaser cancelling the order after the supplier starts manufacturing, the supplier has the right to hold the down payment and to ask the purchaser for compensation for his losses."
  },
  {
    "title": "Applicable Laws",
    "body": "In case any conflict happens between both parties, they dedicate all their appropriate means to settle the issue amicably. In case attempts fail, Egyptian Laws shall be applied in front of Cairo concerned Courts."
  },
  {
    "title": "Force Majeure",
    "body": "In case of devaluation of EGP conducted by CBE during the execution period of the offer, Powerline has the right to reprice the offer to imbed such currency effect in the pricing. Powerline will not be liable for any delay in delivery time mentioned in this offer which results attributable to COVID-19 ramifications."
  },
  {
    "title": "Payment Terms",
    "body": "(50)% of the total price as an advance payment by a certified check or in cash according to the central bank exchange rate on the due date. (50)% of the total price after testing at factory and before delivery by a certified check or in cash according to the central bank exchange rate on the due date. In case of delaying the advance payment more than two weeks from purchase order / contract date, Powerline has the right to terminate the contract."
  },
  {
    "title": "Delivery Period",
    "body": "Ring Main Units: as stated in this commercial offer. All delivery periods will be calculated from the date of purchase order, receiving the advance payment and receiving drawings approval whichever comes the latest. In the event that the required foreign currency is not available through Egyptian banks to procure imported components, Powerline shall be entitled to request payment in foreign currency."
  },
  {
    "title": "Delivery Place",
    "body": "EX Works (EXW) factories at 10th of Ramadan city."
  },
  {
    "title": "Receiving Authorization",
    "body": "The Customer must send an official authorization letter naming the representative authorized to receive the panels from our factories at 10th of Ramadan City. If delivery is made to the customer's location, an official authorization must also be provided for the person authorized by the customer to receive the panels at the location."
  },
  {
    "title": "Storage Penalty",
    "body": "Powerline has the right to impose a penalty (storage costs) of 1% of the total contract value in the event that the customer is late in receiving the supplies from the factory for a period exceeding two weeks from the date of notification of the supplies' readiness or the test date, whichever is later."
  }
];
export const LV_TERMS_AR: LvTermSection[] = [
  {
    "title": "صلاحية العرض",
    "body": "يسري هذا العرض لمدة ثلاثة أيام تبدأ من تاريخ إرسال العرض. يحق لشركة باورلاين تغيير الأسعار والشروط والأحكام بعد انتهاء صلاحية العرض. يمكن تمديد صلاحية العرض بطلب كتابي قبل انتهاء صلاحية العرض."
  },
  {
    "title": "إعتماد الرسومات الفنية",
    "body": "سيتم إنهاء الرسومات الفنية خلال 10 أيام من تاريخ أمر التوريد أو خطاب الترسية أو الدفعة المقدمة أيهما لاحق، وعلى العميل اعتماد هذه الرسومات خلال 5 أيام من استلامها."
  },
  {
    "title": "الضرائب",
    "body": "عرض السعر لا يشمل أي دمغات أو ضرائب أو تأمينات واجبة التطبيق، ولا يشمل ضريبة المبيعات أو ضريبة القيمة المضافة."
  },
  {
    "title": "فترة الضمان",
    "body": "لن تغطي سياسة ضمان باورلاين التآكل العادي للمعدات أو إهمال الصيانة أو التشغيل من قبل أشخاص غير مؤهلين أو الاستخدام غير السليم للمعدات. تضمن الشركة (معداتها/أعمالها) ضد عيوب التصنيع لمدة (12) شهرًا بدءًا من تاريخ الاستلام الابتدائي لـ(المعدات/الأعمال) أو تاريخ القبول المعتبر وهو مرور أسبوعين بعد إخطار العميل بأن (المعدات/الأعمال) جاهزة للاختبار والتسليم في حين تقصير العميل القيام بالشيء نفسه في غضون تلك المدة."
  },
  {
    "title": "تغيّر قيمة العقد",
    "body": "يحق للعميل في غضون أسبوع واحد فقط من أمر الشراء أو تاريخ العقد تغيير قيمة العقد في نطاق ±15% بموجب عقد تغيير مكتوب معتمد من كلا الجانبين. في حالة تغيير سعر العملة الأجنبية بالبنك المركزي خلال مدة التنفيذ يتم احتساب الأسعار طبقًا لسعر العملة في يوم التسليم الفعلي وذلك بالنسبة لدفعات الاستلام."
  },
  {
    "title": "إنهاء العقد",
    "body": "يجب على العميل في حالة إلغاء الأمر بعد التوقيع أثناء تجهيز المورد لتنفيذ العقد (دراسات، شراء مواد، إلخ) أن يدفع للمورد جميع النفقات والتعويضات عن هذه الخسائر. إذا ألغى المشتري الطلب بعد بدء المورد في التصنيع، فيكون للمورد الحق في حجز الدفعة المقدمة وكذلك مطالبة العميل بتعويض عن خسائره."
  },
  {
    "title": "النزاع والخلافات",
    "body": "في حالة حدوث أي نزاع بين الطرفين، يسعى الطرفان بكل الطرق المناسبة لتسوية النزاع وديًا. وفي حالة فشل المحاولات تُطبَّق القوانين المصرية أمام محاكم القاهرة المختصة."
  },
  {
    "title": "القوى القهرية",
    "body": "في حالة قيام البنك المركزي المصري بتخفيض قيمة الجنيه المصري خلال مدة التنفيذ، يحق لشركة باورلاين إعادة تسعير العرض لتضمين قيمة تأثير العملة. باورلاين غير مسؤولة عن أي تأخير في مدة التسليم المذكورة في العرض والذي قد ينتج عن تداعيات COVID-19."
  },
  {
    "title": "شروط الدفع",
    "body": "(50)% من السعر الإجمالي كدفعة مقدمة عند صدور أمر التوريد بشيك بنكي مقبول الدفع أو نقدًا وفقًا لسعر صرف البنك المركزي لتاريخ استحقاقه. (50)% من السعر الإجمالي بعد اختبار المهمات بالمصنع وقبل الاستلام بشيك بنكي مقبول الدفع أو نقدًا وفقًا لسعر صرف البنك المركزي لتاريخ استحقاقه. في حالة تأخر الدفعة المقدمة أكثر من أسبوعين من تاريخ أمر التوريد أو تاريخ العقد، يحق لشركة باورلاين إلغاء العقد."
  },
  {
    "title": "مدة التوريد",
    "body": "وحدات الحلقة الرئيسية: حسب المذكور في هذا العرض. سيتم احتساب جميع فترات التسليم من تاريخ أمر الشراء واستلام الدفعة المقدمة واستلام اعتماد الرسومات الفنية أيهما لاحق. في حالة عدم توافر العملة الأجنبية اللازمة لتوفير المكونات المستوردة بالبنوك المصرية يحق لباورلاين المطالبة بالسداد بالعملة الأجنبية."
  },
  {
    "title": "مكان التوريد",
    "body": "تسليم في موقع المصنع Ex Works (EXW) بمدينة العاشر من رمضان."
  },
  {
    "title": "تفويض الاستلام",
    "body": "يجب على العميل إرسال تفويض رسمي باسم المندوب المفوض باستلام اللوحات من مصانعنا بمدينة العاشر من رمضان. وفي حال تم التسليم في موقع العميل يجب كذلك وجود تفويض رسمي للشخص المفوض من قبل العميل باستلام اللوحات في الموقع."
  },
  {
    "title": "غرامة التخزين",
    "body": "يحق لشركة باورلاين فرض غرامة (تكاليف تخزين) بقيمة 1% من إجمالي قيمة العقد في حالة تأخر العميل عن استلام المهمات من المصنع لمدة تزيد عن أسبوعين من تاريخ الإخطار بجاهزية المهمات أو تاريخ الاختبار أيهما لاحق."
  }
];
export const LV_TERMS_TITLE_AR = "الشروط والأحكام العامة";
