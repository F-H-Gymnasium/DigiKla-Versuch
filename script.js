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
let AlleLehrerCache = {};
let modalAusgewaehlteKategorie = "Unentschuldigt";

// Auth State Observer
auth.onAuthStateChanged(user => {
    if (user) {
        currentUserUID = user.uid;
        document.getElementById("loginView").style.display = "none";
        document.getElementById("appView").style.display = "block";
        
        // Profildaten laden und danach Ansichten initialisieren
        db.collection("users").doc(user.uid).get().then(doc => {
            if (doc.exists) {
                const data = doc.data();
                aktuelleRolle = data.rolle || "Lehrer";
                MeinLehrerProfil.name = data.name || "Unbekannter Lehrer";
                MeinLehrerProfil.kuerzel = data.kuerzel || "??";
            }
            
            document.getElementById("angemeldeterUser").innerText = `${MeinLehrerProfil.name} (${MeinLehrerProfil.kuerzel})`;
            document.getElementById("userRolleBadge").innerText = aktuelleRolle;
            
            // Berechtigungsprüfung für den roten Abwesenheits-Button ausführen
            pruefeAbwesenheitsButtonBerechtigung();

            if(!document.getElementById("aktuellesDatum").value) {
                document.getElementById("aktuellesDatum").value = new Date().toISOString().split('T')[0];
            }
            
            // Dropdowns & Listen vorbereiten
            modalSchuelerDropdownBefuellen();
            ladeKlassenAuswahlen();
        });
    } else {
        document.getElementById("loginView").style.display = "block";
        document.getElementById("appView").style.display = "none";
    }
});

// ==========================================================================
// BERECHTIGUNGSPRÜFUNG FÜR DEN ROTEN BUTTON
// ==========================================================================
function pruefeAbwesenheitsButtonBerechtigung() {
    const btn = document.getElementById("btnAbwesenheitHinzufuegen");
    
    // Administratoren und Sekretariat dürfen den Button immer sehen
    if (aktuelleRolle === "Admin" || aktuelleRolle === "Sekretariat") {
        btn.style.display = "block";
        return;
    }
    
    // Wenn die Rolle 'Lehrer' ist, prüfen wir ob er in der Datenbank als Klassenleiter eingetragen ist
    db.collection("klassen").where("klassenleiter", "==", currentUserUID).get().then(snapshot => {
        if (!snapshot.empty) {
            btn.style.display = "block"; // Ist Klassenleiter -> anzeigen
        } else {
            btn.style.display = "none";  // Normaler Lehrer ohne Klassenleitung -> ausblenden
        }
    }).catch(err => {
        console.error("Fehler bei Berechtigungsprüfung: ", err);
        btn.style.display = "none";
    });
}

// ==========================================================================
// POPUP DIALOG FUNKTIONEN (MODAL CONTROLLER)
// ==========================================================================
function oeffneAbwesenheitModal() {
    document.getElementById("abwesenheitModal").style.display = "flex";
    
    // Synchronisiere Start- und Enddatum mit dem aktuell gesetzten Hauptdatum
    const masterDate = document.getElementById("aktuellesDatum").value;
    document.getElementById("modalDatumStart").value = masterDate;
    document.getElementById("modalDatumEnde").value = masterDate;
    
    // Setze Standard-Kategorie auf Unentschuldigt (Rot)
    setModalStatusKategorie("Unentschuldigt");
    
    // Falls "Vorlage merken" deaktiviert ist, Formularfelder zurücksetzen
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
    // Bis-Datum anzeigen wenn "Zeitraum" gewählt wurde
    document.getElementById("modalBisDatumGroup").style.display = (art === "Zeitraum") ? "flex" : "none";
    // Stunden-Checker anzeigen wenn "Stunden" gewählt wurde
    document.getElementById("modalStundenGroup").style.display = (art === "Stunden") ? "flex" : "none";
}

function toggleStundenAusOption(src) {
    const numCheckboxes = document.querySelectorAll(".stunde-num-chk");
    if (src.checked) {
        // Wenn "Aus" aktiv ist, werden alle numerischen Stunden deaktiviert
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

// ==========================================================================
// SPEICHERN DER ABWESENHEIT IN FIRESTORE
// ==========================================================================
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

    // JSON Payload für die Datenbank generieren
    const abwesenheitsDaten = {
        schueler: schuelerName,
        klasse: klasse,
        kategorie: modalAusgewaehlteKategorie, // "Unentschuldigt", "Gemeldet", "Entschuldigt"
        art: art,                              // "Tag", "Stunden", "Zeitraum"
        datumStart: datumStart,
        datumEnde: datumEnde,
        stunden: gewaehlteStunden,
        grund: grund || "",                    // "Abgemeldet", "Freistellung schulisch", "Freistellung außerschulisch" oder leer (Krank)
        notiz: notiz,
        erstelltVon: currentUserUID,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };

    db.collection("abwesenheiten_meldungen").add(abwesenheitsDaten).then(() => {
        // Wenn "Anpinnen" (geöffnet lassen) nicht aktiv ist, schließen wir das Modal
        if (!document.getElementById("chkModalAnpinnen").checked) {
            schliesseAbwesenheitModal();
        }
        
        // Ansichten neu laden, um Änderungen sofort anzuzeigen
        if(document.getElementById("dashboardView").style.display === "block") ladeDashboardMeldungen();
        if(document.getElementById("detailView").style.display === "block") rendereSchuelerAnwesenheitsListe();
    }).catch(err => {
        alert("Fehler beim Speichern: " + err.message);
    });
}

// ==========================================================================
// INTERNATIONALE RENDERING-LOGIK FÜR DIE SCHÜLER-ÜBERWACHUNG (BILD 4 & 5)
// ==========================================================================
function rendereSchuelerAnwesenheitsListe() {
    const listContainer = document.getElementById("schuelerDetailListe");
    listContainer.innerHTML = ""; // Clear list
    
    const gewaehlteKlasse = document.getElementById("klassenAuswahl").value;
    const aktuellesDatum = document.getElementById("aktuellesDatum").value;

    // 1. Alle Schüler der Klasse holen
    db.collection("schueler").where("klasse", "==", gewaehlteKlasse).orderBy("name").get().then(schuelerSnap => {
        // 2. Alle Abwesenheitsdaten für diesen Tag laden
        db.collection("abwesenheiten_meldungen")
          .where("klasse", "==", gewaehlteKlasse)
          .where("datumStart", "<=", aktuellesDatum)
          .get().then(abwesenheitenSnap => {
              
              // Verarbeite Treffer (Berücksichtige Zeiträume)
              let abwesenheitenMap = {};
              abwesenheitenSnap.forEach(doc => {
                  const abw = doc.data();
                  if (aktuellesDatum <= abw.datumEnde) {
                      abwesenheitenMap[abw.schueler] = abw;
                  }
              });

              // 3. HTML Liste bauen
              let index = 1;
              schuelerSnap.forEach(sDoc => {
                  const schueler = sDoc.data();
                  const globalAbwesenheit = abwesenheitenMap[schueler.name];
                  
                  let row = document.createElement("li");
                  row.className = "kb-schueler-row";
                  
                  let nameSpan = document.createElement("span");
                  nameSpan.innerText = `${index}. ${schueler.name}`;
                  row.appendChild(nameSpan);
                  
                  let statusBadge = document.createElement("span");
                  
                  if (globalAbwesenheit) {
                      // Wenn ein Grund eingetragen ist (z.B. Abgemeldet, Freistellung) verwenden wir diesen, ansonsten "Krank"
                      let textInBadge = globalAbwesenheit.grund || "Krank";
                      statusBadge.innerText = textInBadge;
                      
                      // Bestimmung der CSS Klasse anhand der gewählten Farbkategorie
                      if (globalAbwesenheit.kategorie === "Gemeldet") {
                          statusBadge.className = "badge-anwesenheit-system badge-system-gemeldet";
                      } else if (globalAbwesenheit.kategorie === "Entschuldigt") {
                          statusBadge.className = "badge-anwesenheit-system badge-system-entschuldigt";
                      } else {
                          statusBadge.className = "badge-anwesenheit-system badge-system-unentschuldigt";
                      }
                  } else {
                      // Standardfall: Keine Abwesenheit gemeldet -> Anwesend
                      statusBadge.innerText = "Anwesend";
                      statusBadge.className = "badge-anwesenheit-system badge-system-entschuldigt";
                      statusBadge.style.opacity = "0.6";
                  }
                  
                  row.appendChild(statusBadge);
                  listContainer.appendChild(row);
                  index++;
              });
        });
    });
}

// Dummy-Funktionen für UI Navigation
function zeigeDashboard() {
    document.getElementById("dashboardView").style.display = "block";
    document.getElementById("klassenbuchView").style.display = "none";
    document.getElementById("detailView").style.display = "none";
    document.getElementById("stundenplanEditorView").style.display = "none";
    document.getElementById("adminPanelView").style.display = "none";
}
function ladeKlassenAuswahlen() {}
function login() {}
function logout() { auth.signOut(); }
