const firebaseConfig = window.firebaseConfig || {};
const firebaseReady = typeof firebase !== "undefined"
  && Object.values(firebaseConfig).every((value) => typeof value === "string" && value.trim());
const auth = firebaseReady ? firebase.auth() : null;
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
    "auth/invalid-credential": "اسم المستخدم أو كلمة المرور غير صحيحة.",
    "auth/wrong-password": "كلمة المرور الحالية غير صحيحة.",
    "auth/requires-recent-login": "سجّل الدخول مجددًا ثم حاول تغيير بيانات الدخول.",
    "auth/credential-already-in-use": "هذا البريد مستخدم في حساب آخر.",
    "auth/weak-password": "اختر كلمة مرور أقوى (6 أحرف على الأقل).",
    "auth/too-many-requests": "محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا.",
    "auth/network-request-failed": "تعذر الاتصال. تحقق من اتصال الإنترنت.",
    "permission-denied": "لا تملك صلاحية تنفيذ هذا الإجراء.",
    "firestore/permission-denied": "لا تملك صلاحية تنفيذ هذا الإجراء.",
    "functions/already-exists": "اسم المستخدم أو البريد الإلكتروني مستخدم مسبقًا.",
    "functions/unauthenticated": "اسم المستخدم أو كلمة المرور غير صحيحة.",
    "functions/invalid-argument": "تحقق من البيانات المدخلة."
  };
  return messages[error.code] || error.message || "حدث خطأ غير متوقع. حاول مرة أخرى.";
}

function requireFirebase() {
  if (firebaseReady) return true;
  showToast("Firebase غير مضبوط. أضف إعدادات مشروعك إلى firebase-config.js أولًا.");
  return false;
}

function openVolunteerSettings() {
  if (!currentUser || !currentProfile) {
    showToast("سجّل الدخول أولًا لفتح إعدادات حسابك.");
    return;
  }
  document.getElementById("volunteerProfileName").value = currentProfile.displayName || "";
  document.getElementById("volunteerProfileEmail").value = currentUser.email || currentProfile.email || "";
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
    currentUser = null;
    currentProfile = null;
    document.querySelector(".public-login-button").textContent = "تسجيل الدخول";
    document.getElementById("myTeamJoinRequests").replaceChildren();
    document.getElementById("myTeamJoinRequestsEmpty").textContent = "سجّل الدخول لمتابعة طلبات انضمامك.";
    document.getElementById("myTeamJoinRequestsEmpty").hidden = false;
    document.getElementById("myNotifications").replaceChildren();
    document.getElementById("myNotificationsEmpty").textContent = "سجّل الدخول لعرض تنبيهاتك.";
    document.getElementById("myNotificationsEmpty").hidden = false;
    document.getElementById("myCertificates").replaceChildren();
    document.getElementById("myCertificatesEmpty").textContent = "سجّل الدخول لعرض شهاداتك.";
    document.getElementById("myCertificatesEmpty").hidden = false;
    document.getElementById("volunteerSettingsDialog").close();
    showToast("تم تسجيل الخروج.");
  } catch (error) {
    showToast(firebaseError(error));
  }
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
      openVolunteerSettings();
      return;
    }
    openAuth(button.dataset.auth);
  });
});

document.getElementById("closeVolunteerSettings").addEventListener("click", () => {
  document.getElementById("volunteerSettingsDialog").close();
});
document.getElementById("volunteerSettingsLogout").addEventListener("click", signOutVolunteer);
document.getElementById("volunteerSettingsDialog").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
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

function setSignedInHeader(user, profile) {
  currentUser = user;
  currentProfile = profile;
  document.querySelector(".public-login-button").textContent = "إعدادات الحساب";
  loadMyRecords(user).catch((error) => {
    showToast(`تعذر تحميل سجلات حسابك: ${firebaseError(error)}`);
  });
}

async function loadMyRecords(user) {
  await Promise.all([
    loadMyTeamJoinRequests(user),
    loadMyNotifications(user),
    loadMyCertificates(user)
  ]);
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
  rows.replaceChildren();
  empty.hidden = requests.length > 0;
  empty.textContent = "لا توجد طلبات انضمام حتى الآن.";
  requests.forEach((item) => {
    const request = item.data();
    const row = document.createElement("tr");
    const teamId = document.createElement("td");
    teamId.textContent = request.teamId;
    const status = document.createElement("td");
    status.textContent = request.status === "pending"
      ? "قيد المراجعة"
      : request.status === "accepted" ? "مقبول" : "مرفوض";
    const date = document.createElement("td");
    date.textContent = request.createdAt?.toDate?.().toLocaleDateString("ar-SA") || "—";
    row.append(teamId, status, date);
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
    type.textContent = notification.type === "warning" ? "تحذير" : "تنبيه";
    const message = document.createElement("td");
    message.textContent = notification.message;
    const date = document.createElement("td");
    date.textContent = notification.createdAt?.toDate?.().toLocaleDateString("ar-SA") || "—";
    row.append(type, message, date);
    rows.append(row);
  });
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
  rows.replaceChildren();
  empty.hidden = certificates.length > 0;
  empty.textContent = "لا توجد شهادات مسجلة.";
  certificates.forEach((item) => {
    const certificate = item.data();
    const row = document.createElement("tr");
    const initiative = document.createElement("td");
    initiative.textContent = certificate.initiativeId;
    const hours = document.createElement("td");
    hours.textContent = String(certificate.hours || 0);
    const linkCell = document.createElement("td");
    if (typeof certificate.certificateUrl === "string" && /^https:\/\//i.test(certificate.certificateUrl)) {
      const link = document.createElement("a");
      link.href = certificate.certificateUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = certificate.certificateNumber || "عرض الشهادة";
      linkCell.append(link);
    } else {
      linkCell.textContent = certificate.certificateNumber || "—";
    }
    row.append(initiative, hours, linkCell);
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
  const button = form.querySelector("button[type=submit]");
  const teamId = document.getElementById("teamJoinId").value.trim();
  button.disabled = true;
  try {
    const profile = await db.collection("volunteers").doc(currentUser.uid).get();
    if (!profile.exists || profile.data().role !== "volunteer") {
      showToast("طلب الانضمام متاح لحسابات المتطوعين فقط.");
      return;
    }
    const pending = await db.collection("teamJoinRequests")
      .where("volunteerUid", "==", currentUser.uid)
      .get();
    if (pending.docs.some((request) => request.data().teamId === teamId && request.data().status === "pending")) {
      showToast("لديك طلب قيد المراجعة لهذا الفريق.");
      return;
    }
    await db.collection("teamJoinRequests").add({
      teamId,
      volunteerUid: currentUser.uid,
      volunteerName: profile.data().displayName,
      status: "pending",
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    form.reset();
    showToast("تم إرسال طلب الانضمام لقائد الفريق.");
    await loadMyRecords(currentUser);
  } catch (error) {
    showToast(firebaseError(error));
  } finally {
    button.disabled = false;
  }
});

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
  const username = document.getElementById("registerUsername").value.trim();
  const email = document.getElementById("registerEmail").value.trim();
  const password = document.getElementById("registerPassword").value;
  if (name.length < 2 || name.length > 100 || !/^[A-Za-z0-9._-]{3,32}$/.test(username)) {
    showToast("تحقق من الاسم واسم المستخدم. اسم المستخدم من 3 إلى 32 خانة.");
    return;
  }
  try {
    const result = await functions.httpsCallable("completeVolunteerSignup")({
      displayName: name,
      username,
      email,
      password
    });
    const credential = await auth.signInWithCustomToken(result.data.customToken);
    setSignedInHeader(credential.user, { displayName: name, email, username: result.data.username, role: "volunteer" });
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
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;
  try {
    const result = await functions.httpsCallable("usernameSignIn")({
      username,
      password,
      apiKey: firebaseConfig.apiKey
    });
    const credential = await auth.signInWithCustomToken(result.data.customToken);
    const profile = await db.collection("volunteers").doc(credential.user.uid).get();
    if (!profile.exists) {
      await auth.signOut();
      showToast("هذا الحساب غير مسجل كمتطوع. تواصل مع إدارة المنصة.");
      return;
    }
    const profileData = profile.data();
    profileData.displayName = profileData.displayName || credential.user.displayName || "متطوع";
    currentProfile = profileData;
    setSignedInHeader(credential.user, profileData);
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

document.getElementById("volunteerProfileForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requireFirebase() || !currentUser || !currentProfile) return;
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  const displayName = document.getElementById("volunteerProfileName").value.trim();
  const gender = document.getElementById("volunteerProfileGender").value;
  const nationality = document.getElementById("volunteerProfileNationality").value.trim();
  if (displayName.length < 2 || displayName.length > 100 || nationality.length > 80) {
    showToast("تحقق من الاسم والجنسية قبل الحفظ.");
    return;
  }

  button.disabled = true;
  try {
    await db.collection("volunteers").doc(currentUser.uid).update({
      displayName,
      email: currentUser.email,
      gender: gender || firebase.firestore.FieldValue.delete(),
      nationality: nationality || firebase.firestore.FieldValue.delete()
    });
    currentProfile = { ...currentProfile, displayName, email: currentUser.email, gender, nationality };
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
  details.append(location, hours);
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
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(date);
}

async function loadPublishedInitiatives() {
  if (!firebaseReady) return;
  try {
    const snapshot = await db.collection("initiatives")
      .where("published", "==", true)
      .where("status", "==", "open")
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
    const initiatives = snapshot.docs.sort((left, right) =>
      String(left.data().date || "").localeCompare(String(right.data().date || ""))
    );
    initiatives.forEach((initiativeSnapshot, index) => {
      grid.append(renderPublishedInitiative(initiativeSnapshot, index));
    });
  } catch (error) {
    const grid = document.getElementById("publicInitiativeGrid");
    grid.replaceChildren();
    const failure = document.createElement("p");
    failure.className = "public-empty-state";
    failure.textContent = "تعذر تحميل الفرص حاليًا. حاول تحديث الصفحة بعد قليل.";
    grid.append(failure);
    showToast(`تعذر تحميل المبادرات من Firebase: ${firebaseError(error)}`);
  }
}

if (firebaseReady) {
  auth.onAuthStateChanged(async (user) => {
    if (!user || currentUser?.uid === user.uid) return;
    try {
      const profile = await db.collection("volunteers").doc(user.uid).get();
      if (profile.exists) setSignedInHeader(user, profile.data());
    } catch (error) {
      showToast(firebaseError(error));
    }
  });
  loadPublishedInitiatives();
} else {
  document.getElementById("firebaseSetupNotice").hidden = false;
}
