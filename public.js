const firebaseConfig = window.firebaseConfig || {};
const firebaseReady = typeof firebase !== "undefined"
  && Object.values(firebaseConfig).every((value) => typeof value === "string" && value.trim());
const auth = firebaseReady ? firebase.auth() : null;
if (auth && typeof auth.setPersistence === "function") {
  try {
    auth.setPersistence(firebase.auth.Auth?.Persistence?.LOCAL || "local").catch(() => {});
  } catch (error) {}
}
const db = firebaseReady ? firebase.firestore() : null;
const functions = firebaseReady ? firebase.app().functions("us-central1") : null;
const publicSite = document.getElementById("publicSite");
const authScreen = document.getElementById("authScreen");
const authTitle = document.getElementById("authTitle");
const authSubtitle = document.querySelector(".auth-subtitle");
const toast = document.getElementById("toast");
let currentUser = null;
let currentProfile = null;
let pendingInitiative = null;
let publicTeams = null;
let publicInitiatives = [];
let myParticipationRequests = [];
let participationLoadToken = 0;
let showAllInitiatives = false;
let nonVolunteerNoticeShown = false;
let toastTimer;

const ARABIC_MONTH_NAMES = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

function formatArabicDate(date) {
  return `${date.getDate()} ${ARABIC_MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

function formatDateValue(value) {
  if (!value) return "—";
  const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : formatArabicDate(date);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 3500);
}

function setFormBusy(form, isBusy, busyLabel) {
  const button = form?.querySelector('button[type="submit"]');
  if (!button) return;
  if (isBusy) {
    button.dataset.idleLabel = button.textContent;
    button.textContent = busyLabel;
    button.disabled = true;
    form.setAttribute("aria-busy", "true");
    return;
  }
  if (button.dataset.idleLabel) button.textContent = button.dataset.idleLabel;
  delete button.dataset.idleLabel;
  button.disabled = false;
  form.removeAttribute("aria-busy");
}

function firebaseError(error) {
  const messages = {
    "auth/email-already-in-use": "هذا البريد مسجل مسبقًا. جرّب تسجيل الدخول.",
    "auth/invalid-email": "تحقق من صيغة البريد الإلكتروني.",
    "auth/invalid-credential": "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
    "auth/user-not-found": "لا يوجد حساب بهذا البريد الإلكتروني.",
    "auth/user-disabled": "هذا الحساب موقوف. تواصل مع إدارة المنصة.",
    "auth/operation-not-allowed": "تسجيل الدخول بالبريد الإلكتروني غير مفعّل في إعدادات Firebase.",
    "auth/wrong-password": "كلمة المرور الحالية غير صحيحة.",
    "auth/requires-recent-login": "سجّل الدخول مجددًا ثم حاول تغيير بيانات الدخول.",
    "auth/credential-already-in-use": "هذا البريد مستخدم في حساب آخر.",
    "auth/weak-password": "اختر كلمة مرور أقوى (6 أحرف على الأقل).",
    "auth/too-many-requests": "محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا.",
    "auth/network-request-failed": "تعذر الاتصال. تحقق من اتصال الإنترنت.",
    "permission-denied": "لا تملك صلاحية تنفيذ هذا الإجراء.",
    "firestore/permission-denied": "لا تملك صلاحية تنفيذ هذا الإجراء.",
    "signup/profile-denied": "تعذر حفظ بيانات الحساب. تأكد من نشر قواعد Firestore ثم حاول مجددًا.",
    "signup/username-taken": "اسم المستخدم مستخدم مسبقًا. اختر اسمًا آخر.",
    "functions/already-exists": "اسم المستخدم أو البريد الإلكتروني مستخدم مسبقًا.",
    "functions/unauthenticated": "اسم المستخدم أو كلمة المرور غير صحيحة.",
    "functions/invalid-argument": "تحقق من البيانات المدخلة.",
    "functions/internal": "تعذر إكمال العملية حاليًا. استخدم البريد الإلكتروني أو تواصل مع إدارة المنصة.",
    internal: "تعذر إكمال العملية حاليًا. استخدم البريد الإلكتروني أو تواصل مع إدارة المنصة.",
    "functions/not-found": "الدخول باسم المستخدم غير مفعّل حاليًا. استخدم بريدك الإلكتروني المسجل.",
    "functions/failed-precondition": "لم تكتمل تهيئة الحسابات بعد. تواصل مع إدارة المنصة.",
    "functions/deadline-exceeded": "استغرق الطلب وقتًا أطول من المتوقع. حاول مرة أخرى.",
    "functions/unavailable": "الخدمة غير متاحة مؤقتًا. تحقق من الاتصال وحاول لاحقًا.",
    "functions/permission-denied": "لا تملك صلاحية تنفيذ هذا الإجراء.",
    "functions/resource-exhausted": "تعذر إكمال العملية الآن. حاول لاحقًا أو تواصل مع إدارة المنصة."
  };
  if (messages[error?.code]) return messages[error.code];
  if (!error?.code && typeof error?.message === "string" && /[\u0600-\u06FF]/.test(error.message)) {
    return error.message;
  }
  return "حدث خطأ غير متوقع. حاول مرة أخرى أو تواصل مع إدارة المنصة.";
}

function isValidPhone(value) {
  return /^[+\d][\d\s()-]{6,19}$/.test(value);
}

function isVolunteerProfile(profile) {
  return !profile?.role || profile.role === "volunteer";
}

function requireFirebase() {
  if (firebaseReady) return true;
  showToast("Firebase غير مضبوط. أضف إعدادات مشروعك إلى firebase-config.js أولًا.");
  return false;
}

function updateAuthUi() {
  const signedIn = Boolean(currentUser);
  document.querySelectorAll(".public-login-button").forEach((button) => {
    button.textContent = signedIn ? "حسابي" : "تسجيل الدخول";
  });
  document.querySelectorAll(".public-auth-actions .public-register-button, .public-nav-auth .public-register-button")
    .forEach((button) => {
      button.hidden = signedIn;
    });

  [
    [document.getElementById("heroPrimaryCta"), "ابدأ رحلتك التطوعية", "استكشف الفرص المتاحة"],
    [document.getElementById("bannerPrimaryCta"), "أنشئ حساب متطوع", "تصفح الفرص المتاحة"]
  ].forEach(([button, guestLabel, memberLabel]) => {
    if (!button) return;
    if (!button.dataset.guestLabel) button.dataset.guestLabel = guestLabel;
    button.dataset.auth = signedIn ? "explore" : "register";
    button.innerHTML = `${signedIn ? memberLabel : button.dataset.guestLabel} <span>←</span>`;
  });

  document.getElementById("memberRecords").hidden = !signedIn;
  document.getElementById("memberGuestNote").hidden = signedIn;
}

function clearMemberRecords() {
  ["myTeamJoinRequests", "myNotifications", "myCertificates"].forEach((id) => {
    document.getElementById(id).replaceChildren();
  });
  document.getElementById("myTeamJoinRequestsEmpty").hidden = false;
  document.getElementById("myTeamJoinRequestsEmpty").textContent = "لا توجد طلبات انضمام حتى الآن.";
  document.getElementById("myNotificationsEmpty").hidden = false;
  document.getElementById("myNotificationsEmpty").textContent = "لا توجد تنبيهات أو تحذيرات.";
  document.getElementById("myCertificatesEmpty").hidden = false;
  document.getElementById("myCertificatesEmpty").textContent = "لا توجد شهادات مسجلة.";
}

function showSignedOutState() {
  currentUser = null;
  currentProfile = null;
  participationLoadToken += 1;
  myParticipationRequests = [];
  document.getElementById("loginForm").reset();
  document.getElementById("registerForm").reset();
  updateAuthUi();
  clearMemberRecords();
  applyInitiativeButtonStates();
}

function closePublicMenu() {
  const nav = document.getElementById("publicNav");
  const button = document.getElementById("publicMenuButton");
  nav.classList.remove("is-open");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-label", "فتح قائمة التنقل");
}

function togglePublicMenu() {
  const nav = document.getElementById("publicNav");
  const button = document.getElementById("publicMenuButton");
  const opening = !nav.classList.contains("is-open");
  nav.classList.toggle("is-open", opening);
  button.setAttribute("aria-expanded", String(opening));
  button.setAttribute("aria-label", opening ? "إغلاق قائمة التنقل" : "فتح قائمة التنقل");
}

document.getElementById("publicMenuButton").addEventListener("click", (event) => {
  event.stopPropagation();
  togglePublicMenu();
});

document.getElementById("publicNav").addEventListener("click", (event) => {
  if (event.target.closest("a, button")) closePublicMenu();
});

document.addEventListener("click", (event) => {
  const nav = document.getElementById("publicNav");
  const button = document.getElementById("publicMenuButton");
  if (!nav.classList.contains("is-open")) return;
  if (!nav.contains(event.target) && !button.contains(event.target)) closePublicMenu();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closePublicMenu();
});

window.addEventListener("resize", () => {
  if (window.innerWidth > 960) closePublicMenu();
});

const publicSectionViews = ["opportunities", "how-it-works", "teamJoinSection", "about"];

function applyPublicView({ scroll = false } = {}) {
  const hash = window.location.hash.slice(1);
  const active = publicSectionViews.includes(hash) ? hash : "home";
  document.getElementById("publicSite").classList.toggle("is-section-view", active !== "home");
  document.getElementById("home").classList.toggle("is-section-view", active !== "home");
  publicSectionViews.forEach((sectionId) => {
    document.getElementById(sectionId)?.classList.toggle("is-section-active", sectionId === active);
  });
  document.querySelectorAll('.public-nav a[href^="#"], .footer-nav a[href^="#"]').forEach((link) => {
    const target = link.getAttribute("href").slice(1);
    if (target === active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  if (scroll) window.scrollTo(0, 0);
}

function openPublicSection(sectionId) {
  if (sectionId === "home") {
    window.history.pushState(null, "", window.location.pathname);
  } else {
    window.history.pushState(null, "", `#${sectionId}`);
  }
  applyPublicView({ scroll: true });
}

document.addEventListener("click", (event) => {
  if (document.getElementById("publicSite").hidden) return;
  const link = event.target.closest('a[href^="#"]');
  if (!link || !link.closest("#publicSite")) return;
  const sectionId = link.getAttribute("href").slice(1);
  if (sectionId !== "home" && !publicSectionViews.includes(sectionId)) return;
  event.preventDefault();
  openPublicSection(sectionId);
  closePublicMenu();
});

window.addEventListener("hashchange", () => applyPublicView());

applyPublicView();

async function loadPublicTeams() {
  const select = document.getElementById("teamJoinSelect");
  if (!firebaseReady) return;
  select.disabled = true;
  select.replaceChildren(new Option("جارٍ تحميل الفرق...", ""));
  try {
    try {
      const result = await functions.httpsCallable("listPublicTeams")({});
      publicTeams = Array.isArray(result.data.teams) ? result.data.teams : [];
    } catch (functionError) {
      const snapshot = await db.collection("teams").orderBy("name").get();
      publicTeams = snapshot.docs.map((doc) => ({ id: doc.id, name: doc.data().name || "فريق" }));
    }
    select.replaceChildren(new Option(
      publicTeams.length ? "اختر اسم الفريق" : "لا توجد فرق متاحة حاليًا",
      ""
    ));
    publicTeams.forEach((team) => {
      const option = new Option(team.name, team.id);
      select.add(option);
    });
    select.disabled = publicTeams.length === 0;
  } catch (error) {
    publicTeams = null;
    select.replaceChildren(new Option("تعذر تحميل الفرق. أعد تحميل الصفحة.", ""));
    select.disabled = true;
    console.error(error);
    showToast("تعذر تحميل أسماء الفرق حاليًا. حاول تحديث الصفحة.");
  }
}

async function loadPublicTeamNames() {
  if (publicTeams === null) await loadPublicTeams();
  return new Map((publicTeams || []).map((team) => [team.id, team.name]));
}

function openVolunteerSettings() {
  if (!currentUser || !currentProfile) {
    showToast("سجّل الدخول أولًا لفتح إعدادات حسابك.");
    return;
  }
  document.getElementById("volunteerProfileName").value = currentProfile.displayName || "";
  document.getElementById("volunteerProfileEmail").value = currentUser.email || currentProfile.email || "";
  document.getElementById("volunteerProfilePhone").value = currentProfile.phone || "";
  document.getElementById("volunteerProfileGender").value = currentProfile.gender || "";
  document.getElementById("volunteerProfileNationality").value = currentProfile.nationality || "";
  document.getElementById("volunteerUsername").value = currentProfile.username || "";
  document.getElementById("volunteerNewUsername").value = currentProfile.username || "";
  document.getElementById("volunteerUsernamePassword").value = "";
  document.getElementById("volunteerCurrentPassword").value = "";
  document.getElementById("volunteerNewPassword").value = "";
  document.getElementById("volunteerSettingsDialog").showModal();
}

async function signOutVolunteer() {
  if (!auth) return;
  try {
    await auth.signOut();
    document.getElementById("volunteerSettingsDialog").close();
    showSignedOutState();
    showToast("تم تسجيل الخروج.");
  } catch (error) {
    showToast(firebaseError(error));
  }
}

function openAuth(mode = "login", initiativeId = null) {
  if (initiativeId) pendingInitiative = initiativeId;
  publicSite.hidden = true;
  authScreen.hidden = false;
  closePublicMenu();
  const registering = mode === "register";
  document.getElementById("registerForm").hidden = !registering;
  document.getElementById("loginForm").hidden = registering;
  authTitle.textContent = registering ? "انضم إلى منصة الوحدة التطوعية" : "أهلًا بعودتك";
  authSubtitle.textContent = registering
    ? "أنشئ حساب متطوع وابدأ رحلتك في صناعة الأثر."
    : "سجّل دخولك لمتابعة فرصك ومشاركاتك التطوعية.";
  window.scrollTo(0, 0);
  window.setTimeout(() => {
    const target = registering ? document.getElementById("registerName") : document.getElementById("loginUsername");
    target?.focus({ preventScroll: true });
  }, 60);
}

function showPublicSite() {
  authScreen.hidden = true;
  publicSite.hidden = false;
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-auth]");
  if (!button) return;
  const action = button.dataset.auth;
  if (action === "explore") {
    openPublicSection("opportunities");
    return;
  }
  if (currentUser) {
    openVolunteerSettings();
    return;
  }
  openAuth(action);
});

document.getElementById("closeVolunteerSettings").addEventListener("click", () => {
  document.getElementById("volunteerSettingsDialog").close();
});
document.getElementById("volunteerSettingsLogout").addEventListener("click", signOutVolunteer);
document.getElementById("volunteerSettingsDialog").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});

function returnToPublicHome() {
  pendingInitiative = null;
  showPublicSite();
  window.history.replaceState(null, "", window.location.pathname);
  applyPublicView();
  window.scrollTo(0, 0);
}

document.getElementById("authHomeButton").addEventListener("click", (event) => {
  event.preventDefault();
  returnToPublicHome();
  document.querySelector(".public-login-button")?.focus({ preventScroll: true });
});

document.getElementById("authBrandHome").addEventListener("click", (event) => {
  event.preventDefault();
  returnToPublicHome();
});
document.getElementById("registerTab").addEventListener("click", () => openAuth("register"));
document.getElementById("loginTab").addEventListener("click", () => openAuth("login"));

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !authScreen.hidden) {
    pendingInitiative = null;
    showPublicSite();
    window.scrollTo(0, 0);
  }
});

function setSignedInHeader(user, profile) {
  currentUser = user;
  currentProfile = profile || {};
  nonVolunteerNoticeShown = false;
  updateAuthUi();
  loadMyRecords(user).catch((error) => {
    showToast(`تعذر تحميل سجلات حسابك: ${firebaseError(error)}`);
  });
  loadMyParticipationRequests(user).catch((error) => {
    showToast(`تعذر تحميل طلبات مشاركتك: ${firebaseError(error)}`);
  });
}

async function loadMyRecords(user) {
  const results = await Promise.allSettled([
    loadMyTeamJoinRequests(user),
    loadMyNotifications(user),
    loadMyCertificates(user)
  ]);
  if (results.some((result) => result.status === "rejected")) {
    throw results.find((result) => result.status === "rejected").reason;
  }
}

async function loadMyParticipationRequests(user) {
  if (!firebaseReady || !user) return;
  const token = ++participationLoadToken;
  const snapshot = await db.collection("participationRequests")
    .where("volunteerUid", "==", user.uid)
    .get();
  if (token !== participationLoadToken) return;
  myParticipationRequests = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  applyInitiativeButtonStates();
}

async function loadMyTeamJoinRequests(user) {
  if (!firebaseReady || !user) return;
  const rows = document.getElementById("myTeamJoinRequests");
  const empty = document.getElementById("myTeamJoinRequestsEmpty");
  const snapshot = await db.collection("teamJoinRequests")
    .where("volunteerUid", "==", user.uid)
    .get();
  const requests = snapshot.docs.sort((a, b) =>
    (b.data().createdAt?.toMillis?.() || 0) - (a.data().createdAt?.toMillis?.() || 0)
  );
  const needsTeamNames = requests.some((item) => !item.data().teamName);
  const teamNames = needsTeamNames ? await loadPublicTeamNames() : new Map();
  rows.replaceChildren();
  empty.hidden = requests.length > 0;
  empty.textContent = "لا توجد طلبات انضمام حتى الآن.";
  requests.forEach((item) => {
    const request = item.data();
    const row = document.createElement("tr");
    const teamName = document.createElement("td");
    teamName.textContent = request.teamName || teamNames.get(request.teamId) || "فريق";
    const status = document.createElement("td");
    const statusBadge = document.createElement("span");
    const statusKey = ["pending", "accepted", "rejected"].includes(request.status) ? request.status : "pending";
    statusBadge.className = `record-badge record-badge-${statusKey}`;
    statusBadge.textContent = statusKey === "pending" ? "قيد المراجعة" : statusKey === "accepted" ? "مقبول" : "مرفوض";
    status.append(statusBadge);
    const date = document.createElement("td");
    date.textContent = formatDateValue(request.createdAt);
    row.append(teamName, status, date);
    rows.append(row);
  });
}

async function loadMyNotifications(user) {
  const rows = document.getElementById("myNotifications");
  const empty = document.getElementById("myNotificationsEmpty");
  const snapshot = await db.collection("notifications")
    .where("recipientUid", "==", user.uid)
    .get();
  const notifications = snapshot.docs.sort((a, b) =>
    (b.data().createdAt?.toMillis?.() || 0) - (a.data().createdAt?.toMillis?.() || 0)
  );
  rows.replaceChildren();
  empty.hidden = notifications.length > 0;
  empty.textContent = "لا توجد تنبيهات أو تحذيرات.";
  notifications.forEach((item) => {
    const notification = item.data();
    const row = document.createElement("tr");
    const type = document.createElement("td");
    const typeBadge = document.createElement("span");
    typeBadge.className = `record-badge ${notification.type === "warning" ? "record-badge-warning" : "record-badge-alert"}`;
    typeBadge.textContent = notification.type === "warning" ? "تحذير" : "تنبيه";
    type.append(typeBadge);
    const message = document.createElement("td");
    message.className = "record-message";
    message.textContent = notification.message;
    const date = document.createElement("td");
    date.textContent = formatDateValue(notification.createdAt);
    row.append(type, message, date);
    rows.append(row);
  });
}

async function findInitiative(initiativeId) {
  return publicInitiatives.find((initiative) => initiative.id === initiativeId) || null;
}

async function resolveInitiativeTitle(initiativeId) {
  const cached = findInitiative(initiativeId);
  if (cached) return cached.title || "مبادرة تطوعية";
  if (!firebaseReady) return "مبادرة تطوعية";
  try {
    const snapshot = await db.collection("initiatives").doc(initiativeId).get();
    if (snapshot.exists) {
      const initiative = { id: snapshot.id, ...snapshot.data() };
      publicInitiatives.push(initiative);
      return initiative.title || "مبادرة تطوعية";
    }
  } catch (error) {
    // Volunteers cannot read archived initiatives; fall back to a neutral label.
  }
  return "مبادرة تطوعية";
}

const certificateStatuses = {
  pending: "قيد المراجعة",
  approved: "معتمد",
  issued: "صادر",
  rejected: "مرفوض"
};

function certificateStatusLabel(certificate) {
  const status = certificate.status || "issued";
  return certificateStatuses[status] || status;
}

async function loadMyCertificates(user) {
  const rows = document.getElementById("myCertificates");
  const empty = document.getElementById("myCertificatesEmpty");
  const snapshot = await db.collection("certificates")
    .where("volunteerUid", "==", user.uid)
    .get();
  const certificates = snapshot.docs.sort((a, b) =>
    (b.data().createdAt?.toMillis?.() || 0) - (a.data().createdAt?.toMillis?.() || 0)
  );
  const titles = new Map(await Promise.all(certificates.map(async (item) => [
    item.id,
    await resolveInitiativeTitle(item.data().initiativeId)
  ])));
  rows.replaceChildren();
  empty.hidden = certificates.length > 0;
  empty.textContent = "لا توجد شهادات مسجلة.";
  certificates.forEach((item) => {
    const certificate = item.data();
    const status = certificate.status || "issued";
    const row = document.createElement("tr");
    const initiative = document.createElement("td");
    initiative.className = "certificate-initiative-cell";
    const initiativeTitle = document.createElement("span");
    initiativeTitle.className = "record-cell-primary";
    initiativeTitle.textContent = titles.get(item.id) || certificate.initiativeTitle || "مبادرة تطوعية";
    initiative.append(initiativeTitle);
    if (certificate.initiativeDate) {
      const initiativeDate = document.createElement("span");
      initiativeDate.className = "record-cell-secondary";
      initiativeDate.textContent = certificate.initiativeDate;
      initiative.append(initiativeDate);
    }
    const hours = document.createElement("td");
    hours.textContent = String(certificate.hours || 0);
    const certificateCell = document.createElement("td");
    certificateCell.className = "certificate-status-cell";
    const badge = document.createElement("span");
    badge.className = `record-badge record-badge-${status}`;
    badge.textContent = certificateStatusLabel(certificate);
    certificateCell.append(badge);
    if (status === "issued" && certificate.certificateNumber) {
      const pdf = document.createElement("button");
      pdf.type = "button";
      pdf.className = "record-pdf-button";
      pdf.textContent = "حفظ PDF";
      pdf.addEventListener("click", () => {
        if (window.NabdCertificates) {
          window.NabdCertificates.open({ ...certificate, status: "issued" });
        }
      });
      certificateCell.append(pdf);
    }
    if (typeof certificate.certificateUrl === "string" && /^https:\/\//i.test(certificate.certificateUrl)) {
      const link = document.createElement("a");
      link.href = certificate.certificateUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "عرض الشهادة";
      certificateCell.append(link);
    }
    if (status === "issued" && certificate.certificateNumber) {
      const number = document.createElement("span");
      number.className = "record-cell-secondary";
      number.textContent = certificate.certificateNumber;
      certificateCell.append(number);
    }
    row.append(initiative, hours, certificateCell);
    rows.append(row);
  });
}

document.getElementById("teamJoinForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requireFirebase()) return;
  if (!currentUser) {
    showToast("سجّل الدخول بحساب المتطوع ثم أرسل طلب الانضمام.");
    openAuth("login");
    return;
  }
  const form = event.currentTarget;
  const teamSelect = document.getElementById("teamJoinSelect");
  const teamId = teamSelect.value;
  const teamName = teamSelect.selectedOptions[0]?.textContent?.trim();
  if (!teamId || !teamName) {
    showToast("اختر اسم الفريق أولًا.");
    return;
  }
  setFormBusy(form, true, "جارٍ إرسال الطلب...");
  try {
    const profile = await db.collection("volunteers").doc(currentUser.uid).get();
    if (!profile.exists || profile.data().role !== "volunteer") {
      showToast("طلب الانضمام متاح لحسابات المتطوعين فقط.");
      return;
    }
    if (profile.data().teamId) {
      showToast("أنت عضو في فريق بالفعل. تواصل مع إدارة المنصة لتغيير فريقك.");
      return;
    }
    const pending = await db.collection("teamJoinRequests")
      .where("volunteerUid", "==", currentUser.uid)
      .get();
    if (pending.docs.some((request) => request.data().status === "pending")) {
      showToast("لديك طلب انضمام قيد المراجعة. انتظر رد قائد الفريق.");
      return;
    }
    await db.collection("teamJoinRequests").add({
      teamId,
      teamName,
      volunteerUid: currentUser.uid,
      volunteerName: profile.data().displayName,
      status: "pending",
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    form.reset();
    showToast(`تم إرسال طلب الانضمام إلى فريق «${teamName}».`);
    await loadMyRecords(currentUser);
  } catch (error) {
    showToast(firebaseError(error));
  } finally {
    setFormBusy(form, false);
  }
});

function initiativeName(id) {
  return findInitiative(id)?.title || "مبادرة تطوعية";
}

function participationFor(initiativeId) {
  return myParticipationRequests
    .filter((request) => request.initiativeId === initiativeId)
    .sort((left, right) =>
      (right.createdAt?.toMillis?.() || 0) - (left.createdAt?.toMillis?.() || 0)
    )[0] || null;
}

function applyInitiativeButtonStates() {
  document.querySelectorAll("#publicInitiativeGrid [data-initiative-id]").forEach((card) => {
    const button = card.querySelector(".initiative-join-button");
    if (!button || button.dataset.busy === "true") return;
    const request = currentUser ? participationFor(card.dataset.initiativeId) : null;
    button.classList.remove("is-pending", "is-accepted", "is-rejected");
    button.disabled = false;
    if (!request) {
      button.innerHTML = "سجّل للمشاركة <span>←</span>";
      return;
    }
    if (request.status === "accepted") {
      button.disabled = true;
      button.classList.add("is-accepted");
      button.textContent = "أنت مشارك في هذه الفرصة";
    } else if (request.status === "rejected") {
      button.classList.add("is-rejected");
      button.innerHTML = "إعادة التسجيل بعد الرفض <span>←</span>";
    } else {
      button.disabled = true;
      button.classList.add("is-pending");
      button.textContent = "طلبك قيد المراجعة";
    }
  });
}

async function createParticipationRequest(user, initiativeId, button = null) {
  if (!requireFirebase()) return;
  const existing = participationFor(initiativeId);
  if (existing && existing.status !== "rejected") {
    showToast(existing.status === "accepted"
      ? "أنت مشارك في هذه الفرصة بالفعل."
      : "لديك طلب قيد المراجعة لهذه الفرصة.");
    applyInitiativeButtonStates();
    return;
  }
  if (button) {
    button.dataset.busy = "true";
    button.disabled = true;
    button.textContent = "جارٍ إرسال الطلب...";
  }
  try {
    const [profileSnapshot, requestsSnapshot] = await Promise.all([
      db.collection("volunteers").doc(user.uid).get(),
      db.collection("participationRequests").where("volunteerUid", "==", user.uid).get()
    ]);
    if (!profileSnapshot.exists) {
      showToast("حساب المتطوع غير مكتمل. تواصل مع إدارة المنصة.");
      return;
    }
    participationLoadToken += 1;
    myParticipationRequests = requestsSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    const duplicate = participationFor(initiativeId);
    if (duplicate && duplicate.status !== "rejected") {
      applyInitiativeButtonStates();
      showToast(duplicate.status === "accepted"
        ? "أنت مشارك في هذه الفرصة بالفعل."
        : "لديك طلب قيد المراجعة لهذه الفرصة.");
      return;
    }
    const requestPayload = {
      initiativeId,
      initiativeName: initiativeName(initiativeId),
      volunteerUid: user.uid,
      volunteerName: profileSnapshot.data().displayName,
      volunteerEmail: user.email,
      status: "pending",
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (profileSnapshot.data().phone) requestPayload.volunteerPhone = profileSnapshot.data().phone;
    await db.collection("participationRequests").add(requestPayload);
    myParticipationRequests.push({
      initiativeId,
      initiativeName: initiativeName(initiativeId),
      status: "pending",
      createdAt: { toMillis: () => Date.now() }
    });
    applyInitiativeButtonStates();
    showToast("تم إرسال طلب المشاركة، وستصلك النتيجة بعد مراجعته.");
  } catch (error) {
    showToast(firebaseError(error));
  } finally {
    if (button) delete button.dataset.busy;
    applyInitiativeButtonStates();
  }
}

document.getElementById("publicInitiativeGrid").addEventListener("click", async (event) => {
  const button = event.target.closest(".initiative-join-button");
  if (!button || button.disabled) return;
  const initiativeId = button.closest("[data-initiative-id]")?.dataset.initiativeId;
  if (!initiativeId) return;
  const user = currentUser || auth?.currentUser || null;
  if (user) {
    await createParticipationRequest(user, initiativeId, button);
    return;
  }
  openAuth("login", initiativeId);
});

document.getElementById("registerForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requireFirebase()) return;
  const form = event.currentTarget;
  const name = document.getElementById("registerName").value.trim();
  const username = document.getElementById("registerUsername").value.trim();
  const email = document.getElementById("registerEmail").value.trim();
  const phone = document.getElementById("registerPhone").value.trim();
  const password = document.getElementById("registerPassword").value;
  if (name.length < 2 || name.length > 100 || !/^[A-Za-z0-9._-]{3,32}$/.test(username)) {
    showToast("تحقق من الاسم واسم المستخدم. اسم المستخدم من 3 إلى 32 خانة.");
    return;
  }
  if (!isValidPhone(phone)) {
    showToast("أدخل رقم جوال صحيحًا (7 إلى 20 رقمًا).");
    return;
  }
  setFormBusy(form, true, "جارٍ إنشاء حسابك...");
  let credential = null;
  let profileSaved = false;
  try {
    credential = await auth.createUserWithEmailAndPassword(email, password);
    await credential.user.updateProfile({ displayName: name });

    const uid = credential.user.uid;
    const createdAt = firebase.firestore.FieldValue.serverTimestamp();
    let usernameSaved = true;
    let usernameAvailable = null;
    try {
      const mapping = await db.collection("loginUsernames").doc(username.toLowerCase()).get();
      usernameAvailable = !mapping.exists;
    } catch (error) {
      if (error.code !== "permission-denied") throw error;
    }
    if (usernameAvailable === false) {
      throw Object.assign(new Error("Username is already taken."), { code: "signup/username-taken" });
    }

    try {
      const batch = db.batch();
      batch.set(db.collection("volunteers").doc(uid), {
        uid, displayName: name, email, phone, username, role: "volunteer", createdAt
      });
      batch.set(db.collection("loginUsernames").doc(username.toLowerCase()), { uid, email });
      await batch.commit();
    } catch (error) {
      if (error.code !== "permission-denied") throw error;
      // Older rules may not allow the username fields yet; keep signup working.
      usernameSaved = false;
      try {
        await db.collection("volunteers").doc(uid).set({
          uid, displayName: name, email, phone, role: "volunteer", createdAt
        });
      } catch (profileError) {
        try {
          await db.collection("volunteers").doc(uid).set({
            uid, displayName: name, email, role: "volunteer", createdAt
          });
        } catch (legacyProfileError) {
          throw Object.assign(new Error("Profile could not be saved."), { code: "signup/profile-denied" });
        }
      }
    }

    profileSaved = true;
    form.reset();
    setSignedInHeader(credential.user, {
      uid, displayName: name, email, phone, username, role: "volunteer", createdAt: new Date()
    });
    authScreen.hidden = true;
    publicSite.hidden = false;
    showToast(usernameSaved
      ? "تم إنشاء حساب المتطوع بنجاح. يمكنك الدخول لاحقًا ببريدك الإلكتروني."
      : "تم إنشاء حسابك بنجاح. سجّل الدخول ببريدك الإلكتروني.");
    if (pendingInitiative) {
      const requestedInitiative = pendingInitiative;
      pendingInitiative = null;
      await createParticipationRequest(credential.user, requestedInitiative);
    }
  } catch (error) {
    if (credential && !profileSaved) {
      try {
        await credential.user.delete();
      } catch (cleanupError) {
        console.error(cleanupError);
      }
      try {
        await auth.signOut();
      } catch (signOutError) {
        console.error(signOutError);
      }
    }
    showToast(firebaseError(error));
  } finally {
    setFormBusy(form, false);
  }
});

document.getElementById("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requireFirebase()) return;
  const form = event.currentTarget;
  const identifier = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;
  setFormBusy(form, true, "جارٍ تسجيل الدخول...");
  try {
    let credential;
    if (identifier.includes("@")) {
      credential = await auth.signInWithEmailAndPassword(identifier, password);
    } else {
      const result = await functions.httpsCallable("usernameSignIn")({
        username: identifier,
        password,
        apiKey: firebaseConfig.apiKey
      });
      credential = await auth.signInWithCustomToken(result.data.customToken);
    }
    const profile = await db.collection("volunteers").doc(credential.user.uid).get();
    if (!profile.exists) {
      await auth.signOut();
      document.getElementById("loginPassword").value = "";
      showToast("هذا الحساب غير مسجل كمتطوع. تواصل مع إدارة المنصة.");
      return;
    }
    if (!isVolunteerProfile(profile.data())) {
      await auth.signOut();
      document.getElementById("loginPassword").value = "";
      showToast("هذا الحساب إداري. سجّل الدخول من بوابة الإدارة بدلًا من الموقع العام.");
      return;
    }
    const profileData = profile.data();
    profileData.role = "volunteer";
    profileData.displayName = profileData.displayName || credential.user.displayName || "متطوع";
    profileData.email = profileData.email || credential.user.email;
    profileData.username = profileData.username || (identifier.includes("@") ? "" : identifier);
    currentProfile = profileData;
    setSignedInHeader(credential.user, profileData);
    authScreen.hidden = true;
    publicSite.hidden = false;
    document.getElementById("loginPassword").value = "";
    showToast("تم تسجيل الدخول بنجاح.");
    if (pendingInitiative) {
      const requestedInitiative = pendingInitiative;
      pendingInitiative = null;
      await createParticipationRequest(credential.user, requestedInitiative);
    }
  } catch (error) {
    showToast(firebaseError(error));
  } finally {
    setFormBusy(form, false);
  }
});

document.getElementById("volunteerProfileForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requireFirebase() || !currentUser || !currentProfile) return;
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  const displayName = document.getElementById("volunteerProfileName").value.trim();
  const phone = document.getElementById("volunteerProfilePhone").value.trim();
  const gender = document.getElementById("volunteerProfileGender").value;
  const nationality = document.getElementById("volunteerProfileNationality").value.trim();
  if (displayName.length < 2 || displayName.length > 100 || nationality.length > 80) {
    showToast("تحقق من الاسم والجنسية قبل الحفظ.");
    return;
  }
  if (phone && !isValidPhone(phone)) {
    showToast("أدخل رقم جوال صحيحًا (7 إلى 20 رقمًا).");
    return;
  }

  button.disabled = true;
  try {
    await db.collection("volunteers").doc(currentUser.uid).update({
      displayName,
      email: currentUser.email,
      phone: phone || firebase.firestore.FieldValue.delete(),
      gender: gender || firebase.firestore.FieldValue.delete(),
      nationality: nationality || firebase.firestore.FieldValue.delete()
    });
    currentProfile = { ...currentProfile, displayName, email: currentUser.email, phone, gender, nationality };
    try {
      await currentUser.updateProfile({ displayName });
    } catch (error) {
      showToast(`تم حفظ بيانات الملف الشخصي، لكن تعذر تحديث اسم العرض في الحساب: ${firebaseError(error)}`);
      return;
    }
    showToast("تم حفظ بياناتك الشخصية.");
  } catch (error) {
    showToast(firebaseError(error));
  } finally {
    button.disabled = false;
  }
});

async function reauthenticateVolunteer(password) {
  const credential = firebase.auth.EmailAuthProvider.credential(currentUser.email, password);
  await currentUser.reauthenticateWithCredential(credential);
}

document.getElementById("volunteerUsernameForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requireFirebase() || !currentUser || !currentProfile) return;
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  const currentPassword = document.getElementById("volunteerUsernamePassword").value;
  const newUsername = document.getElementById("volunteerNewUsername").value.trim();
  if (!/^[A-Za-z0-9._-]{3,32}$/.test(newUsername)) {
    showToast("اسم المستخدم من 3 إلى 32 خانة، ويقبل الأحرف الإنجليزية والأرقام و . و _ و -.");
    return;
  }

  button.disabled = true;
  try {
    await reauthenticateVolunteer(currentPassword);
    const result = await functions.httpsCallable("setAccountUsername")({ username: newUsername });
    currentProfile = { ...currentProfile, username: result.data.username };
    document.getElementById("volunteerUsername").value = result.data.username;
    form.reset();
    document.getElementById("volunteerNewUsername").value = result.data.username;
    showToast("تم تغيير اسم المستخدم بنجاح.");
  } catch (error) {
    showToast(firebaseError(error));
  } finally {
    button.disabled = false;
  }
});

document.getElementById("volunteerPasswordForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requireFirebase() || !currentUser) return;
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  const currentPassword = document.getElementById("volunteerCurrentPassword").value;
  const newPassword = document.getElementById("volunteerNewPassword").value;
  if (newPassword.length < 6) {
    showToast("كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف.");
    return;
  }
  button.disabled = true;
  try {
    await reauthenticateVolunteer(currentPassword);
    await currentUser.updatePassword(newPassword);
    form.reset();
    showToast("تم تغيير كلمة المرور بنجاح.");
  } catch (error) {
    showToast(firebaseError(error));
  } finally {
    button.disabled = false;
  }
});

function renderPublishedInitiative(initiative, index) {
  const article = document.createElement("article");
  const themes = [["cover-green", "✳"], ["cover-blue", "♡"], ["cover-orange", "✦"]];
  const [theme, symbol] = themes[index % themes.length];
  article.className = "public-initiative-card";
  article.dataset.initiativeId = initiative.id;
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
  date.textContent = formatInitiativeDate(initiative.date);
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
  const spots = document.createElement("span");
  spots.textContent = initiative.requiredVolunteers
    ? `◎ ${Number(initiative.requiredVolunteers)} متطوع`
    : "◎ مقاعد متاحة";
  details.append(location, hours, spots);
  const joinButton = document.createElement("button");
  joinButton.type = "button";
  joinButton.className = "initiative-join-button";
  joinButton.innerHTML = "سجّل للمشاركة <span>←</span>";
  content.append(meta, title, description, details, joinButton);
  article.append(cover, content);
  return article;
}

function formatInitiativeDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value || "يحدد لاحقًا";
  }
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : formatArabicDate(date);
}

function renderInitiativeGrid() {
  const grid = document.getElementById("publicInitiativeGrid");
  const browseButton = document.getElementById("browseAllButton");
  grid.replaceChildren();
  if (!publicInitiatives.length) {
    const empty = document.createElement("div");
    empty.className = "public-empty-state";
    empty.innerHTML = '<span class="empty-state-icon" aria-hidden="true">✳</span><strong>الفرص القادمة تظهر هنا</strong><p>سيتم عرض المبادرات التطوعية المعتمدة بمجرد نشرها من فريق المنصة.</p>';
    grid.append(empty);
    if (browseButton) browseButton.hidden = true;
    return;
  }
  const visible = showAllInitiatives ? publicInitiatives : publicInitiatives.slice(0, 3);
  visible.forEach((initiative, index) => {
    grid.append(renderPublishedInitiative(initiative, index));
  });
  if (browseButton) {
    browseButton.hidden = publicInitiatives.length <= 3;
    browseButton.setAttribute("aria-expanded", String(showAllInitiatives));
    browseButton.innerHTML = showAllInitiatives
      ? 'عرض أقل <span>↑</span>'
      : `عرض جميع المبادرات (${publicInitiatives.length}) <span>←</span>`;
  }
  applyInitiativeButtonStates();
}

function renderInitiativeSkeletons() {
  const grid = document.getElementById("publicInitiativeGrid");
  grid.replaceChildren();
  for (let index = 0; index < 3; index += 1) {
    const skeleton = document.createElement("div");
    skeleton.className = "public-initiative-card skeleton-card";
    skeleton.setAttribute("aria-hidden", "true");
    skeleton.innerHTML = '<div class="skeleton-block skeleton-cover"></div><div class="public-card-content"><div class="skeleton-block skeleton-line skeleton-line-short"></div><div class="skeleton-block skeleton-line"></div><div class="skeleton-block skeleton-line skeleton-line-medium"></div><div class="skeleton-block skeleton-button"></div></div>';
    grid.append(skeleton);
  }
}

async function loadPublishedInitiatives() {
  if (!firebaseReady) return;
  renderInitiativeSkeletons();
  try {
    const snapshot = await db.collection("initiatives")
      .where("published", "==", true)
      .where("status", "==", "open")
      .get();
    publicInitiatives = snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .sort((left, right) => String(left.date || "").localeCompare(String(right.date || "")));
    renderInitiativeGrid();
  } catch (error) {
    document.getElementById("publicInitiativeGrid").innerHTML = '<div class="public-empty-state"><span class="empty-state-icon" aria-hidden="true">!</span><strong>تعذر تحميل الفرص</strong><p>حاول تحديث الصفحة بعد قليل، أو تواصل مع فريق المنصة.</p></div>';
    document.getElementById("browseAllButton").hidden = true;
    console.error(error);
    showToast("تعذر تحميل الفرص حاليًا. حاول تحديث الصفحة.");
  }
}

document.getElementById("browseAllButton")?.addEventListener("click", (event) => {
  showAllInitiatives = !showAllInitiatives;
  renderInitiativeGrid();
  if (!showAllInitiatives) {
    event.currentTarget.closest(".public-section-heading")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

if (firebaseReady) {
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      if (currentUser) showSignedOutState();
      return;
    }
    if (currentUser?.uid === user.uid) return;
    try {
      const profile = await db.collection("volunteers").doc(user.uid).get();
      if (!profile.exists || !isVolunteerProfile(profile.data())) {
        if (currentUser) showSignedOutState();
        if (!nonVolunteerNoticeShown) {
          nonVolunteerNoticeShown = true;
          showToast(profile.exists
            ? "هذا الحساب إداري. استخدم بوابة الإدارة للوصول إلى لوحة التحكم."
            : "هذا الحساب غير مسجل كمتطوع. تواصل مع إدارة المنصة.");
        }
        return;
      }
      setSignedInHeader(user, profile.data());
    } catch (error) {
      showToast(firebaseError(error));
    }
  });
  loadPublishedInitiatives();
  loadPublicTeams();
} else {
  document.getElementById("firebaseSetupNotice").hidden = false;
}
