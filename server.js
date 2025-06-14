const express = require("express");
const axios = require("axios");
const fs = require("fs");
const { exec } = require("child_process");
const { promisify } = require("util");

const app = express();
const PORT = process.env.PORT || 3000;

const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = "Mon_Token";
const DEEPL_API_KEY = process.env.DEEPL_API_KEY;

app.use(express.json());

// 🔁 Fonction pour traduire un texte en français avec DeepL
async function traduireTexteVersFrancais(texte) {
  try {
    const response = await axios.post(
      "https://api-free.deepl.com/v2/translate",
      new URLSearchParams({
        auth_key: DEEPL_API_KEY,
        text: texte,
        target_lang: "FR",
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    return response.data.translations[0].text;
  } catch (error) {
    console.error("❌ Erreur de traduction DeepL :", error.message);
    return texte; // Renvoie le texte original si la traduction échoue
  }
}

// ✅ Vérification Webhook Meta
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("Webhook vérifié !");
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(400);
  }
});

// 📥 Réception de message WhatsApp
app.post("/webhook", async (req, res) => {
  const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

  if (message && message.type === "image") {
    const from = message.from;
    const mediaId = message.image.id;

    try {
      // 🔽 1. Récupérer l’URL de l’image
      const mediaResponse = await axios.get(
        `https://graph.facebook.com/v18.0/${mediaId}`,
        {
          headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
        }
      );

      const mediaUrl = mediaResponse.data.url;

      // 🔽 2. Télécharger l’image
      const imagePath = "./temp/image.jpg";
      const imageDownload = await axios.get(mediaUrl, {
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
        responseType: "stream",
      });

      const writer = fs.createWriteStream(imagePath);
      imageDownload.data.pipe(writer);

      writer.on("finish", async () => {
        try {
          // 🔍 3. Exécuter l’OCR
          const { stdout } = await promisify(exec)(`python ocr.py ${imagePath}`);
          fs.unlinkSync(imagePath); // Nettoyage du fichier image

          const texteOCR = stdout.trim().slice(0, 4000); // Sécurité contre les textes trop longs
          const texteTraduit = await traduireTexteVersFrancais(texteOCR);

          // 📤 4. Répondre via WhatsApp
          await axios.post(
            `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
            {
              messaging_product: "whatsapp",
              to: from,
              text: { body: texteTraduit },
            },
            {
              headers: {
                Authorization: `Bearer ${ACCESS_TOKEN}`,
                "Content-Type": "application/json",
              },
            }
          );

          console.log("✅ Message OCR traduit envoyé à l'utilisateur");
        } catch (err) {
          console.error("❌ Erreur OCR ou traduction :", err);
        }
      });
    } catch (e) {
      console.error("❌ Erreur générale :", e.message);
    }

    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
});
