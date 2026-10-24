const firebaseConfig = window.firebaseConfig || {};
const firebaseReady = typeof firebase !== "undefined"
  && Object.values(firebaseConfig).every((value) => typeof value === "string" && value.trim());
const auth = firebaseReady ? firebase.auth() : null;
const db = firebaseReady ? firebase.firestore() : null;
const publicSite = document.getElementById("publicSite");
const authScreen = document.getElementById("authScreen");
const authTitle = document.getElementById("authTitle");
const authSubtitle = document.querySelector(".auth-subtitle");
const toast = document.getElementById("toast");
let currentUser = null;
let pendingInitiative = null;
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 3500);
}

function firebaseError(error) {
  const messages = {
    "auth/email-already-in-use": "هذا البريد مسجل مسبقًا. جرّب تسجيل الدخول.",
    "auth/invalid-email": "تحقق من صيغة البريد الإلكتروني.",
    "auth/invalid-credential": "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
    "auth/weak-password": "اختر كلمة مرور أقوى (6 أحرف على الأقل).",
    "auth/too-many-requests": "محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا.",
    "auth/network-request-failed": "تعذر الاتصال. تحقق من اتصال الإنترنت.",
    "permission-denied": "لا تملك صلاحية تنفيذ هذا الإجراء.",
    "firestore/permission-denied": "لا تملك صلاحية تنفيذ هذا الإجراء."
  };
  return messages[error.code] || error.message || "حدث خطأ غير متوقع. حاول مرة أخرى.";
}

function requireFirebase() {
  if (firebaseReady) return true;
  showToast("Firebase غير مضبوط. أضف إعدادات مشروعك إلى firebase-config.js أولًا.");
  return false;
}

function openAuth(mode = "login", initiativeId = null) {
  pendingInitiative = initiativeId;
  publicSite.hidden = true;
  authScreen.hidden = false;
  const registering = mode === "register";
  document.getElementById("registerForm").hidden = !registering;
  document.getElementById("loginForm").hidden = registering;
  authTitle.textContent = registering ? "انضم إلى منصة الوحدة التطوعية" : "أهلًا بعودتك";
  authSubtitle.textContent = registering
    ? "أنشئ حساب متطوع وابدأ رحلتك في صناعة الأثر."
    : "سجّل دخولك لمتابعة فرصك ومشاركاتك التطوعية.";
  window.scrollTo(0, 0);
}

document.querySelectorAll("[data-auth]").forEach((button) => {
  button.addEventListener("click", async () => {
    if (currentUser && button.classList.contains("public-login-button")) {
      try {
        await auth.signOut();
        currentUser = null;
        button.textContent = "تسجيل الدخول";
        showToast("تم تسجيل الخروج.");
      } catch (error) {
        showToast(firebaseError(error));
      }
      return;
    }
    openAuth(button.dataset.auth);
  });
});

document.getElementById("authHomeButton").addEventListener("click", (event) => {
  event.preventDefault();
  pendingInitiative = null;
  authScreen.hidden = true;
  publicSite.hidden = false;
  window.history.replaceState(null, "", window.location.pathname);
  window.scrollTo(0, 0);
});
document.getElementById("registerTab").addEventListener("click", () => openAuth("register"));
document.getElementById("loginTab").addEventListener("click", () => openAuth("login"));

function setSignedInHeader(user, name) {
  currentUser = user;
  document.querySelector(".public-login-button").textContent = name ? `أهلًا، ${name}` : "حسابي";
}

function initiativeName(id) {
  const card = [...document.querySelectorAll("[data-initiative-id]")].find((item) => item.dataset.initiativeId === id);
  return card?.querySelector("h3")?.textContent || id;
}

async function createParticipationRequest(user, initiativeId) {
  if (!requireFirebase()) return;
  try {
    const profileSnapshot = await db.collection("volunteers").doc(user.uid).get();
    if (!profileSnapshot.exists) {
      showToast("حساب المتطوع غير مكتمل. تواصل مع إدارة المنصة.");
      return;
    }
    await db.collection("participationRequests").add({
      initiativeId,
      initiativeName: initiativeName(initiativeId),
      volunteerUid: user.uid,
      volunteerName: profileSnapshot.data().displayName,
      volunteerEmail: user.email,
      status: "pending",
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast("تم إرسال طلب المشاركة، وستصلك النتيجة بعد مراجعته.");
  } catch (error) {
    showToast(firebaseError(error));
  }
}

document.getElementById("publicInitiativeGrid").addEventListener("click", async (event) => {
  const button = event.target.closest(".initiative-join-button");
  if (!button) return;
  const initiativeId = button.closest("[data-initiative-id]")?.dataset.initiativeId;
  if (!initiativeId) return;
  if (currentUser) {
    await createParticipationRequest(currentUser, initiativeId);
    return;
  }
  openAuth("login", initiativeId);
});

document.getElementById("registerForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requireFirebase()) return;
  const name = document.getElementById("registerName").value.trim();
  const email = document.getElementById("registerEmail").value.trim();
  const password = document.getElementById("registerPassword").value;
  try {
    const credential = await auth.createUserWithEmailAndPassword(email, password);
    await credential.user.updateProfile({ displayName: name });
    await db.collection("volunteers").doc(credential.user.uid).set({
      uid: credential.user.uid,
      displayName: name,
      email,
      role: "volunteer",
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    setSignedInHeader(credential.user, name);
    authScreen.hidden = true;
    publicSite.hidden = false;
    showToast("تم إنشاء حساب المتطوع بنجاح.");
    if (pendingInitiative) {
      const requestedInitiative = pendingInitiative;
      pendingInitiative = null;
      await createParticipationRequest(credential.user, requestedInitiative);
    }
  } catch (error) {
    showToast(firebaseError(error));
  }
});

document.getElementById("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requireFirebase()) return;
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  try {
    const credential = await auth.signInWithEmailAndPassword(email, password);
    const profile = await db.collection("volunteers").doc(credential.user.uid).get();
    if (!profile.exists) {
      showToast("هذا الحساب غير مسجل كمتطوع. تواصل مع إدارة المنصة.");
      return;
    }
    const displayName = profile.data().displayName || credential.user.displayName || "متطوع";
    setSignedInHeader(credential.user, displayName);
    authScreen.hidden = true;
    publicSite.hidden = false;
    showToast("تم تسجيل الدخول بنجاح.");
    if (pendingInitiative) {
      const requestedInitiative = pendingInitiative;
      pendingInitiative = null;
      await createParticipationRequest(credential.user, requestedInitiative);
    }
  } catch (error) {
    showToast(firebaseError(error));
  }
});

function renderPublishedInitiative(initiativeSnapshot, index) {
  const initiative = initiativeSnapshot.data();
  const article = document.createElement("article");
  const themes = [["cover-green", "✳"], ["cover-blue", "♡"], ["cover-orange", "✦"]];
  const [theme, symbol] = themes[index % themes.length];
  article.className = "public-initiative-card";
  article.dataset.initiativeId = initiativeSnapshot.id;
  article.dataset.category = initiative.category || "تطوع";
  const cover = document.createElement("div");
  cover.className = `initiative-card-cover ${theme}`;
  cover.innerHTML = `<span class="cover-symbol">${symbol}</span><span class="cover-tag"></span><span class="cover-number">${String(index + 1).padStart(2, "0")}</span>`;
  cover.querySelector(".cover-tag").textContent = initiative.category || "تطوع";
  const content = document.createElement("div");
  content.className = "public-card-content";
  const meta = document.createElement("div");
  meta.className = "card-meta";
  const date = document.createElement("span");
  date.textContent = initiative.date || "يحدد لاحقًا";
  const status = document.createElement("span");
  status.className = "available-status";
  status.innerHTML = "<i></i> التسجيل مفتوح";
  meta.append(date, status);
  const title = document.createElement("h3");
  title.textContent = initiative.title || "مبادرة تطوعية";
  const description = document.createElement("p");
  description.textContent = initiative.description || "";
  const details = document.createElement("div");
  details.className = "card-details";
  const location = document.createElement("span");
  location.textContent = `⌖ ${initiative.location || "يحدد لاحقًا"}`;
  const hours = document.createElement("span");
  hours.textContent = `◷ ${Number(initiative.hours) || 0} ساعات`;
  details.append(location, hours);
  const joinButton = document.createElement("button");
  joinButton.type = "button";
  joinButton.className = "initiative-join-button";
  joinButton.innerHTML = "سجّل للمشاركة <span>←</span>";
  content.append(meta, title, description, details, joinButton);
  article.append(cover, content);
  return article;
}

async function loadPublishedInitiatives() {
  if (!firebaseReady) return;
  try {
    const snapshot = await db.collection("initiatives")
      .where("published", "==", true)
      .where("status", "==", "open")
      .orderBy("date", "asc")
      .get();
    const grid = document.getElementById("publicInitiativeGrid");
    grid.replaceChildren();
    if (snapshot.empty) {
      const empty = document.createElement("p");
      empty.className = "public-empty-state";
      empty.textContent = "لا توجد مبادرات منشورة حاليًا. تابعنا لمعرفة الفرص الجديدة.";
      grid.append(empty);
      return;
    }
    snapshot.forEach((initiativeSnapshot, index) => {
      grid.append(renderPublishedInitiative(initiativeSnapshot, index));
    });
  } catch (error) {
    showToast(`تعذر تحميل المبادرات من Firebase: ${firebaseError(error)}`);
  }
}

if (firebaseReady) {
  auth.onAuthStateChanged(async (user) => {
    if (!user || currentUser?.uid === user.uid) return;
    try {
      const profile = await db.collection("volunteers").doc(user.uid).get();
      if (profile.exists) setSignedInHeader(user, profile.data().displayName);
    } catch (error) {
      showToast(firebaseError(error));
    }
  });
  loadPublishedInitiatives();
} else {
  document.getElementById("firebaseSetupNotice").hidden = false;
}
