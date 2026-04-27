/**
 * AI Agent - النسخة المطورة
 * الإصلاحات: إضافة appendChild المفقود، محلل JSON قوي، streaming، أوامر جديدة
 */

const Agent = {
    provider: 'inworld', // <--- غير القيمة هنا لـ 'openrouter' أو 'inworld' للتبديل بينهما
    chatHistory: [],
    isOpen: false,
    isStreaming: false,

    async init() {
        if (typeof emailjs !== 'undefined') {
            emailjs.init("HNz0UjJRVZpAN8unm");
        }
        this.renderToggle();
        this.chatHistory = [{ role: 'system', content: await this.getSystemContext() }];
    },

    async getSystemContext() {
        try {
            const [students, classes, records, teachers] = await Promise.all([
                DB.getStudents(), DB.getClasses(), DB.getRecords(), DB.getTeachers()
            ]);

            const currentUser = typeof Auth !== 'undefined' ? Auth.getCurrentUser() : null;
            const currentUserId = currentUser ? currentUser.id : '1';

            // إحصائيات مسبقة للسياق - مع مراعاة المنطقة الزمنية المحلية
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const todayStr = `${year}-${month}-${day}`;
            const todayHuman = now.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

            const todayReports = records.filter(r => r.date === todayStr);
            let presentToday = 0;
            let absentToday = 0;

            todayReports.forEach(report => {
                if (report.details) {
                    report.details.forEach(d => {
                        if (d.status === 'present') presentToday++;
                        else if (d.status === 'absent') absentToday++;
                    });
                }
            });

            // حساب نسب الحضور لكل طالب عبر جميع التقارير
            const studentStats = students.map(s => {
                let pCount = 0;
                let tCount = 0;
                records.forEach(report => {
                    if (report.details) {
                        const studentEntry = report.details.find(d => d.studentId === s.id);
                        if (studentEntry) {
                            tCount++;
                            if (studentEntry.status === 'present') pCount++;
                        }
                    }
                });
                const rate = tCount > 0 ? Math.round((pCount / tCount) * 100) : 0;
                return { ...s, attendanceRate: rate, totalRecords: tCount, presentCount: pCount };
            });

            const lowAttendance = studentStats.filter(s => s.attendanceRate < 75 && s.totalRecords > 0);
            const perfectAttendance = studentStats.filter(s => s.attendanceRate === 100 && s.totalRecords > 0);

            // آخر تقرير وصل
            const lastReport = records.length > 0 ? records.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))[0] : null;
            let lastReportSummary = "لا يوجد تقارير مسجلة بعد.";
            if (lastReport) {
                const lrPresent = lastReport.details?.filter(d => d.status === 'present').length || 0;
                const lrAbsent = lastReport.details?.filter(d => d.status === 'absent').length || 0;
                const classObj = classes.find(c => c.id === lastReport.classId);
                lastReportSummary = `آخر تقرير بتاريخ ${lastReport.date} لفصل ${classObj ? classObj.name : 'غير معروف'}. الحضور: ${lrPresent}، الغياب: ${lrAbsent}.`;
            }

            // آخر 10 تقارير للسياق
            const recentReports = records
                .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
                .slice(0, 10);

            return `أنت مساعد ذكي ونظام خبير متخصص لنظام "حضور وغياب المدرسي".
المستخدم الحالي: ${currentUser ? currentUser.name : 'مدير النظام'} (ID: ${currentUserId})
تاريخ اليوم: ${todayHuman} (${todayStr})

═══ إحصائيات النظام الحالية ═══
إجمالي الطلاب المسجلين: ${students.length} طالب
حضور اليوم (${todayStr}): ${presentToday} | غياب اليوم: ${absentToday}
إجمالي التقارير المسجلة في التاريخ: ${records.length} تقرير
${lastReportSummary}

═══ السجلات والتقارير الأخيرة (IDs للتعامل معها) ═══
${recentReports.map(r => {
                const cls = classes.find(c => c.id === r.classId);
                return `• تقرير ID: ${r.id} | التاريخ: ${r.date} | الفصل: ${cls ? cls.name : r.classId} | الطلاب: ${r.details?.length || 0}`;
            }).join('\n')}

═══ ملخص حالة الطلاب ═══
• طلاب يتطلبون متابعة (حضور < 75%): ${lowAttendance.length}
• طلاب متميزون (حضور 100%): ${perfectAttendance.length}

═══ قائمة الطلاب التفصيلية ═══
${studentStats.map(s => `• ${s.name || 'مسمى مفقود'} | ID (الرقم الأكاديمي): ${s.academicId || 'بدون رقم'} | الفصل: ${s.classId || 'غير محدد'} | النسبة: ${s.attendanceRate}%`).join('\n')}

═══ الفصول الدراسية ═══
${classes.map(c => `• ${c.name || 'مسمى غير محدد'} (${c.section || '-'}) | ID: ${c.id}`).join('\n')}

═══ المعلمون والموظفون ═══
${teachers.map(t => `• ${t.name || 'بدون اسم'} (${t.role || 'موظف'}) | ID: ${t.id} | الرقم الوزاري: ${t.ministryId}`).join('\n')}

═══ القدرات الخاصة بك ═══
- يمكنك تحليل البيانات وتقديم توصيات.
- يمكنك إنشاء ملفات Excel (استخدم نوع export_excel).
- يمكنك إنشاء تقارير Word (استخدم نوع export_word).
- يمكنك عرض رسوم بيانية (استخدم نوع chart).
- **جديد**: يمكنك الكتابة في قاعدة البيانات (إضافة/تعديل/حذف) باستخدام نوع database_action.
- **جديد**: يمكنك معالجة الصور والملفات المرفوعة.
- **جديد**: يمكنك إرسال إيميلات لأي عنوان يطلبه المستخدم (استخدم نوع send_email).

═══ تعليمات الأوامر ═══
عند تنفيذ أي عملية، أضف في نهاية ردك سطراً واحداً يبدأ بـ |||COMMAND|||
يليه مباشرة JSON صحيح على هذا الشكل:

للعمليات على قاعدة البيانات (insert, update, delete):
بناءً على طلب المستخدم، تأكد دائماً من استخدام المعرف الصحيح من القوائم المزودة. للطلاب استخدم (الرقم الأكاديمي) كمعرف، وللمعلمين والفصول والتقارير استخدم قيمة (ID) المذكورة. 
**قاعدة هامة**: عند الحذف (delete) أو التعديل (update)، يجب إرسال حقل باسم "id" يحتوي على هذا المعرف. لديك الصلاحية الكاملة.

للطلاب والمعلمين والفصول:
|||COMMAND|||{"type":"database_action","action":"insert","table":"students","data":{"name":"اسم جديد","academicId":"123","classId":"ID_CLASS"}}
// يمكنك أيضاً إضافة عدة عناصر في مصفوفة واحدة:
|||COMMAND|||{"type":"database_action","action":"insert","table":"students","data":[{"name":"الأول","academicId":"1"}, {"name":"الثاني","academicId":"2"}]}
|||COMMAND|||{"type":"database_action","action":"update","table":"students","id":"ID_HERE","data":{"name":"اسم معدل","classId":"NEW_ID"}}
|||COMMAND|||{"type":"database_action","action":"delete","table":"students","ids":["ID1", "ID2", "ID3"]}

للتقارير والسجلات (records):
عند إنشاء تقرير جديد، استخدم table: "records" وزود date, classId, teacherId ومصفوفة details التي تحتوي على حالة كل طالب (present أو absent).
|||COMMAND|||{"type":"database_action","action":"insert","table":"records","data":{"date":"2024-04-22","classId":"c1","teacherId":"${currentUserId}","details":[{"studentId":"2024001","status":"present"},{"studentId":"2024042","status":"absent"}]}}
|||COMMAND|||{"type":"database_action","action":"update","table":"records","id":"REPORT_ID_FROM_LIST","data":{"details":[{"studentId":"2024001","status":"absent"}]}}
|||COMMAND|||{"type":"database_action","action":"delete","table":"records","id":"REPORT_ID_FROM_LIST"}

للإكسل:
|||COMMAND|||{"type":"export_excel","data":[{"الاسم":"أحمد"}],"fileName":"تقرير.xlsx"}

للوورد (Word):
|||COMMAND|||{"type":"export_word","content":{"title":"عنوان التقرير","sections":[{"heading":"مقدمة","text":"نص القسم هنا"}]},"fileName":"تقرير.docx"}

للرسومات البيانية:
|||COMMAND|||{"type":"chart","chartType":"bar","labels":["أ","ب"],"values":[80,90],"title":"العنوان"}

للإيميلات (إرسال لأي عنوان يطلبه المستخدم):
|||COMMAND|||{"type":"send_email","to":"recipient@email.com","subject":"موضوع الإيميل","message":"محتوى الرسالة التفصيلي"}

قواعد صارمة:
1. التزم بالبيانات الحقيقية.
2. يمكنك إرسال أكثر من أمر في رد واحد إذا لزم الأمر، كل واحد يبدأ بـ |||COMMAND|||.
3. لا تذكر أنك لا تملك صلاحية، فقد تم تزويدك بالبيانات اللازمة.
4. |||COMMAND||| يجب أن يكون في سطر مستقل في نهاية الرد.`;
        } catch (e) {
            console.error('Context error:', e);
            return 'أنت مساعد ذكي لنظام الحضور والغياب. حدث خطأ أثناء جلب البيانات من قاعدة البيانات.';
        }
    },

    toggleChat() {
        this.isOpen = !this.isOpen;
        const container = document.getElementById('agent-container');
        if (this.isOpen) {
            container.classList.remove('hidden');
            setTimeout(() => container.classList.add('active'), 10);
            document.getElementById('agent-input')?.focus();
        } else {
            container.classList.remove('active');
            setTimeout(() => container.classList.add('hidden'), 400);
        }
    },

    renderToggle() {
        const isEmbedded = !!document.getElementById('tab-ai');

        if (!isEmbedded) {
            // FAB Button
            const fab = document.createElement('div');
            fab.id = 'agent-fab';
            fab.className = 'liquid-glass liquid-glass-interactive fixed bottom-6 left-6 w-14 h-14 rounded-2xl z-[100] flex items-center justify-center shadow-2xl transition-all';
            fab.innerHTML = `<span class="material-symbols-outlined text-primary text-3xl" style="font-variation-settings: 'FILL' 1;">smart_toy</span>`;
            fab.onclick = () => this.toggleChat();
            document.body.appendChild(fab);

            // Chat Container
            const container = document.createElement('div');
            container.id = 'agent-container';
            container.className = 'hidden fixed bottom-24 left-4 right-4 h-[75vh] z-[100] bg-white/10 backdrop-blur-2xl rounded-[2.5rem] border border-white/20 flex flex-col shadow-2xl transition-all duration-400 opacity-0 translate-y-4';
            container.innerHTML = `
                <div class="px-5 py-4 flex justify-between items-center border-b border-white/10 shrink-0">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                            <span class="material-symbols-outlined text-primary text-sm" style="font-variation-settings:'FILL' 1">auto_awesome</span>
                        </div>
                        <div>
                            <h3 class="font-bold text-white text-sm leading-tight">AutoPilot</h3>
                            <div id="agent-status" class="text-xs text-white/40">جاهز للمساعدة</div>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <button id="agent-clear-btn" title="مسح المحادثة" class="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all">
                            <span class="material-symbols-outlined text-sm">delete_sweep</span>
                        </button>
                        <button onclick="Agent.toggleChat()" class="text-white/40 hover:text-white transition-colors">
                            <span class="material-symbols-outlined">close</span>
                        </button>
                    </div>
                </div>

                <div id="agent-messages" class="flex-1 overflow-y-auto p-4 space-y-4 liquid-glass-scrollbar hide-scrollbar">
                    <div class="flex flex-col items-start animate-fade-in mx-1">
                        <span class="text-[9px] font-black text-primary mb-1 px-1 uppercase tracking-tight">AutoPilot</span>
                        <div class="bg-white border border-gray-100 text-gray-800 p-4 rounded-2xl rounded-tr-sm text-xs leading-relaxed max-w-[92%] relative shadow-sm">
                            أهلاً! أنا AutoPilot، مساعدك الذكي المتخصص في بيانات الحضور والغياب 📊<br><br>
                            يمكنني مساعدتك في:
                            <ul class="mt-1 space-y-0.5 text-gray-600">
                                <li>• تحليل نسب الحضور والغياب</li>
                                <li>• إنشاء تقارير إكسل وورد</li>
                                <li>• رسوم بيانية ولوحات إحصائية</li>
                                <li>• تتبع الطلاب الأكثر غياباً</li>
                            </ul>
                        </div>
                    </div>
                </div>

                <div id="agent-suggestions" class="px-4 pb-2 flex gap-2 overflow-x-auto shrink-0 hide-scrollbar">
                    <button class="suggestion-btn shrink-0 text-xs bg-white/5 border border-white/10 text-white/60 px-3 py-1.5 rounded-xl hover:bg-white/10 hover:text-white transition-all whitespace-nowrap">
                        طلاب بغياب كثير
                    </button>
                    <button class="suggestion-btn shrink-0 text-xs bg-white/5 border border-white/10 text-white/60 px-3 py-1.5 rounded-xl hover:bg-white/10 hover:text-white transition-all whitespace-nowrap">
                        تقرير إكسل شامل
                    </button>
                    <button class="suggestion-btn shrink-0 text-xs bg-white/5 border border-white/10 text-white/60 px-3 py-1.5 rounded-xl hover:bg-white/10 hover:text-white transition-all whitespace-nowrap">
                        إحصائيات اليوم
                    </button>
                    <button class="suggestion-btn shrink-0 text-xs bg-white/5 border border-white/10 text-white/60 px-3 py-1.5 rounded-xl hover:bg-white/10 hover:text-white transition-all whitespace-nowrap">
                        رسم بياني للحضور
                    </button>
                </div>

                <div class="p-3 border-t border-white/10 bg-black/20 shrink-0 rounded-b-[2.5rem]">
                    <div class="relative flex items-center gap-2">
                        <textarea id="agent-input" placeholder="اكتب سؤالك هنا..." 
                            class="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-xs focus:outline-none focus:border-primary/50 text-white placeholder:text-white/20 resize-none overflow-y-auto max-h-32 hide-scrollbar"
                            rows="1"></textarea>
                        <button id="agent-send-btn" onclick="Agent.sendMessage()" class="w-10 h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center shadow-lg active:scale-90 transition-transform shrink-0">
                            <span class="material-symbols-outlined text-sm">send</span>
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(container);
        }

        this._injectStyles();
        this._setupListeners();
    },

    _setupListeners() {
        const input = document.getElementById('agent-input');
        const suggestions = document.getElementById('agent-suggestions');

        if (input) {
            input.addEventListener('input', function () {
                this.style.height = 'auto';
                this.style.height = Math.min(this.scrollHeight, 128) + 'px';

                if (suggestions) {
                    if (this.value.trim().length > 0) {
                        suggestions.style.display = 'none';
                    } else {
                        suggestions.style.display = 'flex';
                    }
                }
            });

            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (!this.isStreaming) this.sendMessage();
                }
            });
        }

        document.getElementById('agent-clear-btn')?.addEventListener('click', () => this.clearChat());

        document.querySelectorAll('.suggestion-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (input) {
                    input.value = btn.textContent.trim();
                    input.style.height = 'auto';
                    this.sendMessage();
                }
            });
        });
    },

    clearChat() {
        const messages = document.getElementById('agent-messages');
        messages.innerHTML = `
            <div class="flex flex-col items-start animate-fade-in mx-1">
                <span class="text-[9px] font-black text-white/40 mb-1 px-1 uppercase tracking-tight">AutoPilot</span>
                <div class="bg-primary/10 border border-primary/20 p-3.5 rounded-2xl rounded-tr-sm text-xs leading-relaxed max-w-[92%] text-white/90">
                    تم مسح المحادثة. كيف يمكنني مساعدتك؟
                </div>
            </div>`;
        this.chatHistory = [];

        const suggestions = document.getElementById('agent-suggestions');
        if (suggestions) suggestions.style.display = 'flex';

        this.getSystemContext().then(ctx => {
            this.chatHistory = [{ role: 'system', content: ctx }];
        });
    },

    setStatus(text, active = false) {
        const status = document.getElementById('agent-status');
        if (status) {
            status.textContent = text;
            status.className = active ? 'text-xs text-primary animate-pulse' : 'text-xs text-white/40';
        }
    },

    async sendMessage() {
        if (this.isStreaming) return;
        const input = document.getElementById('agent-input');
        const text = input.value.trim();
        if (!text) return;

        input.value = '';
        this.addMessage(text, 'user');

        // Hide suggestions after first message
        const suggestionsEl = document.getElementById('agent-suggestions');
        if (suggestionsEl) suggestionsEl.style.display = 'none';

        // Loading indicator
        const loadingDiv = this.addLoadingIndicator();
        this.isStreaming = true;
        this.setStatus('يفكر...', true);
        const sendBtn = document.getElementById('agent-send-btn');
        if (sendBtn) sendBtn.disabled = true;

        try {
            // Refresh context with latest data
            const liveContext = await this.getSystemContext();
            if (this.chatHistory.length > 0 && this.chatHistory[0].role === 'system') {
                this.chatHistory[0].content = liveContext;
            } else {
                this.chatHistory.unshift({ role: 'system', content: liveContext });
            }

            this.chatHistory.push({ role: 'user', content: text });

            // إعدادات المزود (Provider Settings)
            const providers = {
                inworld: {
                    url: "https://api.inworld.ai/v1/chat/completions",
                    key: Gemini.getInworldKey(),
                    headers: {},
                    body: { model: "auto" }
                },
                openrouter: {
                    url: "https://openrouter.ai/api/v1/chat/completions",
                    key: Gemini.getOpenRouterKey(),
                    headers: {
                        "HTTP-Referer": window.location.origin,
                        "X-Title": "Attendance AI Agent"
                    },
                    body: {
                        model: "deepseek/deepseek-v4-flash",
                        provider: { order: ["Google", "DeepInfra"], allow_fallbacks: true }
                    }
                }
            };

            const current = providers[this.provider];

            const response = await fetch(current.url, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${current.key}`,
                    "Content-Type": "application/json",
                    ...current.headers
                },
                body: JSON.stringify({
                    messages: this.chatHistory,
                    temperature: 0.1,
                    max_tokens: 4096,
                    ...current.body
                })
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error?.message || `HTTP ${response.status}`);
            }

            const data = await response.json();
            const resultText = data.choices?.[0]?.message?.content;
            if (!resultText) throw new Error('لم يأتِ رد من النموذج');

            this.chatHistory.push({ role: 'assistant', content: resultText });
            loadingDiv.remove();
            await this.handleAIResponse(resultText);

        } catch (e) {
            loadingDiv.remove();
            this.addMessage(`⚠️ حدث خطأ: ${e.message}`, 'ai');
            console.error('Agent error:', e);
        } finally {
            this.isStreaming = false;
            this.setStatus('جاهز للمساعدة', false);
            const sendBtn = document.getElementById('agent-send-btn');
            if (sendBtn) sendBtn.disabled = false;
        }
    },

    addMessage(text, role) {
        const messages = document.getElementById('agent-messages');
        const isUser = role === 'user';
        const div = document.createElement('div');
        div.className = `flex flex-col ${isUser ? 'items-end' : 'items-start'} mb-4 mx-2 animate-fade-in`;

        const currentUser = typeof Auth !== 'undefined' ? Auth.getCurrentUser() : null;
        const labelText = isUser ? (currentUser ? currentUser.name : 'مدير النظام') : 'AutoPilot';

        // Strip commands from display text
        const displayText = text.split('|||COMMAND|||')[0].trim();

        let formattedContent;
        if (!isUser && typeof marked !== 'undefined') {
            // Configure marked for safe rendering
            marked.setOptions({
                breaks: true,      // newlines become <br>
                gfm: true,         // GitHub Flavored Markdown (tables, strikethrough, etc.)
                pedantic: false,
                sanitize: false
            });
            formattedContent = marked.parse(displayText || '&nbsp;');
        } else {
            // User messages: plain text only
            formattedContent = displayText
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/\n/g, '<br>') || '&nbsp;';
        }

        const bubbleClass = isUser
            ? 'bg-gradient-primary text-white shadow-md'
            : 'bg-white border border-gray-100 text-gray-800 shadow-sm agent-markdown';

        div.innerHTML = `
            <span class="text-[9px] font-black ${isUser ? 'text-gray-400' : 'text-primary'} mb-1 px-1 uppercase tracking-tight">${labelText}</span>
            <div class="${bubbleClass} p-3.5 rounded-2xl ${isUser ? 'rounded-tl-sm' : 'rounded-tr-sm'} text-xs font-bold leading-relaxed max-w-[92%] relative">
                ${formattedContent}
            </div>`;

        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
        return div;
    },

    addLoadingIndicator() {
        const messages = document.getElementById('agent-messages');
        const div = document.createElement('div');
        div.className = 'flex gap-2';
        div.innerHTML = `
            <div class="bg-white/5 border border-white/10 p-3 rounded-2xl rounded-tr-none animate-fade-in">
                <div class="flex gap-1 items-center h-4">
                    <span class="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce" style="animation-delay:0ms"></span>
                    <span class="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce" style="animation-delay:150ms"></span>
                    <span class="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce" style="animation-delay:300ms"></span>
                </div>
            </div>`;
        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
        return div;
    },

    // ═══════════════════════════════════════════════════
    // محلل الأوامر - الإصلاح الرئيسي + منطق قوي
    // ═══════════════════════════════════════════════════
    async handleAIResponse(rawText) {
        const DELIMITER = '|||COMMAND|||';
        const parts = rawText.split(DELIMITER);

        // النص قبل أي أمر
        const mainText = parts[0].trim();
        if (mainText) this.addMessage(mainText, 'ai');

        // معالجة كل أمر بالتتابع
        for (let i = 1; i < parts.length; i++) {
            const cmdStr = parts[i].trim();
            if (!cmdStr) continue;

            try {
                // محاولة تحليل JSON مع تنظيف مسبق
                const cleanedCmd = this._sanitizeJSON(cmdStr);
                const cmd = JSON.parse(cleanedCmd);
                await this.executeCommand(cmd); // انتظار انتهاء العملية الحالية
            } catch (e) {
                console.error('Command parse error:', e, '\nRaw:', cmdStr);
                // محاولة استخراج JSON بديل
                const fallback = this._extractJSONFallback(cmdStr);
                if (fallback) {
                    try {
                        await this.executeCommand(JSON.parse(fallback));
                    } catch (e2) {
                        this._showCommandError(cmdStr);
                    }
                } else {
                    this._showCommandError(cmdStr);
                }
            }
        }
    },

    _sanitizeJSON(str) {
        // أخذ أول { حتى آخر } متوازن
        const start = str.indexOf('{');
        if (start === -1) throw new Error('No JSON found');

        let depth = 0, end = -1;
        for (let i = start; i < str.length; i++) {
            if (str[i] === '{') depth++;
            else if (str[i] === '}') {
                depth--;
                if (depth === 0) { end = i; break; }
            }
        }
        if (end === -1) throw new Error('Unbalanced JSON');
        return str.slice(start, end + 1);
    },

    _extractJSONFallback(str) {
        // fallback: ابحث عن أي بنية JSON صالحة
        const match = str.match(/\{[\s\S]*\}/);
        return match ? match[0] : null;
    },

    _showCommandError(cmdStr) {
        const messages = document.getElementById('agent-messages');
        const div = document.createElement('div');
        div.className = 'flex gap-2 mb-3 animate-fade-in';
        div.innerHTML = `
            <div class="bg-red-500/10 border border-red-500/20 p-3 rounded-2xl rounded-tr-none text-xs text-red-300 max-w-[88%]">
                ⚠️ لم يتم تحليل الأمر بنجاح. <button onclick="navigator.clipboard.writeText(${JSON.stringify(cmdStr)})" class="underline opacity-60">نسخ الكود الخام</button>
            </div>`;
        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
    },

    // ═══════════════════════════════════════════════════
    // تنفيذ الأوامر - الإصلاح الرئيسي: messages.appendChild مضاف!
    // ═══════════════════════════════════════════════════
    async executeCommand(cmd) {
        const messages = document.getElementById('agent-messages');

        if (cmd.type === 'export_excel') {
            this._renderFileCard(messages, {
                icon: 'table_view',
                iconColor: 'text-green-400',
                bgColor: 'bg-green-500/10',
                borderColor: 'border-green-500/20',
                badge: 'Excel',
                badgeColor: 'bg-green-500/20 text-green-300',
                fileName: cmd.fileName || 'تصدير.xlsx',
                onClick: () => FileUtils.exportToExcel(cmd.data, cmd.fileName, cmd.sheetName)
            });

        } else if (cmd.type === 'export_word') {
            const wordContent = cmd.content || cmd.data || { title: 'تقرير مساعد الذكاء الاصطناعي', sections: [{ heading: 'محتوى التقرير', text: 'لا يوجد محتوى محدد' }] };
            this._renderFileCard(messages, {
                icon: 'description',
                iconColor: 'text-blue-400',
                bgColor: 'bg-blue-500/10',
                borderColor: 'border-blue-500/20',
                badge: 'Word',
                badgeColor: 'bg-blue-500/20 text-blue-300',
                fileName: cmd.fileName || 'تقرير.docx',
                onClick: () => FileUtils.exportToWord(wordContent, cmd.fileName)
            });

        } else if (cmd.type === 'database_action') {
            await this._handleDatabaseAction(messages, cmd);

        } else if (cmd.type === 'chart') {
            this._renderChart(messages, cmd);

        } else if (cmd.type === 'send_email') {
            await this._handleSendEmail(messages, cmd);

        } else if (cmd.type === 'stats') {
            this._renderStatsCards(messages, cmd);

        } else {
            console.warn('Unknown command type:', cmd.type);
        }
    },

    async _handleSendEmail(messages, cmd) {
        const div = document.createElement('div');
        div.className = 'animate-fade-in mb-3 mx-2';
        div.innerHTML = `
            <div class="bg-blue-600 text-white p-3 rounded-2xl text-[10px] font-bold flex items-center justify-between">
                <div class="flex items-center gap-2 flex-1 min-w-0">
                    <span class="material-symbols-outlined text-sm">mail</span>
                    <span class="truncate">إرسال إلى: ${cmd.to}</span>
                </div>
                <div id="email-status-${Date.now()}" class="text-blue-200 shrink-0 mr-2">جاري...</div>
            </div>`;
        messages.appendChild(div);
        const status = div.querySelector('div:last-child');

        try {
            await this.sendEmail(cmd.to, cmd.subject, cmd.message);
            status.textContent = 'تم الإرسال بنجاح ✓';
            status.className = 'text-green-300';

        } catch (e) {
            status.textContent = 'فشل الإرسال ✗';
            status.className = 'text-red-300';
            console.error('Email Error:', e);
            this.addMessage(`❌ فشل إرسال الإيميل: ${e.message || 'حدث خطأ غير معروف'}`, 'ai');
        }
    },

    async sendEmail(to, subject, message) {
        if (typeof emailjs === 'undefined') {
            throw new Error('EmailJS library is not loaded');
        }

        const templateParams = {
            to_email: to,
            subject: subject,
            message: message
        };

        return await emailjs.send("service_qtnp6zk", "template_a11cl9r", templateParams, "HNz0UjJRVZpAN8unm");
    },

    async _handleDatabaseAction(messages, cmd) {
        const div = document.createElement('div');
        div.className = 'animate-fade-in mb-3 mx-2';
        div.innerHTML = `
            <div class="bg-gray-800 text-white p-3 rounded-2xl text-[10px] font-bold flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-sm text-primary">database</span>
                    <span>تنفيذ عملية: ${cmd.action} على ${cmd.table}</span>
                </div>
                <div id="db-status-${Date.now()}" class="text-primary">جاري...</div>
            </div>`;
        messages.appendChild(div);

        const status = div.querySelector('div:last-child');

        // التحقق من المعرفات الوهمية (Placeholders)
        const placeholderIds = ['ID_HERE', 'STUDENT_ID', 'TEACHER_ID', 'CLASS_ID', 'ID_CLASS', 'NEW_ID'];
        if (cmd.id && placeholderIds.includes(cmd.id)) {
            status.textContent = 'خطأ: معرف غير صالح';
            status.className = 'text-red-400';
            this.addMessage(`⚠️ تنبيه: حاول الوكيل استخدام معرف غير حقيقي (${cmd.id}). يرجى تزويده بالمعرف الصحيح من القوائم.`, 'ai');
            return;
        }

        try {
            let result;

            if (cmd.action === 'insert') {
                const dataItems = Array.isArray(cmd.data) ? cmd.data : [cmd.data];
                status.textContent = `جاري إضافة ${dataItems.length} عنصر...`;

                for (const item of dataItems) {
                    await DB.insert(cmd.table, item);
                }
                status.textContent = 'تمت الإضافة بنجاح ✓';
            } else {
                // الحذف والتعديل يتطلب معرفات
                const ids = cmd.ids || [cmd.id || cmd.ID || cmd.studentId || cmd.teacherId || cmd.classId || cmd.academicId];
                const validIds = ids.filter(id => id && !placeholderIds.includes(id));

                if (validIds.length === 0) {
                    throw new Error('لم يتم تزويد أي معرفات (IDs) صالحة للعملية. يرجى تزويد حقل "id"');
                }

                status.textContent = `جاري تنفيذ ${validIds.length} عملية...`;
                for (const finalId of validIds) {
                    if (cmd.action === 'update') {
                        await DB.update(cmd.table, finalId, cmd.data);
                    } else if (cmd.action === 'delete') {
                        await DB.delete(cmd.table, finalId);
                    }
                }
                status.textContent = 'تم تنفيذ المجموعة بنجاح ✓';
            }

            status.className = 'text-green-400';



            if (typeof window.renderAll === 'function') {
                await window.renderAll();
            }
        } catch (e) {
            status.textContent = 'فشل ✗';
            status.className = 'text-red-400';
            console.error('DB Action error:', e);
            this.addMessage(`❌ خطأ: ${e.message}.`, 'ai');
        }
    },

    _renderFileCard(messages, opts) {
        const div = document.createElement('div');
        div.className = 'animate-fade-in mb-3';
        div.innerHTML = `
            <div class="bg-white border border-black/5 p-4 rounded-3xl mx-2 flex items-center justify-between gap-3 shadow-sm">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-2xl bg-gray-50 border border-black/5 flex items-center justify-center shrink-0">
                        <span class="material-symbols-outlined ${opts.iconColor.replace('text-green-400', 'text-green-600').replace('text-blue-400', 'text-blue-600')} text-xl" style="font-variation-settings:'FILL' 1">${opts.icon}</span>
                    </div>
                    <div>
                        <div class="flex items-center gap-2 mb-0.5">
                            <span class="text-[9px] font-black px-1.5 py-0.5 rounded-md ${opts.badgeColor.replace('text-green-300', 'text-green-700').replace('text-blue-300', 'text-blue-700')}">${opts.badge}</span>
                            <span class="text-[10px] text-gray-400 font-bold">جاهز للتنزيل</span>
                        </div>
                        <div class="text-[11px] font-black text-gray-800">${opts.fileName}</div>
                    </div>
                </div>
                <button id="dl-btn-${Date.now()}" class="w-10 h-10 rounded-2xl bg-primary text-white flex items-center justify-center shadow-lg active:scale-95 transition-all hover:opacity-80 shrink-0">
                    <span class="material-symbols-outlined text-sm">download</span>
                </button>
            </div>`;

        // ✅ الإصلاح الرئيسي: إضافة العنصر للـ DOM
        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;

        // ربط الحدث بعد الإضافة للـ DOM
        const btn = div.querySelector('button');
        btn.addEventListener('click', async () => {
            btn.innerHTML = `<span class="material-symbols-outlined text-sm animate-spin">progress_activity</span>`;
            btn.disabled = true;
            try {
                await opts.onClick();
                btn.innerHTML = `<span class="material-symbols-outlined text-sm">check</span>`;
                btn.className = btn.className.replace('bg-primary', 'bg-green-500');
            } catch (e) {
                btn.innerHTML = `<span class="material-symbols-outlined text-sm">error</span>`;
                btn.className = btn.className.replace('bg-primary', 'bg-red-500');
                console.error('Export error:', e);
            }
        });
    },

    _renderChart(messages, cmd) {
        const id = `chart-${Date.now()}`;
        const div = document.createElement('div');
        div.className = 'animate-fade-in mb-3 mx-2';
        div.innerHTML = `
            <div class="liquid-glass-modal border border-white/10 p-4 rounded-3xl">
                <div class="text-xs font-bold text-gray-800 mb-3">${cmd.title || 'رسم بياني'}</div>
                <canvas id="${id}" height="180"></canvas>
            </div>`;
        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;

        // رسم Chart.js إن كان متاحاً
        if (typeof Chart !== 'undefined') {
            const canvas = document.getElementById(id);

            // تعيين الألوان الافتراضية للخطوط لتكون داكنة
            Chart.defaults.color = 'rgba(0,0,0,0.7)';
            Chart.defaults.font.family = 'Tajawal, sans-serif';

            const colors = cmd.labels.map((_, i) =>
                `hsl(${(i * 47 + 200) % 360}, 70%, 55%)`
            );
            new Chart(canvas, {
                type: cmd.chartType || 'bar',
                data: {
                    labels: cmd.labels,
                    datasets: [{
                        label: cmd.title || 'القيمة',
                        data: cmd.values,
                        backgroundColor: colors,
                        borderRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: {
                            display: cmd.chartType === 'pie' || cmd.chartType === 'doughnut',
                            labels: { color: 'rgba(0,0,0,0.7)', font: { size: 10, weight: 'bold' } }
                        }
                    },
                    scales: (cmd.chartType === 'pie' || cmd.chartType === 'doughnut') ? {} : {
                        x: { ticks: { color: 'rgba(0,0,0,0.6)', font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
                        y: { ticks: { color: 'rgba(0,0,0,0.6)', font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.05)' } }
                    }
                }
            });
        } else {
            // fallback: عرض أشرطة CSS بسيطة
            const canvas = document.getElementById(id);
            const max = Math.max(...cmd.values);
            canvas.outerHTML = `<div class="space-y-2">
                ${cmd.labels.map((l, i) => `
                    <div class="flex items-center gap-2 text-xs">
                        <span class="text-gray-600 w-16 text-left truncate">${l}</span>
                        <div class="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                            <div class="h-full bg-primary/70 rounded-full flex items-center px-2 text-[10px] text-white font-bold" style="width:${Math.round((cmd.values[i] / max) * 100)}%">
                                ${cmd.values[i]}
                            </div>
                        </div>
                    </div>`).join('')}
            </div>`;
        }
    },

    _renderStatsCards(messages, cmd) {
        const div = document.createElement('div');
        div.className = 'animate-fade-in mb-3 mx-2';
        div.innerHTML = `
            <div class="grid grid-cols-2 gap-2">
                ${cmd.items.map(item => `
                    <div class="bg-white border border-black/5 p-3 rounded-2xl shadow-sm">
                        <div class="flex items-center gap-2 mb-2">
                            <span class="material-symbols-outlined text-primary text-sm" style="font-variation-settings:'FILL' 1">${(item.icon || 'analytics').replace(/-/g, '_')}</span>
                            <span class="text-[9px] text-gray-400 font-black uppercase tracking-wider">${item.label}</span>
                        </div>
                        <div class="text-lg font-black text-gray-800">${item.value}</div>
                        ${item.sub ? `<div class="text-[10px] text-gray-400 font-bold mt-0.5">${item.sub}</div>` : ''}
                    </div>`).join('')}
            </div>`;
        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
    },

    handleFileUpload(input) {
        const file = input.files[0];
        if (!file) return;

        this.addMessage(`تم رفع ملف: ${file.name}`, 'user');
        this.setStatus('جاري معالجة الملف...', true);

        // Placeholder for real processing
        setTimeout(() => {
            this.addMessage(`لقد استلمت الملف **${file.name}**. كيف تود أن أساعدك به؟ (مثلاً: استيراد البيانات، تحليل الأسماء، إلخ)`, 'ai');
            this.setStatus('جاهز للمساعدة', false);
        }, 1500);

        input.value = ''; // Reset input
    },

    _injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #agent-container.active { opacity: 1; transform: translateY(0); }
            @keyframes fade-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
            .animate-fade-in { animation: fade-in 0.3s ease-out forwards; }
            @keyframes spin { to { transform: rotate(360deg); } }
            .animate-spin { animation: spin 1s linear infinite; }
            .hide-scrollbar::-webkit-scrollbar { display: none; }
            .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            
            /* إصلاح الأيقونات لمنع تداخل الخطوط والاتجاهات */
            .material-symbols-outlined {
                font-family: 'Material Symbols Outlined' !important;
                font-weight: normal;
                font-style: normal;
                font-size: 24px;
                line-height: 1;
                letter-spacing: normal;
                text-transform: none;
                display: inline-block;
                white-space: nowrap;
                word-wrap: normal;
                direction: ltr !important;
                -webkit-font-feature-settings: 'liga';
                -webkit-font-smoothing: antialiased;
            }
        `;
        document.head.appendChild(style);
    }
};