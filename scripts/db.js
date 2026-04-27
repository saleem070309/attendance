/**
 * Data Management Layer for Attendance System
 * Uses Firebase Firestore.
 */

const DB = {
    KEYS: {
        STUDENTS: 'v2_students',
        TEACHERS: 'v2_teachers',
        CLASSES: 'v2_classes',
        RECORDS: 'v2_records',
        REPORTS: 'v2_records', // AI Alias
        HOLIDAYS: 'v2_holidays',
        NOTIFICATIONS: 'v2_notifications',
        CURRENT_USER: 'attendance_current_user' // Keep local for session
    },
    dbInstance: null,

    async loadFirebaseScripts() {
        if (window.firebase) return;
        const loadScript = (src) => new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        });
        await loadScript("https://www.gstatic.com/firebasejs/10.11.0/firebase-app-compat.js");
        await loadScript("https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore-compat.js");
    },

    async init() {
        if (this.dbInstance) return;
        await this.loadFirebaseScripts();
        
        const firebaseConfig = {
            apiKey: "AIzaSyAaQoVd3vvpg0i49HkUEuWk0erabK6DhCY",
            authDomain: "school-attendance-c0fdb.firebaseapp.com",
            projectId: "school-attendance-c0fdb",
            storageBucket: "school-attendance-c0fdb.firebasestorage.app",
            messagingSenderId: "338402675234",
            appId: "1:338402675234:web:a7f24874c4623db67d987b",
            measurementId: "G-0S67KPSC3N"
        };
        
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        this.dbInstance = firebase.firestore();
        
        // Enable Offline Persistence for instant startup
        try {
            await this.dbInstance.enablePersistence({ synchronizeTabs: true });
            console.log("Firebase Offline Persistence Enabled");
        } catch (err) {
            console.warn("Firebase Persistence failed:", err.code);
        }
        
        try {
            // Check if admin exists to seed data if empty
            const teachersSnap = await this.dbInstance.collection(this.KEYS.TEACHERS).limit(1).get();
            if (teachersSnap.empty) {
                await this.seedData();
            }
        } catch (error) {
            console.error("Firebase init/seed error:", error);
            // Sometimes first query fails based on rules, ensure firestore rules are set.
        }
    },

    async seedData() {
        const batch = this.dbInstance.batch();
        const tRef = this.dbInstance.collection(this.KEYS.TEACHERS).doc('1');
        batch.set(tRef, { name: 'مدير النظام', ministryId: '100', password: 'admin', role: 'admin', blocked: false });
        
        const c1Ref = this.dbInstance.collection(this.KEYS.CLASSES).doc('c1');
        batch.set(c1Ref, { name: 'الصف العاشر', section: 'أ' });
        
        const c2Ref = this.dbInstance.collection(this.KEYS.CLASSES).doc('c2');
        batch.set(c2Ref, { name: 'الصف الحادي عشر', section: 'ب' });

        const s1Ref = this.dbInstance.collection(this.KEYS.STUDENTS).doc('2024001');
        batch.set(s1Ref, { academicId: '2024001', name: 'أحمد المحمدي', classId: 'c1', avatar: 'https://i.pravatar.cc/150?u=1' });
        
        const s2Ref = this.dbInstance.collection(this.KEYS.STUDENTS).doc('2024042');
        batch.set(s2Ref, { academicId: '2024042', name: 'سارة خالد', classId: 'c1', avatar: 'https://i.pravatar.cc/150?u=2' });
        
        const s3Ref = this.dbInstance.collection(this.KEYS.STUDENTS).doc('2024089');
        batch.set(s3Ref, { academicId: '2024089', name: 'يوسف إبراهيم', classId: 'c1', avatar: 'https://i.pravatar.cc/150?u=3' });
        
        const s4Ref = this.dbInstance.collection(this.KEYS.STUDENTS).doc('2024101');
        batch.set(s4Ref, { academicId: '2024101', name: 'ليلى أحمد', classId: 'c2', avatar: 'https://i.pravatar.cc/150?u=4' });
        
        await batch.commit();
    },

    async getCollection(collectionName) {
        await this.init();
        const snap = await this.dbInstance.collection(collectionName).get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    async getStudents(classId = null) {
        let query = this.dbInstance.collection(this.KEYS.STUDENTS);
        if (classId) {
            query = query.where('classId', '==', classId);
        }
        const snap = await query.get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    async getTeachers() {
        return await this.getCollection(this.KEYS.TEACHERS);
    },

    async getClasses() {
        return await this.getCollection(this.KEYS.CLASSES);
    },

    async getRecords(date = null, classId = null) {
        let q = this.dbInstance.collection(this.KEYS.RECORDS);
        if (date) q = q.where('date', '==', date);
        if (classId) q = q.where('classId', '==', classId);
        const snap = await q.get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    async saveAttendance(date, classId, attendanceList, teacherId, image = null, notes = null) {
        const existing = await this.dbInstance.collection(this.KEYS.RECORDS)
            .where('date', '==', date)
            .where('classId', '==', classId)
            .get();
            
        let docRef;
        if (!existing.empty) {
            docRef = existing.docs[0].ref;
        } else {
            docRef = this.dbInstance.collection(this.KEYS.RECORDS).doc();
        }

        const report = {
            date,
            classId,
            teacherId,
            details: attendanceList,
            image,
            notes,
            timestamp: new Date().toISOString()
        };

        await docRef.set(report);
    },

    // Admin CRUD Methods
    async addTeacher(teacher) {
        const id = Date.now().toString();
        teacher.blocked = false;
        await this.dbInstance.collection(this.KEYS.TEACHERS).doc(id).set(teacher);
    },
    async deleteTeacher(id) {
        await this.dbInstance.collection(this.KEYS.TEACHERS).doc(id).delete();
    },
    async addClass(cls) {
        const id = 'c' + Date.now();
        // Defensive data normalization
        const normalized = {
            name: cls.name || cls.className || cls.title || 'صف جديد',
            section: cls.section || cls.group || '-'
        };
        await this.dbInstance.collection(this.KEYS.CLASSES).doc(id).set(normalized);
    },
    async deleteClass(id) {
        // Delete all students in this class first
        const students = await this.getStudents(id);
        for (const s of students) {
            await this.deleteStudent(s.id);
        }
        await this.dbInstance.collection(this.KEYS.CLASSES).doc(id).delete();
    },
    async addStudent(student) {
        const id = student.academicId || Date.now().toString();
        student.academicId = id;
        student.name = student.name || 'طالب مجهول';
        
        // Defensive data normalization for AI Agent
        if (student.classid && !student.classId) student.classId = student.classid;
        
        await this.dbInstance.collection(this.KEYS.STUDENTS).doc(id).set(student);
    },
    async deleteStudent(id) {
        await this.dbInstance.collection(this.KEYS.STUDENTS).doc(id).delete();
    },
    async updateTeacher(id, updatedData) {
        await this.dbInstance.collection(this.KEYS.TEACHERS).doc(id).update(updatedData);
    },
    async updateClass(id, updatedData) {
        await this.dbInstance.collection(this.KEYS.CLASSES).doc(id).update(updatedData);
    },
    async updateStudent(id, updatedData) {
        const ref = this.dbInstance.collection(this.KEYS.STUDENTS).doc(id);
        const doc = await ref.get();
        if (doc.exists) {
            // Defensive data normalization for AI Agent
            if (updatedData.classid && !updatedData.classId) updatedData.classId = updatedData.classid;
            
            await ref.update(updatedData);
        }
    },

    // Notification Methods
    async getNotifications(target = {}) {
        await this.init();
        let q = this.dbInstance.collection(this.KEYS.NOTIFICATIONS);
        
        // If target is provided (for student view)
        if (target.id || target.classId) {
            // Get all 'all' notifications
            const q1 = await q.where('targetType', '==', 'all').get();
            let results = q1.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Get class specific
            if (target.classId) {
                const q2 = await q.where('targetType', '==', 'class').where('targetId', '==', target.classId).get();
                results = [...results, ...q2.docs.map(doc => ({ id: doc.id, ...doc.data() }))];
            }

            // Get student specific
            if (target.id) {
                const q3 = await q.where('targetType', '==', 'student').where('targetId', '==', target.id).get();
                results = [...results, ...q3.docs.map(doc => ({ id: doc.id, ...doc.data() }))];
            }
            
            // Remove duplicates (if any) and sort
            const uniqueResults = Array.from(new Map(results.map(item => [item.id, item])).values());
            return uniqueResults.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        }

        const snap = await q.orderBy('timestamp', 'desc').get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    async addNotification(notification) {
        notification.timestamp = new Date().toISOString();
        const ref = await this.dbInstance.collection(this.KEYS.NOTIFICATIONS).add(notification);
        return ref.id;
    },

    async updateNotification(id, data) {
        await this.dbInstance.collection(this.KEYS.NOTIFICATIONS).doc(id).update(data);
    },

    async deleteNotification(id) {
        await this.dbInstance.collection(this.KEYS.NOTIFICATIONS).doc(id).delete();
    },

    // Holiday logic
    async isHoliday(dateString) {
        const date = new Date(dateString);
        const day = date.getDay(); 
        if (day === 5 || day === 6) return true;

        const holidays = await this.getCollection(this.KEYS.HOLIDAYS);
        return holidays.some(h => h.date === dateString);
    },

    async deleteRecord(id) {
        await this.dbInstance.collection(this.KEYS.RECORDS).doc(id).delete();
    },

    async updateRecordDetails(id, newDetails) {
        await this.dbInstance.collection(this.KEYS.RECORDS).doc(id).update({
            details: newDetails
        });
    },

    // Generic Methods for AI Agent
    async insert(table, data) {
        if (table === 'students') return await this.addStudent(data);
        if (table === 'teachers') return await this.addTeacher(data);
        if (table === 'classes') return await this.addClass(data);
        
        const col = this.KEYS[table.toUpperCase()] || table;
        return await this.dbInstance.collection(col).add(data);
    },

    async update(table, id, data) {
        if (table === 'students') return await this.updateStudent(id, data);
        if (table === 'teachers') return await this.updateTeacher(id, data);
        if (table === 'classes') return await this.updateClass(id, data);
        
        const col = this.KEYS[table.toUpperCase()] || table;
        return await this.dbInstance.collection(col).doc(id).update(data);
    },

    async delete(table, id) {
        if (table === 'students') return await this.deleteStudent(id);
        if (table === 'teachers') return await this.deleteTeacher(id);
        if (table === 'classes') return await this.deleteClass(id);
        if (table === 'records') return await this.deleteRecord(id);
        if (table === 'notifications') return await this.deleteNotification(id);
        
        const col = this.KEYS[table.toUpperCase()] || table;
        return await this.dbInstance.collection(col).doc(id).delete();
    }
};
