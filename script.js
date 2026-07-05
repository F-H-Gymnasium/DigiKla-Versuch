// Firebase-Konfiguration initialisieren
const firebaseConfig = {
    apiKey: "AIzaSyA1...",
    authDomain: "digikla-portal.firebaseapp.com",
    projectId: "digikla-portal",
    storageBucket: "digikla-portal.appspot.com",
    messagingSenderId: "12345678",
    appId: "1:12345:web:abcde"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();

// Globale Variablen für Anwendungsstatus
let currentUserUID = null;
let aktuelleRolle = "Lehrer";
let MeinLehrerProfil = { name: "Lade...", kuerzel: "" };
let modalAusgewaehlteKategorie = "Unentschuldigt";

// Auth State Observer
auth.onAuthStateChanged(user => {
    if (user) {
        currentUserUID = user.uid;
        document.getElementById("loginView").style.display = "none";
        document.getElementById("appView").style.display = "block";
        
        db.collection("users").doc(user.uid).get().then(doc => {
            if (doc.exists) {
                const data = doc.data();
                aktuelleRolle = data.rolle || "Lehrer";
                MeinLehrerProfil.name = data.name || "Unbekannter Lehrer";
                MeinLehrerProfil.kuerzel = data.kuerzel || "??";
            }
            
            document.getElementById("angemeldeterUser").innerText = `${MeinLehrerProfil.name} (${MeinLehrerProfil.kuerzel})`;
            document.getElementById("userRolleBadge").innerText = aktuelleRolle;
            
            pruefeAbwesenheitsButtonBerechtigung();

            if(!document.getElementById("aktuellesDatum").value) {
                document.getElementById("aktuellesDatum").value = new Date().toISOString().split('T')[0];
            }
            
            modalSchuelerDropdownBefuellen();
            ladeDashboardMeldungen();
        });
    } else {
        document.getElementById("loginView").style.display = "block";
        document.getElementById("appView").style.display = "none";
    }
});

// BERECHTIGUNGSPRÜFUNG FÜR DEN ROTEN BUTTON
function pruefeAbwesenheitsButtonBerechtigung() {
    const btn = document.getElementById("btnAbwesenheitHinzufuegen");
    if (!btn) return;
    
    if (aktuelleRolle === "Admin" || aktuelleRolle === "Sekretariat") {
        btn.style.display = "block";
        return;
    }
    
    db.collection("klassen").where("klassenleiter", "==", currentUserUID).get().then(snapshot => {
        if (!snapshot.empty) {
            btn.style.display = "block";
        } else {
            btn.style.display = "none";
        }
    }).catch(err => {
        console.error("Fehler bei Berechtigungsprüfung: ", err);
        btn.style.display = "none";
    });
}

// POPUP DIALOG FUNKTIONEN (MODAL CONTROLLER)
function oeffneAbwesenheitModal() {
    document.getElementById("abwesenheitModal").style.display = "flex";
    
    const masterDate = document.getElementById("aktuellesDatum").value;
    document.getElementById("modalDatumStart").value = masterDate;
    document.getElementById("modalDatumEnde").value = masterDate;
    
    setModalStatusKategorie("Unentschuldigt");
    
    if (!document.getElementById("chkModalVorlage").checked) {
        document.getElementById("modalSchuelerSelect").value = "";
        document.getElementById("modalArtSelect").value = "Tag";
        document.getElementById("modalGrundSelect").value = "";
        document.getElementById("modalNotiz").value = "";
        resetStundenCheckboxen();
        anpassenAbwesenheitsartFelder();
    }
}

function schliesseAbwesenheitModal() {
    document.getElementById("abwesenheitModal").style.display = "none";
}

function setModalStatusKategorie(kat) {
    modalAusgewaehlteKategorie = kat;
    document.getElementById("btnStatusUnentschuldigt").classList.remove("active");
    document.getElementById("btnStatusGemeldet").classList.remove("active");
    document.getElementById("btnStatusEntschuldigt").classList.remove("active");

    if(kat === "Unentschuldigt") document.getElementById("btnStatusUnentschuldigt").classList.add("active");
    if(kat === "Gemeldet") document.getElementById("btnStatusGemeldet").classList.add("active");
    if(kat === "Entschuldigt") document.getElementById("btnStatusEntschuldigt").classList.add("active");
}

function anpassenAbwesenheitsartFelder() {
    const art = document.getElementById("modalArtSelect").value;
    document.getElementById("modalBisDatumGroup").style.display = (art === "Zeitraum") ? "flex" : "none";
    document.getElementById("modalStundenGroup").style.display = (art === "Stunden") ? "flex" : "none";
}

function toggleStundenAusOption(src) {
    const numCheckboxes = document.querySelectorAll(".stunde-num-chk");
    if (src.checked) {
        numCheckboxes.forEach(cb => { cb.checked = false; cb.disabled = true; });
    } else {
        numCheckboxes.forEach(cb => { cb.disabled = false; });
    }
}

function resetStundenCheckboxen() {
    document.getElementById("chkStundeAus").checked = false;
    const numCheckboxes = document.querySelectorAll(".stunde-num-chk");
    numCheckboxes.forEach(cb => { cb.checked = false; cb.disabled = false; });
}

function modalSchuelerDropdownBefuellen() {
    const select = document.getElementById("modalSchuelerSelect");
    if(!select) return;
    select.innerHTML = '<option value="">-- Schüler wählen --</option>';
    
    db.collection("schueler").orderBy("name").get().then(snapshot => {
        snapshot.forEach(doc => {
            const data = doc.data();
            let opt = document.createElement("option");
            opt.value = data.name;
            opt.dataset.klasse = data.klasse;
            opt.innerText = `${data.name} (Klasse ${data.klasse})`;
            select.appendChild(opt);
        });
    });
}

// FIX: Behebt den Fehler an Zeile 349 (Sicherer Dom-Zugriff & Listen-Aktualisierung)
function ladeDashboardMeldungen() {
    const listE = document.getElementById("listeEntschuldigt");
    const listG = document.getElementById("listeAbgemeldet");
    const listU = document.getElementById("listeUnentschuldigt");
    
    if(!listE || !listG || !listU) return; // Verhindert Absturz, falls Elemente nicht auf der Seite sind
    
    const heute = document.getElementById("aktuellesDatum").value;
    
    db.collection("abwesenheiten_meldungen")
      .where("datumStart", "<=", heute)
      .get().then(snapshot => {
          listE.innerHTML = "";
          listG.innerHTML = "";
          listU.innerHTML = "";
          
          let countE = 0, countG = 0, countU = 0;
          
          snapshot.forEach(doc => {
              const data = doc.data();
              if (heute <= data.datumEnde) {
                  let li = document.createElement("li");
                  li.innerHTML = `<strong>${data.schueler}</strong> (${data.klasse}) ${data.grund || 'Krank'}`;
                  
                  if(data.kategorie === "Entschuldigt") { listE.appendChild(li); countE++; }
                  if(data.kategorie === "Gemeldet") { listG.appendChild(li); countG++; }
                  if(data.kategorie === "Unentschuldigt") { listU.appendChild(li); countU++; }
              }
          });
          
          if(countE === 0) listE.innerHTML = "<li>Keine Einträge</li>";
          if(countG === 0) listG.innerHTML = "<li>Keine Einträge</li>";
          if(countU === 0) listU.innerHTML = "<li>Keine Einträge</li>";
      });
}

function speichereAbwesenheitAusModal() {
    const schuelerNode = document.getElementById("modalSchuelerSelect");
    const schuelerName = schuelerNode.value;
    
    if(!schuelerName) {
        alert("Bitte wählen Sie zuerst einen Schüler aus!");
        return;
    }
    
    const selectedOpt = schuelerNode.options[schuelerNode.selectedIndex];
    const klasse = selectedOpt.dataset.klasse;
    const art = document.getElementById("modalArtSelect").value;
    const datumStart = document.getElementById("modalDatumStart").value;
    const datumEnde = (art === "Zeitraum") ? document.getElementById("modalDatumEnde").value : datumStart;
    const grund = document.getElementById("modalGrundSelect").value; 
    const notiz = document.getElementById("modalNotiz").value;

    let gewaehlteStunden = [];
    if(art === "Stunden") {
        if (document.getElementById("chkStundeAus").checked) {
            gewaehlteStunden = ["Aus"];
        } else {
            const checkboxes = document.querySelectorAll(".stunde-num-chk:checked");
            checkboxes.forEach(cb => gewaehlteStunden.push(parseInt(cb.value)));
        }
    }

    const abwesenheitsDaten = {
        schueler: schuelerName,
        klasse: klasse,
        kategorie: modalAusgewaehlteKategorie,
        art: art,
        datumStart: datumStart,
        datumEnde: datumEnde,
        stunden: gewaehlteStunden,
        grund: grund || "",
        notiz: notiz,
        erstelltVon: currentUserUID,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };

    db.collection("abwesenheiten_meldungen").add(abwesenheitsDaten).then(() => {
        if (!document.getElementById("chkModalAnpinnen").checked) {
            schliesseAbwesenheitModal();
        }
        ladeDashboardMeldungen();
        if(document.getElementById("detailView").style.display === "block") rendereSchuelerAnwesenheitsListe();
    }).catch(err => {
        alert("Fehler beim Speichern: " + err.message);
    });
}

function datumGeaendert() {
    ladeDashboardMeldungen();
}

function zeigeDashboard() {
    document.getElementById("dashboardView").style.display = "block";
    document.getElementById("klassenbuchView").style.display = "none";
    document.getElementById("detailView").style.display = "none";
}

// Dummy Login-Funktion für Entwicklungszwecke
function login() {
    const email = document.getElementById("loginEmail").value;
    const pass = document.getElementById("loginPassword").value;
    auth.signInWithEmailAndPassword(email, pass).catch(err => {
        document.getElementById("loginError").innerText = err.message;
    });
}
