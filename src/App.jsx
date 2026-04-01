import { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, Hash, Settings, LogOut, Paperclip, Send, 
  Users, LayoutDashboard, Lightbulb, FolderKanban, ShieldAlert, Scroll, X, Camera,
  ShieldCheck, Trash2, Key, Smile, User, Eye, Sun, Moon, Mic, Square, ChevronDown, ChevronRight
} from 'lucide-react';
import { io } from 'socket.io-client';

const SERVER_URL = " https://cruel-hotels-start.loca.lt"; 
const socket = io(SERVER_URL);

function App() {
  // 💾 قراءة بيانات الدخول من الذاكرة أول ما يشتغل التطبيق
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('chatUser');
    return saved ? JSON.parse(saved) : null;
  });

  // 💡 إذا في يوزر مخزن بالذاكرة، بنعتبره مسجل دخول
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!localStorage.getItem('chatUser'));

  const [activeTab, setActiveTab] = useState(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isUploading, setIsUploading] = useState(false); 
  const [showSettings, setShowSettings] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isMembersListOpen, setIsMembersListOpen] = useState(true);
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  
  const [isThemeDark, setIsThemeDark] = useState(true);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [projectMembers, setProjectMembers] = useState([]); 
  const [allSuggestions, setAllSuggestions] = useState([]);
  const [zoomedImage, setZoomedImage] = useState(null);
  const [unreadTabs, setUnreadTabs] = useState({});
  const [typingUsers, setTypingUsers] = useState([]);
  const [allUsersDB, setAllUsersDB] = useState([]);

  const [replyingTo, setReplyingTo] = useState(null); 
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [reactionPickerId, setReactionPickerId] = useState(null);
  const [viewSeenById, setViewSeenById] = useState(null);

  const typingTimeouts = useRef({});
  const avatarInputRef = useRef(null);
  const chatFileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  
  const activeTabRef = useRef(activeTab);
  const currentUserRef = useRef(currentUser);

  // 🎨 نظام الثيمات
  const theme = {
    bgMain: isThemeDark ? '#1e1f22' : '#efeae2',
    bgSidebar: isThemeDark ? '#2b2d31' : '#ffffff',
    textMain: isThemeDark ? '#ffffff' : '#211111',
    textMuted: isThemeDark ? '#949ba4' : '#667781',
    msgIn: isThemeDark ? '#202c33' : '#ffffff',
    msgOut: isThemeDark ? '#005c4b' : '#d9fdd3',
    msgText: isThemeDark ? '#e9edef' : '#111b21',
    inputArea: isThemeDark ? '#202c33' : '#f0f2f5',
    inputBox: isThemeDark ? '#2a3942' : '#ffffff',
    border: isThemeDark ? '#1e1f22' : '#d1d7db',
  };

  const commonEmojis = ["😊", "😂", "❤️", "👍", "🔥", "🙌", "🎉", "😎", "🤔", "😢", "🚀", "👌"];
  const reactionEmojis = ["❤️", "😂", "👍", "🔥", "😢", "👀"];

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    activeTabRef.current = activeTab;
    if (activeTab && unreadTabs[activeTab]) {
      setUnreadTabs(prev => ({ ...prev, [activeTab]: false }));
    }
  }, [activeTab, unreadTabs]);

  const getDMRoomName = (user1, user2) => `DM_${[user1, user2].sort().join('_')}`;
  const getDMName = (room) => {
    if (!room?.startsWith('DM_')) return room;
    const names = room.replace('DM_', '').split('_');
    return names.filter(n => n !== currentUser?.name).join(' ') || room;
  };

  const getActiveProject = () => {
    if (!activeTab || !currentUser) return currentUser?.project;
    return (currentUser.role === 'manager' && !['announcements', 'suggestions'].includes(activeTab)) 
      ? 'WFP Yemen' : currentUser.project;
  };

// 🔔 طلب إذن إشعارات الويندوز أول ما يفتح التطبيق
  useEffect(() => {
    if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
      Notification.requestPermission();
    }
  }, []);

  // 📡 جلب البيانات
  async function fetchAllUsers() {
    try {
      const res = await fetch(`${SERVER_URL}/admin/users`);
      const data = await res.json();
      setAllUsersDB(Array.isArray(data) ? data : []);
    } catch (err) { console.error(err); }
  }

  const fetchSuggestions = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/admin/suggestions`);
      const data = await res.json();
      setAllSuggestions(Array.isArray(data) ? data : []);
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    if (currentUser?.role === 'manager') {
      fetchAllUsers();
      fetchSuggestions();
    }
  }, [currentUser, activeTab]);

  // 🔌 السوكيت
  useEffect(() => {
    if (!socket || !currentUser) return;

const handleReceiveMessage = (data) => {
      if (currentUser.role === 'manager' || data.project === currentUser.project) {
        setMessages((prev) => [...prev, { ...data, status: data.status || 'sent', reactions: data.reactions || '{}', seenBy: data.seenBy || '[]' }]);
        
        // 🔔 إذا الرسالة إجت على غرفة غير اللي إنت فاتحها هسا
        if (data.room !== activeTabRef.current) {
          setUnreadTabs(prev => ({ ...prev, [data.room]: true }));
          
          // 1. تشغيل الصوت
          const ringtone = new Audio('/notification.mp3');
          ringtone.play().catch(e => console.log('الصوت انمنع:', e));

          // 2. 🚀 إشعار الويندوز (Desktop Notification)
          if ("Notification" in window && Notification.permission === "granted") {
            // نطلع إشعار بس إذا كانت الشاشة مخفية أو إنت بتاب ثاني
            if (document.hidden) { 
              new Notification(`رسالة جديدة من ${data.sender}`, {
                body: data.text ? data.text : "📎 أرسل مرفقاً",
                icon: data.avatar || "https://cdn-icons-png.flaticon.com/512/3114/3114810.png"
              });
            }
          }
        }
      }
    };

    const handleLoadHistory = (history) => {
      const safeHistory = Array.isArray(history) ? history : [];
      setMessages(safeHistory);
      const user = currentUser;
      const newUnread = {};
      safeHistory.forEach(msg => {
        if (msg.sender !== user.name) {
          let seenList = [];
          try { seenList = JSON.parse(msg.seenBy || '[]'); } catch(e){}
          const isLegacySeen = (seenList.length === 0 && msg.status === 'seen');
          if (!seenList.includes(user.name) && !isLegacySeen) {
            if (msg.room && (!msg.room.startsWith('DM_') || msg.room.split('_').includes(user.name))) {
              if (msg.room !== activeTabRef.current) newUnread[msg.room] = true;
            }
          }
        }
      });
      setUnreadTabs(prev => ({ ...prev, ...newUnread }));
    };

    const handleTyping = (data) => {
      if (data.room !== activeTabRef.current) return;
      setTypingUsers(prev => {
        if (!prev.includes(data.sender)) return [...prev, data.sender];
        return prev;
      });
      if (typingTimeouts.current[data.sender]) clearTimeout(typingTimeouts.current[data.sender]);
      typingTimeouts.current[data.sender] = setTimeout(() => {
        setTypingUsers(prev => prev.filter(user => user !== data.sender));
      }, 2000);
    };

    socket.on("receive_message", handleReceiveMessage);
    socket.on("load_history", handleLoadHistory);
    socket.on("online_users", (users) => setOnlineUsers(Array.isArray(users) ? users : []));
    socket.on("project_members", (members) => setProjectMembers(Array.isArray(members) ? members : []));
    socket.on("display_typing", handleTyping);
    socket.on("message_deleted", (id) => setMessages(prev => prev.filter(m => m.id !== id)));
    socket.on("message_seen_by_update", ({ messageId, seenBy }) => {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, status: 'seen', seenBy } : m));
    });
    socket.on("reaction_updated", ({ messageId, reactions }) => {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reactions } : m));
    });

    socket.emit("join_project", { project: getActiveProject(), name: currentUser.name, avatar: currentUser.avatar });

    return () => {
      socket.off("receive_message");
      socket.off("load_history");
      socket.off("online_users");
      socket.off("project_members");
      socket.off("display_typing");
      socket.off("message_deleted");
      socket.off("message_seen_by_update");
      socket.off("reaction_updated");
    };
  }, [currentUser, socket]);

  useEffect(() => {
    if (activeTab && activeTab !== 'admin_dashboard' && currentUser && socket) {
      const projectToJoin = getActiveProject();
      socket.emit("join_room", { room: activeTab, userName: currentUser.name, project: projectToJoin });
      socket.emit("mark_room_seen", { room: activeTab, viewer: currentUser.name, project: projectToJoin });
    }
  }, [activeTab, currentUser, socket]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, activeTab, typingUsers.length]);

  // 🛡️ وظائف الإدارة
  const handleDeleteUser = async (username) => {
    if (!window.confirm(`⚠️ هل أنت متأكد من طرد "${username}" نهائياً؟`)) return;
    try {
      await fetch(`${SERVER_URL}/admin/users/${encodeURIComponent(username)}`, { method: 'DELETE' });
      fetchAllUsers();
    } catch(err) { console.error(err); }
  };
  
  const handleChangePassword = async (username) => {
    const newPass = window.prompt(`🔑 كلمة المرور الجديدة لـ "${username}":`);
    if (!newPass) return;
    try {
      await fetch(`${SERVER_URL}/admin/users/password`, {
        method: 'PUT', headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, newPassword: newPass })
      });
      alert("✅ تم تغيير كلمة المرور!");
    } catch(err) { console.error(err); }
  };

  // 🚪 تسجيل الدخول والخروج
  const handleLogin = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const username = formData.get("username");
    const password = formData.get("password");
    const project = formData.get("project");

    try {
      const response = await fetch(`${SERVER_URL}/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, project })
      });
      const data = await response.json();

      if (response.ok) {
        setCurrentUser(data.user);
        setIsAuthenticated(true);
        localStorage.setItem('chatUser', JSON.stringify(data.user)); // 💾 الحفظ بالذاكرة
      } else {
        alert(data.error || "فشل تسجيل الدخول");
      }
    } catch (error) { console.error("Login error:", error); }
  };

  const handleLogout = () => {
    if (window.confirm("متأكد بدك تسجل خروج؟ 🚪")) {
      setCurrentUser(null);
      setIsAuthenticated(false);
      localStorage.removeItem('chatUser'); // 🗑️ تنظيف الذاكرة
      setActiveTab(null);
    }
  };

  // 👤 تحديث الملف الشخصي
  async function updateProfile(e) {
    e.preventDefault();
    const newName = e.target.newName.value;
    if (newName.trim()) {
      try {
        const response = await fetch(`${SERVER_URL}/update-profile`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ oldName: currentUser.name, newName, avatar: currentUser.avatar })
        });
        const data = await response.json();
        if (response.ok) {
          setCurrentUser(data.user);
          localStorage.setItem('chatUser', JSON.stringify(data.user)); // 🔄 تحديث الذاكرة بالاسم الجديد
          setShowSettings(false);
          alert("تم تحديث ملفك بنجاح! ✅");
        } else alert("الاسم مأخوذ.");
      } catch(err) { console.error(err); }
    }
  }

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setCurrentUser(prev => ({ ...prev, avatar: reader.result }));
      reader.readAsDataURL(file);
    }
  };

  // 💬 وظائف المحادثة والتسجيل
  const sendMessage = (e) => {
    e.preventDefault();
    if (!activeTab || activeTab === 'admin_dashboard') return;
    
    if (isRecording) {
      stopRecording(); 
      return; 
    }

    if (inputMessage.trim() && currentUser) {
      const messageData = {
        sender: currentUser.name, 
        project: getActiveProject(),        
        room: activeTab,
        text: inputMessage, 
        avatar: currentUser.avatar,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        replyTo: replyingTo ? { sender: replyingTo.sender, text: replyingTo.text } : null,
        status: 'sent',
        reactions: '{}',
        seenBy: '[]'
      };
      socket.emit("send_message", messageData);
      setInputMessage("");
      setReplyingTo(null);
      setShowEmojiPicker(false);
    }
  };

  const handleDeleteMessage = (messageId) => {
    if (!messageId) return;
    if (window.confirm("هل أنت متأكد من حذف هذه الرسالة للجميع؟")) {
      socket.emit("delete_message", { messageId, project: getActiveProject(), room: activeTab });    
    }
  };

  const handleInputChange = (e) => {
    setInputMessage(e.target.value);
    if (activeTab && activeTab !== 'admin_dashboard' && currentUser) {
      socket.emit("typing", { sender: currentUser.name, room: activeTab, project: getActiveProject() });    
    }
  };

  const addEmoji = (emoji) => setInputMessage(prev => prev + emoji);
  
  const toggleReaction = (messageId, emoji) => {
    socket.emit('add_reaction', {
      messageId, emoji, userName: currentUser.name,
      project: getActiveProject(), room: activeTab
    });
    setReactionPickerId(null);
  };

  const handleChatFileUpload = async (e, directFiles = null) => {
    const files = directFiles || Array.from(e.target.files);
    if (files.length === 0 || activeTab === 'admin_dashboard') return;

    setIsUploading(true);

    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);

      try {
        const response = await fetch(`${SERVER_URL}/upload`, { method: "POST", body: formData });
        const fileData = await response.json();

        if (response.ok) {
          socket.emit("send_message", {
            sender: currentUser.name, project: currentUser.project, room: activeTab,
            text: `📎 أرسل مرفقاً: ${fileData.fileName}`, avatar: currentUser.avatar,
            fileUrl: fileData.fileUrl, fileName: fileData.fileName, fileType: fileData.fileType,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            replyTo: null, status: 'sent', reactions: '{}', seenBy: '[]'
          });
        }
      } catch (_error) { console.error(_error); }
    }
    setIsUploading(false);
    if (e?.target) e.target.value = null;
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const file = new File([audioBlob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });
        handleChatFileUpload(null, [file]);    
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (err) { alert("يا غالي فعل المايك من المتصفح!"); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0 && activeTab && activeTab !== 'admin_dashboard') {
      handleChatFileUpload(null, files); 
    }
  };

  const handleSuggestionSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const suggestionData = {
      name: formData.get("الاسم_الكامل"), phone: formData.get("رقم_الهاتف"), text: formData.get("الاقتراح")
    };

    try {
      const response = await fetch(`${SERVER_URL}/suggestions`, { 
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(suggestionData) 
      });

      if (response.ok) {
        setIsSubmitted(true);
        e.target.reset();
        setTimeout(() => setIsSubmitted(false), 4000);
      } else alert("⚠️ فشل الإرسال للسيرفر الخاص.");
    } catch (error) { 
      console.error(error);
      alert("🚀 السيرفر طافي، تأكد إنه شغال!");
    }
  };

  // 🟢 فلترة الأعضاء لـ God Mode
  const displayMembers = currentUser?.role === 'manager' && allUsersDB.length > 0 
    ? allUsersDB.map(u => ({ name: u.username, avatar: u.avatar, role: u.role, project: u.project })) 
    : projectMembers;

const sortedMembers = [...displayMembers].sort((a, b) => {
    // 1. أنت دائماً في القمة 👑
    if (a.name === currentUser?.name) return -1;
    if (b.name === currentUser?.name) return 1;

    // 2. فحص حالة الأونلاين
    const aOnline = onlineUsers.some(u => u.name === a.name);
    const bOnline = onlineUsers.some(u => u.name === b.name);
    
    // 3. ترتيب الباقي (أونلاين قبل أوفلاين)
    if (aOnline && !bOnline) return -1;
    if (!aOnline && bOnline) return 1;
    return 0;
  });

  // 🛑 شاشة تسجيل الدخول
  if (!isAuthenticated || !currentUser) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: theme.bgMain, fontFamily: 'system-ui' }}>
        <div style={{ backgroundColor: theme.bgSidebar, padding: '40px', borderRadius: '8px', width: '400px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
          <h2 style={{ color: theme.textMain, textAlign: 'center' }}>مرحباً بك في Chat Pro</h2>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
            <input name="username" placeholder="الاسم الكامل" required style={{ padding: '10px', borderRadius: '4px', border: `1px solid ${theme.border}`, background: theme.bgMain, color: theme.textMain }} />
            <input type="password" name="password" placeholder="كلمة المرور" required style={{ padding: '10px', borderRadius: '4px', border: `1px solid ${theme.border}`, background: theme.bgMain, color: theme.textMain }} />
            <select name="project" required style={{ padding: '10px', borderRadius: '4px', border: `1px solid ${theme.border}`, background: theme.bgMain, color: theme.textMain }}>
              <option value="WFP Yemen">WFP Yemen</option><option value="QH Qatar">QH Qatar</option><option value="IT Team">IT Team</option>
            </select>
            <button type="submit" style={{ backgroundColor: '#5865f2', color: 'white', padding: '12px', borderRadius: '4px', cursor: 'pointer', border: 'none', fontWeight: 'bold' }}>دخول</button>
          </form>
        </div>
      </div>
  );

  return (
    <div className="app-container" style={{ background: theme.bgMain }}>
      {/* 🟢 CSS الديناميكي  للثيمات 🟢 */}
      <style>{`
      
      .app-container { display: flex; height: 100vh; width: 100vw; overflow: hidden; }
        .sidebar { width: 280px; flex-shrink: 0; display: flex; flex-direction: column; }
        .main-chat { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
        .chat-header { display: flex; align-items: center; gap: 10px; padding: 12px 20px; flex-shrink: 0; }
        .messages-area { flex: 1; overflow-y: auto; }
        .input-area { flex-shrink: 0; position: relative; }
        .avatar { flex-shrink: 0; overflow: hidden; }

        .sidebar { background-color: ${theme.bgSidebar} !important; border-left: 1px solid ${theme.border}; }        
        .main-chat {
          background: ${isThemeDark ? 'radial-gradient(circle at top center, #213038 0%, #1e1f22 100%)' : '#efeae2'} !important;
        }

        .nav-item {
          transition: all 0.2s ease-in-out;
          color: ${theme.textMuted};
        }
        .nav-item:hover {
          background-color: ${isThemeDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'};
        }
        .nav-item.active {
          background: ${isThemeDark ? 'linear-gradient(90deg, transparent 0%, rgba(14, 220, 227, 0.15) 100%)' : 'linear-gradient(90deg, transparent 0%, rgba(14, 220, 227, 0.3) 100%)'};
          border-right: 4px solid #0edce3;
          color: ${theme.textMain} !important;
          border-radius: 6px;
        }

        .section-title { color: ${theme.textMuted} !important; }
        .chat-header h2 { color: ${theme.textMain} !important; }
        .welcome-screen h1 { color: ${theme.textMain} !important; }
        .welcome-screen p { color: ${theme.textMuted} !important; }

        /* === 🧱 شكل صندوق الكتابة الجديد الثابت (3D) === */
        .input-glow-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          border-radius: 24px;
          padding: 2px;
          width: 100%;
          background: linear-gradient(180deg, rgba(14, 220, 227, 0) 10%, #0edce3 100%);
          box-shadow: 0 8px 25px rgba(14, 220, 227, 0.3);
        }
        
        .input-glow-bg {
          display: none; 
        }
        
        .input-glow-content {
          position: relative;
          display: flex;
          align-items: center;
          background-color: ${theme.inputBox};
          border-radius: 22px;
          width: 100%;
          height: 100%;
          padding: 5px 15px;
          z-index: 2;
          box-shadow: inset 0 4px 10px rgba(0, 0, 0, 0.2);
        }
        
        .input-glow-content input[type="text"]:focus {
          outline: none;
        }
        
        .action-btn-clean {
          background: none;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* إصلاح لون الشريط العلوي */
        .chat-header {
          background-color: ${theme.bgSidebar} !important;
          border-bottom: 1px solid ${theme.border} !important;
          color: ${theme.textMain} !important;
        }

        /* 🎤 أنيميشن النبض للمايك */
        @keyframes pulse-red {
          0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(242, 63, 67, 0.7); }
          70% { transform: scale(1.1); box-shadow: 0 0 0 10px rgba(242, 63, 67, 0); }
          100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(242, 63, 67, 0); }
        }
        
        .mic-active {
          animation: pulse-red 1.5s infinite;
          background-color: #f23f43 !important;
          color: white !important;
          border-radius: 50%;
        }
        
        .mic-idle:hover {
          color: #0edce3 !important;
          transform: scale(1.1);
        }
      `}</style>

      {zoomedImage && (
        <div onClick={() => setZoomedImage(null)} style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'zoom-out' }}>
          <img src={zoomedImage} style={{ maxWidth: '90%', maxHeight: '90%', borderRadius: '8px', boxShadow: '0 0 20px rgba(0,0,0,0.5)' }} />
          <X size={30} style={{ position: 'absolute', top: '20px', right: '20px', color: 'white', cursor: 'pointer' }} />
        </div>
      )}

      {showSettings && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ backgroundColor: theme.bgSidebar, padding: '30px', borderRadius: '12px', width: '350px', position: 'relative' }}>
            <X style={{ position: 'absolute', top: '15px', right: '15px', color: theme.textMuted, cursor: 'pointer' }} onClick={() => setShowSettings(false)} />
            <h2 style={{ color: theme.textMain, textAlign: 'center', marginBottom: '20px' }}>إعدادات الحساب</h2>
            <form onSubmit={updateProfile} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
              <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => avatarInputRef.current.click()}>
                <div style={{ width: '100px', height: '100px', borderRadius: '50%', backgroundColor: '#5865f2', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: `4px solid ${theme.bgMain}` }}>
                  {currentUser.avatar ? <img src={currentUser.avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '30px', color: 'white' }}>{(currentUser.name || "?").substring(0, 2).toUpperCase()}</span>}
                </div>
                <div style={{ position: 'absolute', bottom: 0, right: 0, backgroundColor: '#5865f2', padding: '5px', borderRadius: '50%' }}><Camera size={16} color="white" /></div>
              </div>
              <input type="file" ref={avatarInputRef} onChange={handleAvatarChange} style={{ display: 'none' }} accept="image/*" />
              <div style={{ width: '100%' }}>
                <label style={{ color: theme.textMuted, fontSize: '12px', fontWeight: 'bold' }}>تغيير الاسم</label>
                <input name="newName" defaultValue={currentUser.name} style={{ width: '100%', padding: '10px', marginTop: '5px', backgroundColor: theme.bgMain, border: 'none', borderRadius: '4px', color: theme.textMain }} />
              </div>
              <button type="submit" style={{ width: '100%', padding: '12px', backgroundColor: '#23a55a', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>حفظ التعديلات</button>
            </form>
          </div>
        </div>
      )}

      <div className="sidebar" style={{ overflowY: 'auto', paddingBottom: '20px' }}>
        <div className="sidebar-header" style={{ backgroundColor: theme.bgSidebar, display: 'flex', alignItems: 'center', padding: '10px', gap: '5px' }}>
          <div style={{ position: 'relative' }}>
             <div className="avatar" style={{ overflow: 'hidden', width: '40px', height: '40px', borderRadius: '50%', background: '#5865f2', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
               {currentUser.avatar ? <img src={currentUser.avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (currentUser.name || "?").substring(0, 2).toUpperCase()}
             </div>
             <div style={{ width: '12px', height: '12px', backgroundColor: '#23a55a', borderRadius: '50%', border: `2px solid ${theme.bgSidebar}`, position: 'absolute', bottom: '2px', right: '2px' }}></div>
          </div>
          <div style={{flex: 1, marginLeft: '8px'}}>
            <h3 style={{color: theme.textMain, fontSize: '14px', margin: 0}}>{currentUser.name}</h3>
            <p style={{fontSize: '11px', color: theme.textMuted, margin: 0}}>{currentUser.project}</p>
          </div>          
          {/* ☀️🌙 زر تغيير الوضع السحري 🌙☀️ */}
          <button onClick={() => setIsThemeDark(!isThemeDark)} style={{ background: 'none', border: 'none', cursor: 'pointer', marginRight: '5px', display: 'flex', alignItems: 'center' }} title={isThemeDark ? "تفعيل الوضع النهاري" : "تفعيل الوضع الليلي"}>
            {isThemeDark ? <Sun size={19} color="#f1c40f" /> : <Moon size={19} color="#3498db" fill="rgba(52, 152, 219, 0.2)" />}
          </button>
          <Settings style={{color: theme.textMuted, cursor: 'pointer', width: '18px', marginRight: '5px'}} onClick={() => setShowSettings(true)} />
          <LogOut style={{color: '#f23f43', cursor: 'pointer', width: '18px'}} onClick={handleLogout} />
        </div>

        {currentUser.role === 'manager' && (
          <>
            <div className="section-title" style={{ color: '#f1c40f', padding: '10px 15px 5px' }}>قسم الإدارة (سري)</div>
            <div className={`nav-item ${activeTab === 'admin_dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('admin_dashboard')} style={{ color: '#f1c40f', fontWeight: 'bold', padding: '8px 15px', cursor: 'pointer' }}>
              <ShieldCheck size={18} style={{verticalAlign: 'middle', marginLeft: '5px'}}/> لوحة تحكم الموظفين
            </div>
            <div style={{ borderBottom: `1px solid ${theme.border}`, margin: '10px 15px' }}></div>
          </>
        )}

        <div className="section-title" style={{ padding: '10px 15px 5px' }}>إعلانات المشروع</div>
        <div className={`nav-item ${activeTab === 'announcements' ? 'active' : ''}`} onClick={() => setActiveTab('announcements')} style={{ position: 'relative', padding: '8px 15px', cursor: 'pointer' }}>
          <ShieldAlert size={18} style={{verticalAlign: 'middle', marginLeft: '5px'}}/> Governorate & Date
          {unreadTabs['announcements'] && activeTab !== 'announcements' && (
            <div style={{ position: 'absolute', left: '15px', top: '15px', width: '8px', height: '8px', backgroundColor: '#3498db', borderRadius: '50%', boxShadow: '0 0 8px #3498db' }}></div>
          )}
        </div>
        
        <div className="section-title" style={{ padding: '10px 15px 5px' }}>مساحة عمل المشروع</div>
        <div className={`nav-item ${activeTab === 'project_general' ? 'active' : ''}`} onClick={() => setActiveTab('project_general')} style={{ position: 'relative', padding: '8px 15px', cursor: 'pointer' }}>
          <Hash size={18} style={{verticalAlign: 'middle', marginLeft: '5px'}}/> {currentUser.project} Aqaba
          {unreadTabs['project_general'] && activeTab !== 'project_general' && (
            <div style={{ position: 'absolute', left: '15px', top: '15px', width: '8px', height: '8px', backgroundColor: '#3498db', borderRadius: '50%', boxShadow: '0 0 8px #3498db' }}></div>
          )}
        </div>
        
        <div className="section-title" style={{ padding: '10px 15px 5px' }}>الأقسام الفرعية</div>
        <div className={`nav-item ${activeTab === 'suggestions' ? 'active' : ''}`} onClick={() => setActiveTab('suggestions')} style={{ position: 'relative', padding: '8px 15px', cursor: 'pointer' }}>
          <Lightbulb size={18} style={{verticalAlign: 'middle', marginLeft: '5px'}}/> اقتراحات
          {unreadTabs['suggestions'] && activeTab !== 'suggestions' && (
            <div style={{ position: 'absolute', left: '15px', top: '15px', width: '8px', height: '8px', backgroundColor: '#3498db', borderRadius: '50%', boxShadow: '0 0 8px #3498db' }}></div>
          )}
        </div>

{/* 👑 القائمة المطوية (السهم السحري) 👑 */}
        <div 
          className="section-title" 
          style={{ 
            marginTop: '20px', padding: '10px 15px 5px', 
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
            cursor: 'pointer', userSelect: 'none' 
          }}
          onClick={() => setIsMembersListOpen(!isMembersListOpen)}
        >
          <span>أعضاء المشروع ({sortedMembers.length})</span>
          {isMembersListOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>

        {/* 👥 حلقة عرض الموظفين (ما بتظهر إلا إذا السهم مفتوح) */}
        {isMembersListOpen && sortedMembers.map((member, idx) => {
          const isOnline = onlineUsers.some(u => u.name === member.name);
          const dmRoomName = getDMRoomName(currentUser.name, member.name);
          
          return (
            <div 
              key={idx} 
              className={`nav-item ${activeTab === dmRoomName ? 'active' : ''}`} 
              onClick={() => {
                if (member.name !== currentUser.name) setActiveTab(dmRoomName);
              }} 
              style={{ padding: '8px 15px', cursor: member.name === currentUser.name ? 'default' : 'pointer', position: 'relative', display: 'flex', alignItems: 'center' }}
            >
              <div style={{ position: 'relative', width: '28px', height: '28px', marginLeft: '8px' }}>
                 <div style={{ width: '100%', height: '100%', borderRadius: '50%', backgroundColor: '#444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: 'white', overflow: 'hidden', opacity: isOnline ? 1 : 0.6 }}>
                   {member.avatar ? <img src={member.avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (member.name || "?").substring(0,2).toUpperCase()}
                 </div>
                 <div style={{ 
                    width: '10px', height: '10px', 
                    background: member.name === 'samer.mustafa' ? 'linear-gradient(135deg, #f3a509, #ffee00, #AA771C)' : (isOnline ? '#23a55a' : '#f23f43'), 
                    borderRadius: '50%', position: 'absolute', bottom: '0', right: '0', 
                    border: `1px solid ${theme.bgSidebar}`,
                    boxShadow: member.role === 'manager' ? '0 0 6px rgba(212, 175, 55, 0.8)' : 'none'
                 }}></div>              
              </div>
              <span style={{ color: member.name === currentUser.name ? theme.textMain : (isOnline ? theme.textMain : theme.textMuted) }}>
                {member.name} {member.name === currentUser.name && "(أنت)"}
              </span>
              
              {unreadTabs[dmRoomName] && activeTab !== dmRoomName && (
                 <div style={{ position: 'absolute', left: '15px', width: '8px', height: '8px', backgroundColor: '#3498db', borderRadius: '50%', boxShadow: '0 0 8px #3498db' }}></div>
              )}
            </div>
          );
        })}
              </div>

      <div className="main-chat">
        {(!activeTab) ? (
          <div className="welcome-screen" style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%'}}>
            <h1>مرحباً {currentUser.name} {currentUser.role === 'manager' && '👑'}</h1>
            <p>أهلاً بك في نظام إدارة مشاريع العقبة</p>
          </div>
        ) : (activeTab === 'admin_dashboard') ? (
          <div style={{ padding: '30px', color: theme.textMain, overflowY: 'auto', width: '100%' }}>
            <h2 style={{ color: '#f1c40f', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ShieldCheck size={28} /> لوحة الإدارة وقاعدة البيانات
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
              {allUsersDB.map(u => (
                <div key={u.id} style={{ background: theme.bgSidebar, padding: '20px', borderRadius: '8px', border: u.role === 'manager' ? '1px solid #f1c40f' : `1px solid ${theme.border}`, position: 'relative' }}>
                  {u.role === 'manager' && <span style={{ position: 'absolute', top: 10, left: 10, fontSize: '20px' }}>👑</span>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: '#5865f2', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold', fontSize: '18px', overflow: 'hidden', color: 'white' }}>
                      {u.avatar ? <img src={u.avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (u.username || "?").substring(0,2).toUpperCase()}
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '18px', color: theme.textMain }}>{u.username}</h3>
                      <p style={{ margin: '5px 0 0', fontSize: '13px', color: theme.textMuted }}>المشروع: <strong>{u.project}</strong></p>
                    </div>
                  </div>
                  {u.username !== currentUser.name && (
                    <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                      <button onClick={() => handleChangePassword(u.username)} style={{ flex: 1, padding: '10px', background: '#5865f2', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', justifyContent: 'center', gap: '5px', fontWeight: 'bold' }}><Key size={16}/> الباسوورد</button>
                      <button onClick={() => handleDeleteUser(u.username)} style={{ flex: 1, padding: '10px', background: '#f23f43', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', justifyContent: 'center', gap: '5px', fontWeight: 'bold' }}><Trash2 size={16}/> طرد</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {/* 📩 صندوق الاقتراحات (للمدير فقط) */}
            <div style={{ marginTop: '30px', padding: '15px', background: 'rgba(0,0,0,0.1)', borderRadius: '10px' }}>
              <h3 style={{ color: '#0edce3' }}>📩 الاقتراحات ({allSuggestions.length})</h3>
              {allSuggestions.map(s => (
                <div key={s.id} style={{ background: theme.bgSidebar, padding: '10px', borderRadius: '6px', marginBottom: '8px', borderRight: '4px solid #0edce3' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                    <strong>{s.name} - {s.phone}</strong>
                    <span>{s.timestamp}</span>
                  </div>
                  <p style={{ margin: '5px 0 0', fontSize: '14px' }}>{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (activeTab === 'suggestions') ? (
          <div className="messages-area" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="suggestion-container" style={{ width: '100%', maxWidth: '600px', padding: '20px' }}>
              <form className="suggestion-form" onSubmit={handleSuggestionSubmit} style={{ background: theme.bgSidebar, padding: '30px', borderRadius: '8px' }}>
                <h3 style={{ color: theme.textMain, textAlign: 'center', marginBottom: '20px' }}>نموذج تقديم اقتراح جديد</h3>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                  <input type="text" name="الاسم_الكامل" placeholder="الاسم الكامل" required style={{ flex: 1, padding: '12px', background: theme.bgMain, border: 'none', borderRadius: '4px', color: theme.textMain }} />
                  <input type="text" name="رقم_الهاتف" placeholder="رقم الهاتف" required style={{ flex: 1, padding: '12px', background: theme.bgMain, border: 'none', borderRadius: '4px', color: theme.textMain }} />
                </div>
                <textarea name="الاقتراح" placeholder="اكتب اقتراحك بالتفصيل هنا..." required style={{ width: '100%', height: '150px', padding: '12px', background: theme.bgMain, border: 'none', borderRadius: '4px', color: theme.textMain, marginBottom: '15px', resize: 'none' }}></textarea>
                <button type="submit" style={{ width: '100%', padding: '12px', background: '#5865f2', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>إرسال الاقتراح</button>
                {isSubmitted && <p style={{ color: '#23a55a', textAlign: 'center', marginTop: '10px' }}>تم الإرسال للإدارة بنجاح! ✅</p>}
              </form>
            </div>
          </div>
        ) : (
          <>
            <div className="chat-header">
              {activeTab === 'announcements' ? <Scroll style={{color: '#f1c40f'}} /> : 
               activeTab.startsWith('DM_') ? <User style={{color: '#949ba4'}} /> : <Hash style={{color: '#949ba4'}} />}
              <h2 style={{margin: 0}}>
                {activeTab === 'announcements' ? 'Governorate & Date' : 
                 activeTab.startsWith('DM_') ? `محادثة خاصة: ${getDMName(activeTab)}` : 
                 `${currentUser.project} Aqaba`}
              </h2>
            </div>
            
            <div 
              className="messages-area" 
              style={{ overflowY: 'auto', paddingBottom: '20px', padding: '20px' }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            >
              {messages.filter(m => m.room === activeTab).map((msg, i) => {
                const reactionsObj = msg.reactions ? JSON.parse(msg.reactions) : {};
                const hasReactions = Object.keys(reactionsObj).length > 0;
                let seenList = [];
                try { seenList = JSON.parse(msg.seenBy || '[]'); } catch(e) {}
                if (seenList.length === 0 && msg.status === 'seen') seenList = ['مجهول (نظام قديم)'];

                const isMyMessage = msg.sender === currentUser.name;

                return (
                <div key={msg.id || ('msg-' + i)} className="message" style={{ display: 'flex', justifyContent: isMyMessage ? 'flex-end' : 'flex-start', direction: 'ltr', gap: '7px', marginBottom: '15px', position: 'relative' }}>
                  <div className="avatar" style={{ width: '30px', height: '30px', borderRadius: '43%', backgroundColor: '#5865f2', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', flexShrink: 0, overflow: 'hidden' }}>
                    {msg.avatar ? <img src={msg.avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (msg.sender || "?").substring(0, 2).toUpperCase()}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '70%', alignItems: isMyMessage ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      backgroundColor: isMyMessage ? theme.msgOut : theme.msgIn,
                      padding: '8px 12px',
                      borderRadius: isMyMessage ? '15px 15px 0 10px' : '5px 15px 12px 0',
                      boxShadow: '0 1px 4px rgba(0, 0, 0, 0.1)',
                      position: 'relative'
                    }}>
                      
                      {!isMyMessage && (
                        <div style={{ color: '#53bdeb', fontWeight: 'bold', fontSize: '13px', marginBottom: '4px' }}>
                          {msg.sender || "مجهول"}
                        </div>
                      )}

                      {msg.replyTo && typeof msg.replyTo === 'object' && (
                        <div style={{ background: isThemeDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)', padding: '6px 12px', borderRadius: '4px', borderLeft: isMyMessage ? 'none' : '4px solid #53bdeb', borderRight: isMyMessage ? '4px solid #53bdeb' : 'none', marginBottom: '4px', fontSize: '12px', color: theme.msgText }}>
                          <strong>{msg.replyTo?.sender || "رسالة"}:</strong> {msg.replyTo?.text?.substring(0,50) || "مرفق"}...
                        </div>
                      )}

                      {(!msg.fileName?.startsWith('voice_')) && (
                        <p style={{ color: theme.msgText, margin: '0', fontSize: '15px', lineHeight: '1.4', wordWrap: 'break-word', whiteSpace: 'pre-wrap' }}>
                          {msg.text || ""}
                        </p>
                      )}
                      
                      {msg.fileUrl && (
                        <div style={{ marginTop: msg.fileName?.startsWith('voice_') ? '0' : '8px' }}>
                          {msg.fileType?.startsWith('image/') ? (
                            <img src={msg.fileUrl} onClick={() => setZoomedImage(msg.fileUrl)} style={{ maxWidth: '100%', borderRadius: '8px', cursor: 'zoom-in' }} title="اضغط للتكبير" />
                          ) : msg.fileType?.startsWith('video/') ? (
                            <video src={msg.fileUrl} controls style={{ maxWidth: '100%', borderRadius: '8px' }} />
                          ) : msg.fileType?.startsWith('audio/') ? (
                            <audio 
                              src={msg.fileUrl} 
                              controls 
                              preload="metadata"
                              onLoadedMetadata={(e) => {
                                if (e.target.duration === Infinity || isNaN(e.target.duration)) {
                                  e.target.currentTime = 1e101; 
                                  e.target.ontimeupdate = () => {
                                    e.target.ontimeupdate = null;
                                    e.target.currentTime = 0;
                                  };
                                }
                              }}
                              style={{ height: '45px', borderRadius: '25px', width: '260px', outline: 'none' }} 
                            />
                          ) : (
                            <a href={msg.fileUrl} download={msg.fileName || "file"} style={{ display: 'inline-block', padding: '8px 12px', backgroundColor: isThemeDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', color: theme.msgText, textDecoration: 'none', borderRadius: '4px', fontSize: '13px', fontWeight: 'bold' }}>
                              ⬇️ تنزيل: {msg.fileName || "مرفق"}
                            </a>
                          )}
                        </div>
                      )}

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', marginTop: '4px' }}>
                        <span style={{ color: theme.textMuted, fontSize: '10px' }}>{msg.timestamp || ""}</span>
                        {isMyMessage && (
                          <span style={{ color: seenList.length > 0 ? '#53bdeb' : theme.textMuted, fontSize: '12px', fontWeight: 'bold' }}>
                            {seenList.length > 0 ? '✓✓' : '✓'}
                          </span>
                        )}
                      </div>
                    </div>

                    {hasReactions && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '2px', justifyContent: isMyMessage ? 'flex-end' : 'flex-start' }}>
                        {Object.entries(reactionsObj).map(([emoji, users]) => (
                          <div key={emoji} onClick={() => toggleReaction(msg.id, emoji)} style={{ background: users.includes(currentUser.name) ? 'rgba(83, 189, 235, 0.2)' : theme.bgSidebar, border: users.includes(currentUser.name) ? '1px solid #53bdeb' : '1px solid transparent', padding: '2px 6px', borderRadius: '12px', fontSize: '12px', color: theme.textMain, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }} title={users.join(', ')}>
                            <span>{emoji}</span> <span style={{fontSize: '10px'}}>{users.length}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', position: 'relative', flexDirection: isMyMessage ? 'row-reverse' : 'row' }}>
                       <button onClick={() => setReactionPickerId(reactionPickerId === msg.id ? null : msg.id)} style={{ background: 'none', border: 'none', color: '#8696a0', cursor: 'pointer', padding: 0 }} title="إضافة تفاعل">
                         <Smile size={14} />
                       </button>

                       {reactionPickerId === msg.id && (
                         <div style={{ position: 'absolute', bottom: '25px', right: isMyMessage ? '0' : 'auto', left: isMyMessage ? 'auto' : '0', background: theme.bgSidebar, padding: '6px', borderRadius: '8px', display: 'flex', gap: '6px', boxShadow: '0 4px 15px rgba(0,0,0,0.2)', zIndex: 20 }}>
                           {reactionEmojis.map(emoji => (
                             <span key={emoji} onClick={() => toggleReaction(msg.id, emoji)} style={{ cursor: 'pointer', fontSize: '16px', transition: 'transform 0.1s' }} onMouseEnter={e => e.target.style.transform = 'scale(1.2)'} onMouseLeave={e => e.target.style.transform = 'scale(1)'}>
                               {emoji}
                             </span>
                           ))}
                         </div>
                       )}

                       <button onClick={() => setReplyingTo(msg)} style={{ background: 'none', border: 'none', color: '#8696a0', cursor: 'pointer', padding: 0 }} title="رد">
                         <MessageSquare size={14} />
                       </button>

                       {isMyMessage && (
                         <div style={{ position: 'relative' }}>
                           <button onClick={() => setViewSeenById(viewSeenById === msg.id ? null : msg.id)} style={{ background: 'none', border: 'none', color: seenList.length > 0 ? '#53bdeb' : '#8696a0', cursor: 'pointer', padding: 0 }} title="مين شافها">
                             <Eye size={14} />
                           </button>

                           {viewSeenById === msg.id && (
                             <div style={{ position: 'absolute', bottom: '25px', right: '0', background: theme.bgSidebar, padding: '8px', borderRadius: '8px', border: `1px solid ${theme.border}`, minWidth: '120px', zIndex: 30, boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
                               <div style={{ color: theme.textMain, fontSize: '11px', fontWeight: 'bold', borderBottom: `1px solid ${theme.border}`, paddingBottom: '4px', marginBottom: '4px' }}>👀 تمت مشاهدتها من:</div>
                               {seenList.length > 0 ? seenList.map(name => (
                                 <div key={name} style={{ color: theme.textMuted, fontSize: '12px', marginTop: '2px' }}>• {name}</div>
                               )) : (
                                 <div style={{ color: '#f28b82', fontSize: '11px', marginTop: '2px' }}>لم يراها أحد بعد</div>
                               )}
                             </div>
                           )}
                         </div>
                       )}

                       {(currentUser.role === 'manager' || isMyMessage) && (
                         <button onClick={() => handleDeleteMessage(msg.id)} style={{ background: 'none', border: 'none', color: '#8696a0', cursor: 'pointer', padding: 0 }} onMouseEnter={(e) => e.currentTarget.style.color = '#f28b82'} onMouseLeave={(e) => e.currentTarget.style.color = '#8696a0'} title="حذف">
                           <Trash2 size={14} />
                         </button>
                       )}
                    </div>
                  </div>
                </div>
              )})}
              
              {typingUsers.length > 0 && (
                <div style={{ padding: '4px 16px', color: '#00a884', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  ✍️ {typingUsers.join(', ')} يكتب الآن...
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            <div className="input-area" style={{ backgroundColor: theme.inputArea, borderTop: 'none', padding: '10px 20px' }}>
              {replyingTo && (
                <div style={{ background: theme.bgSidebar, padding: '8px 15px', borderRight: '4px solid #00a884', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '13px', color: theme.textMain }}>الرد على <strong>{replyingTo.sender}</strong></div>
                  <X size={14} style={{ cursor: 'pointer', color: '#8696a0' }} onClick={() => setReplyingTo(null)} />
                </div>
              )}

              {showEmojiPicker && (
                <div style={{ position: 'absolute', bottom: '80px', background: theme.bgSidebar, padding: '10px', borderRadius: '8px', display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px', boxShadow: '0 4px 15px rgba(0,0,0,0.2)', zIndex: 10 }}>
                  {commonEmojis.map(emoji => (
                    <span key={emoji} onClick={() => addEmoji(emoji)} style={{ fontSize: '20px', cursor: 'pointer', textAlign: 'center' }}>{emoji}</span>
                  ))}
                </div>
              )}

              {activeTab === 'announcements' && currentUser.role === 'employee' ? (
                <div className="input-box" style={{justifyContent: 'center', color: '#ffffff', fontSize: '11px', background: '#831616', padding: '10px', borderRadius: '8px', textAlign: 'center'}}>🔒 هذه القناة مخصصة للإعلانات الإدارية فقط</div>
              ) : (
                <form className="input-glow-wrapper" onSubmit={sendMessage}>
                  <div className="input-glow-bg"></div>
                  
                  <div className="input-glow-content">
                    <input type="file" multiple ref={chatFileInputRef} style={{ display: 'none' }} onChange={handleChatFileUpload} />
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <button type="button" className="action-btn-clean" onClick={() => chatFileInputRef.current.click()} disabled={isUploading} style={{ padding: '0 4px' }}>
                        {isUploading ? <span style={{fontSize: '14px', color: '#00a884'}}>⏳</span> : <Paperclip size={18} style={{color: '#8696a0'}} />}
                      </button>

                      <button type="button" className="action-btn-clean" onClick={() => setShowEmojiPicker(!showEmojiPicker)} style={{ padding: '0 4px' }}>
                        <Smile size={18} style={{ color: showEmojiPicker ? '#00a884' : '#8696a0' }} />
                      </button>

                      <button 
                        type="button" 
                        onClick={isRecording ? stopRecording : startRecording}
                        className={`action-btn-clean ${isRecording ? 'mic-active' : 'mic-idle'}`}
                        style={{ 
                          width: '32px', 
                          height: '32px', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          transition: 'all 0.3s',
                          marginLeft: '2px',
                          cursor: 'pointer'
                        }}
                      >
                        {isRecording ? <Square size={14} fill="white" /> : <Mic size={18} style={{ color: theme.textMuted }} />}
                      </button>
                    </div>
                    
                    <input 
                      type="text" 
                      value={inputMessage} 
                      onChange={handleInputChange} 
                      placeholder={isUploading ? "جاري الرفع..." : "اكتب رسالتك..."} 
                      disabled={isUploading} 
                      style={{ background: 'transparent', color: theme.textMain, flex: 1, border: 'none', padding: '0 10px', fontSize: '14px' }} 
                    />
                    
                    <button 
                      type="submit" 
                      disabled={isUploading} 
                      style={{ 
                        background: 'linear-gradient(135deg, #0edce3, #cef200)', 
                        borderRadius: '50%', 
                        width: '32px', 
                        height: '32px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        boxShadow: '0 2px 10px rgba(14, 220, 227, 0.4)',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease-in-out',
                        flexShrink: 0
                      }}
                      onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                    >
                      <Send size={16} color="#1e1f22" style={{ transform: 'rotate(-20deg)', marginLeft: '2px' }} /> 
                    </button>
                  </div>
                </form>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;