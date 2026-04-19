/**
 * Authentication and Session Management
 */

const Auth = {
    async login(ministryId, password) {
        await DB.init();
        const teachers = await DB.getTeachers();
        const user = teachers.find(t => t.ministryId === ministryId && t.password === password);
        
        if (user) {
            if (user.blocked) return { success: false, message: 'حسابك محظور. يرجى مراجعة الإدارة.' };
            
            localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify(user));
            return { success: true, user };
        }
        
        return { success: false, message: 'الرقم الوزاري أو كلمة السر غير صحيحة.' };
    },

    logout() {
        localStorage.removeItem(DB.KEYS.CURRENT_USER);
        window.location.href = 'index.html';
    },

    getCurrentUser() {
        const val = localStorage.getItem(DB.KEYS.CURRENT_USER);
        return val ? JSON.parse(val) : null;
    },

    checkAuth(requiredRole = null) {
        const user = this.getCurrentUser();
        if (!user) {
            window.location.href = 'index.html';
            return null;
        }
        if (requiredRole && user.role !== requiredRole && user.role !== 'admin') {
            alert('ليس لديك صلاحية للوصول إلى هذه الصفحة');
            window.location.href = 'index.html';
            return null;
        }
        return user;
    }
};
