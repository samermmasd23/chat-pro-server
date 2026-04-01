import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import { createServer } from 'http';
import { Server } from 'socket.io';
import multer from 'multer';
import bcrypt from 'bcrypt';
import path from 'path';


const sql = sqlite3.verbose();
const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json({ limit: '50mb' }));
app.use(cors());
app.use('/uploads', express.static('uploads'));

// 📁 إعدادات رفع الملفات
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1000) + ext);
    }
});
const upload = multer({ storage });

// 🗄️ إعداد قاعدة البيانات
const db = new sql.Database('./chat_database.db', (err) => {
    if (err) {
        console.error("❌ خطأ بفتح الداتا بيس:", err);
    } else {
        db.serialize(() => {
            // 🟢 سطر الاقتراحات اللي ضفته (هيك صار مكانه آمن)
            db.run(`CREATE TABLE IF NOT EXISTS suggestions (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT, text TEXT, timestamp TEXT)`);
            
            // جدول المستخدمين
            db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, project TEXT, role TEXT, avatar TEXT)`);            
            // 📌 جدول الرسائل المحدث (يحتوي على seenBy)
            db.run(`CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT, 
                sender TEXT, 
                project TEXT, 
                room TEXT, 
                text TEXT, 
                avatar TEXT, 
                fileUrl TEXT, 
                fileName TEXT, 
                fileType TEXT, 
                timestamp TEXT,
                replyTo TEXT,
                status TEXT DEFAULT 'sent',
                reactions TEXT DEFAULT '{}',
                seenBy TEXT DEFAULT '[]'
            )`);
            
            // أسطر احتياطية للتأكد من وجود الأعمدة في حال كانت القاعدة قديمة
            db.run(`ALTER TABLE messages ADD COLUMN replyTo TEXT`, (err) => {
                if (!err) console.log("✅ تم تحديث جدول الرسائل بنجاح (replyTo)!");
            });
            db.run(`ALTER TABLE messages ADD COLUMN status TEXT DEFAULT 'sent'`, (err) => {
                if (!err) console.log("✅ تم تحديث جدول الرسائل بنجاح (status)!");
            });
            db.run(`ALTER TABLE messages ADD COLUMN reactions TEXT DEFAULT '{}'`, (err) => {
                if (!err) console.log("✅ تم تحديث جدول الرسائل بنجاح (reactions)!");
            });
            db.run(`ALTER TABLE messages ADD COLUMN seenBy TEXT DEFAULT '[]'`, (err) => {
                if (!err) console.log("✅ تم تحديث جدول الرسائل بنجاح (seenBy)!");
            });

            console.log("✅ قاعدة البيانات جاهزة للعمل!");
        });
    }
});

// 🔑 تسجيل الدخول والحماية
app.post('/login', async (req, res) => {
    const { username, password, project } = req.body;
    
    // تأمين لوحة الإدارة
    const isAdmin = (username === "samer.mustafa" && password === "samer2026123");
    const role = isAdmin ? "manager" : "employee";

    db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, row) => {
        if (row) {
            // 🔍 مقارنة الباسوورد المكتوب مع المشفر في الداتا بيس
            const isMatch = await bcrypt.compare(password, row.password);
            
            if (!isMatch) return res.status(401).json({ error: "❌ كلمة المرور خاطئة!" });
            if (row.project !== project) return res.status(403).json({ error: `⚠️ حسابك تابع لمشروع (${row.project})، الرجاء اختياره.` });
            
            if (role === 'manager' && row.role !== 'manager') {
                db.run(`UPDATE users SET role = 'manager' WHERE username = ?`, [username]);
                row.role = 'manager';
            }
            res.json({ user: { name: row.username, project: row.project, role: row.role, avatar: row.avatar } });
        } else {
            // 🌪️ تشفير الباسوورد قبل تخزينه لأول مرة
            const hashedPassword = await bcrypt.hash(password, 10);
            db.run(`INSERT INTO users (username, password, project, role) VALUES (?, ?, ?, ?)`, [username, hashedPassword, project, role], function() {
                res.json({ user: { name: username, project, role, avatar: null } });
            });
        }
    });
});

// 👑 مسارات الإدارة (للمدير سامر فقط)
app.get('/admin/users', (req, res) => {
    db.all(`SELECT id, username, project, role, avatar FROM users`, [], (err, rows) => res.json(rows));
}); // 👈 هاد السطر اللي ناقص عندك (لازم تسكر مسار اليوزرات هون)

// 📥 جلب كل الاقتراحات للمدير
app.get('/admin/suggestions', (req, res) => {
    db.all(`SELECT * FROM suggestions ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: "فشل جلب الاقتراحات" });
        res.json(rows);
    });
});

app.delete('/admin/users/:username', (req, res) => {
    db.run(`DELETE FROM users WHERE username = ?`, [req.params.username], () => {
        db.run(`DELETE FROM messages WHERE sender = ?`, [req.params.username]);
        res.json({ success: true });
    });
});

app.put('/admin/users/password', async (req, res) => {
    const { username, newPassword } = req.body;
    // تشفير الباسوورد الجديد
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    
    db.run(`UPDATE users SET password = ? WHERE username = ?`, [hashedNewPassword, username], () => {
        res.json({ success: true });
    });
});

// 📤 رفع الملفات
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "لم يتم رفع ملف" });
    const hostUrl = req.protocol + '://' + req.get('host');
    const fileUrl = `${hostUrl}/uploads/${req.file.filename}`;
    res.json({ fileUrl, fileName: req.file.originalname, fileType: req.file.mimetype });
});

app.post('/suggestions', (req, res) => {
    const { name, phone, text } = req.body;
    const timestamp = new Date().toLocaleString();
    db.run(`INSERT INTO suggestions (name, phone, text, timestamp) VALUES (?, ?, ?, ?)`, 
    [name, phone, text, timestamp], (err) => {
        if (err) return res.status(500).json({ error: "فشل تخزين الاقتراح" });
        res.json({ success: true });
    });
});

// 🔌 اتصالات Socket.io (الرادار، الرسائل، الكتابة، الحذف)
let connectedUsers = [];

io.on('connection', (socket) => {
    socket.on('join_project', (userData) => {
        socket.join(userData.project);
        connectedUsers.push({ socketId: socket.id, ...userData });
        const projectUsers = connectedUsers.filter(u => u.project === userData.project);
        const uniqueUsers = Array.from(new Map(projectUsers.map(u => [u.name, u])).values());
        io.to(userData.project).emit('online_users', uniqueUsers);
        
        db.all(`SELECT username as name, avatar FROM users WHERE project = ?`, [userData.project], (err, rows) => {
            if (!err) socket.emit('project_members', rows);
        });

        db.all(`SELECT * FROM messages WHERE project = ? ORDER BY id ASC`, [userData.project], (err, rows) => {
            if (!err) socket.emit('load_history', rows);
        });
    });
    // 🏠 كود الانضمام للغرفة وتحميل رسائلها فقط (الحل لتمسيح الشات)
    socket.on('join_room', ({ room, userName, project }) => {
        socket.join(room);
        
        // جلب رسائل هاي الغرفة بالذات وإرسالها لليوزر اللي دخل هسا
        db.all(`SELECT * FROM messages WHERE project = ? AND room = ? ORDER BY id ASC`, [project, room], (err, rows) => {
            if (!err) {
                socket.emit('load_history', rows); // هيك السيرفر "بينظف" الشاشة عند الموظف ببيانات الغرفة الجديدة
            }
        });
    });

    // 📌 إرسال الرسالة مع seenBy فارغ
    socket.on('send_message', (data) => {
        db.run(`INSERT INTO messages (sender, project, room, text, avatar, fileUrl, fileName, fileType, timestamp, replyTo, status, reactions, seenBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
            [data.sender, data.project, data.room, data.text, data.avatar, data.fileUrl, data.fileName, data.fileType, data.timestamp, data.replyTo, 'sent', '{}', '[]'], 
            function(err) {
                if (!err) {
                    data.id = this.lastID; 
                    data.status = 'sent';  
                    data.reactions = '{}'; 
                    data.seenBy = '[]'; 
                    io.to(data.project).emit('receive_message', data);
                }
            });
    });

    // 👁️ ميزة الصحين + تتبع مين شاف الرسالة
    socket.on('mark_room_seen', ({ room, viewer, project }) => {
        db.all(`SELECT id, seenBy FROM messages WHERE project = ? AND room = ? AND sender != ?`, [project, room, viewer], (err, rows) => {
            if (!err && rows.length > 0) {
                rows.forEach(row => {
                    let seenList = [];
                    try { seenList = JSON.parse(row.seenBy || '[]'); } catch(e_){}
                    
                    if (!seenList.includes(viewer)) {
                        seenList.push(viewer);
                        const updatedSeenBy = JSON.stringify(seenList);
                        db.run(`UPDATE messages SET seenBy = ?, status = 'seen' WHERE id = ?`, [updatedSeenBy, row.id]);
                        io.to(project).emit('message_seen_by_update', { messageId: row.id, seenBy: updatedSeenBy });
                    }
                });
            }
        });
    });

    // ❤️ ميزة إضافة/إزالة تفاعل 
    socket.on('add_reaction', ({ messageId, emoji, userName, project }) => {
        db.get(`SELECT reactions FROM messages WHERE id = ?`, [messageId], (err, row) => {
            if (row) {
                let reactionsObj = {};
try { reactionsObj = JSON.parse(row.reactions || '{}'); } catch(e_){ /* error ignored */ }             آ   
                let userAlreadyHadThisEmoji = false;

                for (const existingEmoji in reactionsObj) {
                    if (reactionsObj[existingEmoji].includes(userName)) {
                        if (existingEmoji === emoji) {
                            userAlreadyHadThisEmoji = true; 
                        }
                        reactionsObj[existingEmoji] = reactionsObj[existingEmoji].filter(u => u !== userName);
                        if (reactionsObj[existingEmoji].length === 0) {
                            delete reactionsObj[existingEmoji];
                        }
                    }
                }

                if (!userAlreadyHadThisEmoji) {
                    if (!reactionsObj[emoji]) reactionsObj[emoji] = [];
                    reactionsObj[emoji].push(userName);
                }

                const updatedReactionsStr = JSON.stringify(reactionsObj);
                db.run(`UPDATE messages SET reactions = ? WHERE id = ?`, [updatedReactionsStr, messageId], (err) => {
                    if (!err) io.to(project).emit('reaction_updated', { messageId, reactions: updatedReactionsStr });
                });
            }
        });
    });

    // 🗑️ ميزة حذف الرسائل
    socket.on('delete_message', ({ messageId, project }) => {
        db.run(`DELETE FROM messages WHERE id = ?`, [messageId], (err) => {
            if (!err) io.to(project).emit('message_deleted', messageId);
        });
    });

    // ✍️ ميزة يكتب الآن
    socket.on('typing', (data) => {
        socket.to(data.project).emit('display_typing', data);
    });

    socket.on('disconnect', () => {
        const user = connectedUsers.find(u => u.socketId === socket.id);
        if (user) {
            connectedUsers = connectedUsers.filter(u => u.socketId !== socket.id);
            const projectUsers = connectedUsers.filter(u => u.project === user.project);
            const uniqueUsers = Array.from(new Map(projectUsers.map(u => [u.name, u])).values());
            io.to(user.project).emit('online_users', uniqueUsers);
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`🚀 السيرفر شغال على بورت ${PORT} (كل الأنظمة مفعلة)!`));