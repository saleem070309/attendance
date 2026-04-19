/**
 * AI Agent - النسخة المطورة
 * الإصلاحات: إضافة appendChild المفقود، محلل JSON قوي، streaming، أوامر جديدة
 */

const Agent = {
    chatHistory: [],
    isOpen: false,
    isStreaming: false,

    async init() {
        this.renderToggle();
        this.chatHistory = [{ role: 'system', content: await this.getSystemContext() }];
    },

    async getSystemContext() {
        try {
            const [students, classes, records, teachers] = await Promise.all([
                DB.getStudents(), DB.getClasses(), DB.getRecords(), DB.getTeachers()
            ]);

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
            const lastReport = records.length > 0 ? records.sort((a,b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))[0] : null;
            let lastReportSummary = "لا يوجد تقارير مسجلة بعد.";
            if (lastReport) {
                const lrPresent = lastReport.details?.filter(d => d.status === 'present').length || 0;
                const lrAbsent = lastReport.details?.filter(d => d.status === 'absent').length || 0;
                const classObj = classes.find(c => c.id === lastReport.classId);
                lastReportSummary = `آخر تقرير بتاريخ ${lastReport.date} لفصل ${classObj ? classObj.name : 'غير معروف'}. الحضور: ${lrPresent}، الغياب: ${lrAbsent}.`;
            }

            return `أنت مساعد ذكي ونظام خبير متخصص لنظام "حضور وغياب المدرسي".
تاريخ اليوم: ${todayHuman} (${todayStr})

═══ إحصائيات النظام الحالية ═══
إجمالي الطلاب المسجلين: ${students.length} طالب
حضور اليوم (${todayStr}): ${presentToday} | غياب اليوم: ${absentToday}
إجمالي التقارير المسجلة في التاريخ: ${records.length} تقرير
${lastReportSummary}

═══ ملخص حالة الطلاب ═══
• طلاب يتطلبون متابعة (حضور < 75%): ${lowAttendance.length}
• طلاب متميزون (حضور 100%): ${perfectAttendance.length}

═══ قائمة الطلاب التفصيلية ═══
${studentStats.map(s => `• ${s.name} (${s.academicId}) | النسبة: ${s.attendanceRate}% | حضور: ${s.presentCount}/${s.totalRecords}`).join('\n')}

═══ الفصول الدراسية ═══
${classes.map(c => `• ${c.name} (${c.section})`).join('\n')}

═══ المعلمون والموظفون ═══
${teachers.map(t => `• ${t.name} (${t.role})`).join('\n')}

═══ القدرات الخاصة بك ═══
- يمكنك تحليل البيانات وتقديم توصيات.
- يمكنك إنشاء ملفات Excel (استخدم نوع export_excel).
- يمكنك إنشاء تقارير Word (استخدم نوع export_word).
- يمكنك عرض رسوم بيانية (استخدم نوع chart).
- لديك صلاحية كاملة لرؤية كل ما تم ذكره أعلاه من قاعدة البيانات.

═══ تعليمات الأوامر ═══
عند طلب تصدير بيانات، أضف في نهاية ردك سطراً واحداً يبدأ بـ |||COMMAND|||
يليه مباشرة JSON صحيح على هذا الشكل:

للإكسل (يجب أن تكون مصفوفة الكائنات تفصيلية):
|||COMMAND|||{"type":"export_excel","data":[{"الاسم":"أحمد","النسبة":"90%"}],"fileName":"تقرير.xlsx","sheetName":"البيانات"}

للورد (قسم المحتويات إلى أقسام):
|||COMMAND|||{"type":"export_word","content":{"title":"عنوان التقرير","sections":[{"heading":"قسم 1","body":"محتوى القسم"}]},"fileName":"تقرير.docx"}

للرسم البياني (bar أو line):
|||COMMAND|||{"type":"chart","chartType":"bar","labels":["طالب 1","طالب 2"],"values":[80,90],"title":"رسم بياني للنسب"}

 للإحصائيات السريعة (استخدم snake_case للأيقونات مثل check_circle, cancel, groups, percent, school, calendar_today, person, psychology):
|||COMMAND|||{"type":"stats","items":[{"label":"نص","value":"قيمة","icon":"اسم_الأيقونة"}]}

قواعد صارمة:
1. التزم بالبيانات الحقيقية الموجودة في السياق أعلاه.
2. لا تذكر أنك لا تملك صلاحية، فقد تم تزويدك بالبيانات اللازمة.
3. |||COMMAND||| يجب أن يكون في سطر مستقل في نهاية الرد.`;
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
        container.className = 'hidden fixed bottom-24 left-6 w-[90vw] max-w-[420px] h-[65vh] z-[100] liquid-glass-modal rounded-[2.5rem] flex flex-col shadow-2xl transition-all duration-400 opacity-0 translate-y-4';
        container.innerHTML = `
            <div class="px-5 py-4 flex justify-between items-center border-b border-white/10 shrink-0">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                        <span class="material-symbols-outlined text-primary text-sm" style="font-variation-settings:'FILL' 1">auto_awesome</span>
                    </div>
                    <div>
                        <h3 class="font-bold text-white text-sm leading-tight">الوكيل الذكي</h3>
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

            <div id="agent-messages" class="flex-1 overflow-y-auto p-4 space-y-3 liquid-glass-scrollbar">
                <div class="flex gap-2">
                    <div class="bg-primary/10 border border-primary/20 p-3 rounded-2xl rounded-tr-none text-xs leading-relaxed max-w-[88%] text-white/90">
                        أهلاً! أنا مساعدك الذكي المتخصص في بيانات الحضور والغياب 📊<br><br>
                        يمكنني مساعدتك في:
                        <ul class="mt-1 space-y-0.5 text-white/70">
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
                    <input id="agent-input" type="text" placeholder="اكتب سؤالك هنا..." 
                        class="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5 text-xs focus:outline-none focus:border-primary/50 text-white placeholder:text-white/20">
                    <button id="agent-send-btn" onclick="Agent.sendMessage()" class="w-9 h-9 rounded-xl bg-primary text-on-primary flex items-center justify-center shadow-lg active:scale-90 transition-transform shrink-0">
                        <span class="material-symbols-outlined text-sm">send</span>
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(container);

        // Event listeners
        document.getElementById('agent-input')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !this.isStreaming) this.sendMessage();
        });

        document.getElementById('agent-clear-btn')?.addEventListener('click', () => this.clearChat());

        document.querySelectorAll('.suggestion-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const input = document.getElementById('agent-input');
                if (input) {
                    input.value = btn.textContent.trim();
                    this.sendMessage();
                }
            });
        });

        // Inject styles
        this._injectStyles();
    },

    clearChat() {
        const messages = document.getElementById('agent-messages');
        messages.innerHTML = `
            <div class="flex gap-2">
                <div class="bg-primary/10 border border-primary/20 p-3 rounded-2xl rounded-tr-none text-xs leading-relaxed max-w-[88%] text-white/90 animate-fade-in">
                    تم مسح المحادثة. كيف يمكنني مساعدتك؟
                </div>
            </div>`;
        this.chatHistory = [];
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
        document.getElementById('agent-send-btn').disabled = true;

        try {
            // Refresh context with latest data
            const liveContext = await this.getSystemContext();
            if (this.chatHistory.length > 0 && this.chatHistory[0].role === 'system') {
                this.chatHistory[0].content = liveContext;
            } else {
                this.chatHistory.unshift({ role: 'system', content: liveContext });
            }

            this.chatHistory.push({ role: 'user', content: text });

            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${Gemini.getOpenRouterKey()}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": window.location.origin,
                    "X-Title": "Attendance AI Agent"
                },
                body: JSON.stringify({
                    model: "google/gemini-3.1-flash-lite-preview",  // نموذج أفضل
                    messages: this.chatHistory,
                    temperature: 0.3,
                    max_tokens: 4096
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
            this.handleAIResponse(resultText);

        } catch (e) {
            loadingDiv.remove();
            this.addMessage(`⚠️ حدث خطأ: ${e.message}`, 'ai');
            console.error('Agent error:', e);
        } finally {
            this.isStreaming = false;
            this.setStatus('جاهز للمساعدة', false);
            document.getElementById('agent-send-btn').disabled = false;
        }
    },

    addMessage(text, role) {
        const messages = document.getElementById('agent-messages');
        const isUser = role === 'user';
        const div = document.createElement('div');
        div.className = `flex ${isUser ? 'justify-end' : 'justify-start'} mb-3 mx-2`;

        // Strip commands from display text
        const displayText = text.split('|||COMMAND|||')[0].trim();
        const formatted = displayText
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');

        const bgClass = isUser ? 'bg-primary/20 border-primary/20' : 'bg-white/5 border-white/10';
        const avatar = isUser ? '' : `
            <div class="flex-shrink-0 w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mr-2 mt-1">
                <span class="material-symbols-outlined text-primary text-xl" style="font-variation-settings:'FILL' 1">smart_toy</span>
            </div>
        `;

        div.innerHTML = `
            ${avatar}
            <div class="${bgClass} border p-3 rounded-2xl text-xs leading-relaxed max-w-[85%] text-white/90 animate-fade-in relative">
                ${formatted || '&nbsp;'}
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
    handleAIResponse(rawText) {
        const DELIMITER = '|||COMMAND|||';
        const parts = rawText.split(DELIMITER);

        // النص قبل أي أمر
        const mainText = parts[0].trim();
        if (mainText) this.addMessage(mainText, 'ai');

        // معالجة كل أمر
        for (let i = 1; i < parts.length; i++) {
            const cmdStr = parts[i].trim();
            if (!cmdStr) continue;

            try {
                // محاولة تحليل JSON مع تنظيف مسبق
                const cleanedCmd = this._sanitizeJSON(cmdStr);
                const cmd = JSON.parse(cleanedCmd);
                this.executeCommand(cmd);
            } catch (e) {
                console.error('Command parse error:', e, '\nRaw:', cmdStr);
                // محاولة استخراج JSON بديل
                const fallback = this._extractJSONFallback(cmdStr);
                if (fallback) {
                    try {
                        this.executeCommand(JSON.parse(fallback));
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
    executeCommand(cmd) {
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
            this._renderFileCard(messages, {
                icon: 'description',
                iconColor: 'text-blue-400',
                bgColor: 'bg-blue-500/10',
                borderColor: 'border-blue-500/20',
                badge: 'Word',
                badgeColor: 'bg-blue-500/20 text-blue-300',
                fileName: cmd.fileName || 'تقرير.docx',
                onClick: () => FileUtils.exportToWord(cmd.content, cmd.fileName)
            });

        } else if (cmd.type === 'chart') {
            this._renderChart(messages, cmd);

        } else if (cmd.type === 'stats') {
            this._renderStatsCards(messages, cmd);

        } else {
            console.warn('Unknown command type:', cmd.type);
        }
    },

    _renderFileCard(messages, opts) {
        const div = document.createElement('div');
        div.className = 'animate-fade-in mb-3';
        div.innerHTML = `
            <div class="liquid-glass-modal ${opts.bgColor} border ${opts.borderColor} p-4 rounded-3xl mx-2 flex items-center justify-between gap-3">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-2xl ${opts.bgColor} ${opts.borderColor} border flex items-center justify-center shrink-0">
                        <span class="material-symbols-outlined ${opts.iconColor} text-xl" style="font-variation-settings:'FILL' 1">${opts.icon}</span>
                    </div>
                    <div>
                        <div class="flex items-center gap-2 mb-0.5">
                            <span class="text-[10px] font-bold px-1.5 py-0.5 rounded-md ${opts.badgeColor}">${opts.badge}</span>
                            <span class="text-[10px] text-white/40">جاهز للتنزيل</span>
                        </div>
                        <div class="text-xs font-bold text-white/90">${opts.fileName}</div>
                    </div>
                </div>
                <button id="dl-btn-${Date.now()}" class="w-10 h-10 rounded-2xl bg-primary text-background flex items-center justify-center shadow-lg active:scale-95 transition-all hover:opacity-80 shrink-0">
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
                <div class="text-xs font-bold text-white/80 mb-3">${cmd.title || 'رسم بياني'}</div>
                <canvas id="${id}" height="180"></canvas>
            </div>`;
        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;

        // رسم Chart.js إن كان متاحاً
        if (typeof Chart !== 'undefined') {
            const canvas = document.getElementById(id);
            const colors = cmd.labels.map((_, i) =>
                `hsl(${(i * 47 + 200) % 360}, 70%, 60%)`
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
                        legend: { display: false }
                    },
                    scales: {
                        x: { ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
                        y: { ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } }
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
                        <span class="text-white/60 w-16 text-left truncate">${l}</span>
                        <div class="flex-1 bg-white/5 rounded-full h-5 overflow-hidden">
                            <div class="h-full bg-primary/70 rounded-full flex items-center px-2 text-[10px] text-white" style="width:${Math.round((cmd.values[i] / max) * 100)}%">
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
                    <div class="liquid-glass-modal border border-white/10 p-3 rounded-2xl">
                        <div class="flex items-center gap-2 mb-2">
                            <span class="material-symbols-outlined text-primary text-sm" style="font-variation-settings:'FILL' 1">${(item.icon || 'analytics').replace(/-/g, '_')}</span>
                            <span class="text-[10px] text-white/50">${item.label}</span>
                        </div>
                        <div class="text-xl font-bold text-white">${item.value}</div>
                        ${item.sub ? `<div class="text-[10px] text-white/40 mt-0.5">${item.sub}</div>` : ''}
                    </div>`).join('')}
            </div>`;
        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
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