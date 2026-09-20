
const admin = require("firebase-admin");
const express = require("express");

// ===============================
// 🔥 INICIALIZACIÓN DE FIREBASE
// ===============================

let db = null;
let firebaseInitialized = false;

try {
  const serviceAccount = require("./database_key.json");

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  db = admin.firestore();
  firebaseInitialized = true;

  console.log("☁️ Firebase: Conectado e inicializado correctamente.");

} catch (err) {
  console.error("❌ Error al conectar con Firebase:");
  console.error(err.message);
}

// ===============================
// ⚙️ CONFIGURACIÓN DEL SERVIDOR
// ===============================

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const vitrinaActual = process.env.VITRINA_ID
  ? parseInt(process.env.VITRINA_ID)
  : (process.argv[2] ? parseInt(process.argv[2]) : 1);

// Estado del dispositivo
let lastPostTime = Date.now();
let isDeviceOnline = false;

// ===============================
// 🐕 WATCHDOG DEL DISPOSITIVO
// ===============================

setInterval(async () => {

  if (
    firebaseInitialized &&
    isDeviceOnline &&
    (Date.now() - lastPostTime > 15000)
  ) {

    try {

      isDeviceOnline = false;

      const statusRef = db
        .collection("estado")
        .doc("dispositivo");

      await statusRef.set({
        online: false,
        lastSeen: admin.firestore.Timestamp.now()
      }, { merge: true });

      console.log(
        "🐕 Watchdog: ESP32 fuera de línea."
      );

    } catch (err) {

      console.error(
        "⚠️ Error en Watchdog:",
        err.message
      );

    }
  }

}, 5000);

// ===============================
// 📥 ENDPOINT PARA EL ESP32
// ===============================

app.post("/api/datos", async (req, res) => {

  try {

    const {
      suelo1,
      suelo2,
      humedad,
      temperatura
    } = req.body;

    // Validación de datos
    if (
      suelo1 === undefined ||
      suelo2 === undefined ||
      humedad === undefined ||
      temperatura === undefined
    ) {

      console.warn(
        "⚠️ Datos incompletos:",
        req.body
      );

      return res.status(400).send(
        "Faltan parámetros en el JSON de telemetría."
      );

    }

    const s1 = parseInt(suelo1);
    const s2 = parseInt(suelo2);
    const aire = parseInt(humedad);
    const temp = parseInt(temperatura);

    // Actualizar última recepción
    lastPostTime = Date.now();

    const hora = new Date().toLocaleTimeString(
      "es-CO",
      { timeZone: "America/Bogota" }
    );

    console.log(
      `[${hora}] 📥 POST Recibido | ` +
      `Suelo1: ${s1} | Suelo2: ${s2} | ` +
      `Hum: ${aire}% | Temp: ${temp}°C`
    );

    // ===============================
    // ☁️ GUARDAR EN FIREBASE
    // ===============================

    if (firebaseInitialized) {

      try {

        const registroRef = db
          .collection("telemetria")
          .doc();

        await registroRef.set({

          id_vitrina: vitrinaActual,
          suelo1: s1,
          suelo2: s2,
          aire_hum: aire,
          aire_temp: temp,
          fecha: admin.firestore.Timestamp.now()

        });

        console.log(
          "☁️ Firebase: Telemetría sincronizada."
        );

        // Actualizar estado online
        const statusRef = db
          .collection("estado")
          .doc("dispositivo");

        await statusRef.set({

          online: true,
          lastSeen: admin.firestore.Timestamp.now(),
          vitrina_activa: vitrinaActual

        }, { merge: true });

        isDeviceOnline = true;

      } catch (firebaseError) {

        console.error(
          "⚠️ Error guardando en Firebase:",
          firebaseError.message
        );

      }

    }

    // ===============================
    // 🚰 CONSULTAR ESTADO DE LA BOMBA
    // ===============================

    let bombaRespuesta = "OFF";

    if (firebaseInitialized) {

      try {

        const bombaDoc = await db
          .collection("estado")
          .doc("bomba")
          .get();

        if (bombaDoc.exists) {

          const data = bombaDoc.data();

          if (data && data.encendida === true) {
            bombaRespuesta = "ON";
          }

        }

      } catch (bombaError) {

        console.error(
          "⚠️ Error consultando bomba:",
          bombaError.message
        );

      }

    }

    // Responder al ESP32
    res.send(bombaRespuesta);

  } catch (error) {

    console.error(
      "❌ Error procesando POST:",
      error.message
    );

    res.status(500).send(
      "Error interno del servidor puente."
    );

  }

});

// ===============================
// 🚀 INICIAR SERVIDOR
// ===============================

app.listen(PORT, "0.0.0.0", () => {

  console.log(
    `🚀 Servidor Express activo en puerto ${PORT}`
  );

  console.log(
    `🚀 Monitoreo activo - Vitrina: ${vitrinaActual}`
  );

  console.log(
    "────────────────────────────────────────────"
  );

});